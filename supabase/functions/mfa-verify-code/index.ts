// MFA: Verify email code and mint a real session.
// Looks up the active challenge by hashed token, checks code, marks it consumed,
// then uses the admin API to generate a fresh login link, exchanges it for a
// session, and returns the access/refresh token pair to the client which calls
// supabase.auth.setSession() with them.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const MAX_ATTEMPTS = 5

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const challengeToken = String(body?.challengeToken ?? '').trim()
    const code = String(body?.code ?? '').trim()
    const trustDevice = body?.trustDevice === true

    if (!challengeToken || !/^[0-9]{6}$/.test(code)) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ipRaw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
    const ipHash = ipRaw ? await sha256Hex(ipRaw) : null
    const userAgent = req.headers.get('user-agent') ?? null

    const challengeTokenHash = await sha256Hex(challengeToken)
    const codeHash = await sha256Hex(code)

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: row, error: fetchErr } = await admin
      .from('mfa_email_codes')
      .select('id, user_id, email, code_hash, attempts, consumed_at, expires_at')
      .eq('challenge_token_hash', challengeTokenHash)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchErr || !row) {
      return new Response(JSON.stringify({ error: 'invalid_or_expired' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from('mfa_email_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)
      return new Response(JSON.stringify({ error: 'expired' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await admin.from('mfa_email_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)
      return new Response(JSON.stringify({ error: 'too_many_attempts' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!timingSafeEqualHex(row.code_hash, codeHash)) {
      await admin.from('mfa_email_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id)
      return new Response(JSON.stringify({ error: 'invalid_code' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark consumed first to avoid replay races.
    await admin.from('mfa_email_codes').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)

    // Mint a fresh session by generating a magic link and exchanging it.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: row.email,
    })
    if (linkErr || !linkData) {
      console.error('generateLink failed:', linkErr?.message)
      return new Response(JSON.stringify({ error: 'session_mint_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tokenHash = (linkData as any).properties?.hashed_token
    if (!tokenHash) {
      return new Response(JSON.stringify({ error: 'session_mint_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    })
    if (verifyErr || !verifyData?.session) {
      console.error('verifyOtp failed:', verifyErr?.message)
      return new Response(JSON.stringify({ error: 'session_mint_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Record this sign-in in auth_recent_sessions for the management UI.
    try {
      await admin.from('auth_recent_sessions').insert({
        user_id: row.user_id,
        ip_hash: ipHash,
        user_agent: userAgent,
        device_fingerprint: userAgent ? await sha256Hex(userAgent) : null,
      })
    } catch (e) {
      console.error('auth_recent_sessions insert failed:', (e as Error).message)
    }

    // If the user opted to trust this device, mint a 30-day device token.
    let deviceToken: string | null = null
    if (trustDevice) {
      try {
        const bytes = crypto.getRandomValues(new Uint8Array(32))
        deviceToken = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
        const deviceTokenHash = await sha256Hex(deviceToken)
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        await admin.from('auth_trusted_devices').insert({
          user_id: row.user_id,
          device_token_hash: deviceTokenHash,
          label: userAgent ? userAgent.slice(0, 60) : 'Browser',
          ip_hash: ipHash,
          user_agent: userAgent,
          expires_at: expiresAt,
        })
      } catch (e) {
        console.error('auth_trusted_devices insert failed:', (e as Error).message)
        deviceToken = null
      }
    }

    return new Response(
      JSON.stringify({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
        deviceToken,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('mfa-verify-code unexpected:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
