// MFA: Issue email code
// Called AFTER the client has verified password+email via signInWithPassword.
// We immediately sign that session out, then issue a fresh 6-digit code emailed
// to the user's address. The client must POST the code to mfa-verify-code to
// receive a real session.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CODE_TTL_MINUTES = 10
const MAX_ACTIVE_PER_USER = 3

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateCode(): string {
  // 6-digit, leading zeros preserved
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return n.toString().padStart(6, '0')
}

function generateChallengeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
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
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'missing_credentials' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 1: Verify password using a transient anon client.
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: pwData, error: pwErr } = await anon.auth.signInWithPassword({ email, password })
    if (pwErr || !pwData?.user) {
      return new Response(JSON.stringify({ error: 'invalid_credentials' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // Tear down the temporary session immediately. Real session only after MFA.
    try { await anon.auth.signOut() } catch { /* ignore */ }

    const userId = pwData.user.id
    const userEmail = pwData.user.email ?? email

    // Step 2: Generate code + challenge token.
    const code = generateCode()
    const challengeToken = generateChallengeToken()
    const codeHash = await sha256Hex(code)
    const challengeTokenHash = await sha256Hex(challengeToken)

    // IP / UA hints
    const ipRaw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
    const ipHash = ipRaw ? await sha256Hex(ipRaw) : null
    const userAgent = req.headers.get('user-agent') ?? null

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Invalidate any prior unused codes for this user (single-use, latest-wins).
    await admin
      .from('mfa_email_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('consumed_at', null)

    // Rate limit: at most MAX_ACTIVE_PER_USER issued in the last 10 minutes.
    const recentCutoff = new Date(Date.now() - CODE_TTL_MINUTES * 60_000).toISOString()
    const { count: recent } = await admin
      .from('mfa_email_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', recentCutoff)
    if ((recent ?? 0) >= MAX_ACTIVE_PER_USER) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString()
    const { error: insErr } = await admin.from('mfa_email_codes').insert({
      user_id: userId,
      email: userEmail,
      code_hash: codeHash,
      challenge_token_hash: challengeTokenHash,
      expires_at: expiresAt,
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    if (insErr) {
      console.error('mfa_email_codes insert failed:', insErr.message)
      return new Response(JSON.stringify({ error: 'internal_error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Step 3: Email the code via existing transactional pipeline.
    // NOTE: send-transactional-email has verify_jwt=true. supabase-js
    // functions.invoke() does NOT reliably attach the service-role key as a
    // bearer when no user session exists, which produced 401s and surfaced as
    // "email_send_failed" in the UI. Call via fetch with explicit headers.
    const ipHint = ipRaw ? ipRaw.replace(/\.\d+$/, '.x') : undefined
    const emailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        templateName: 'login-2fa-code',
        recipientEmail: userEmail,
        idempotencyKey: `mfa-${userId}-${challengeTokenHash.slice(0, 16)}`,
        templateData: {
          code,
          expiresInMinutes: CODE_TTL_MINUTES,
          ipHint,
          userAgentHint: userAgent ? userAgent.slice(0, 80) : undefined,
        },
      }),
    })
    if (!emailResp.ok) {
      const errBody = await emailResp.text().catch(() => '')
      console.error('send-transactional-email failed:', emailResp.status, errBody)
      return new Response(JSON.stringify({ error: 'email_send_failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Opportunistic cleanup
    try { await admin.rpc('purge_expired_mfa_codes') } catch { /* ignore */ }

    return new Response(
      JSON.stringify({
        challengeToken,
        expiresAt,
        email: userEmail,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('mfa-issue-code unexpected:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
