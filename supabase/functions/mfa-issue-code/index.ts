// MFA: Issue email code
// Called AFTER the client has verified password+email via signInWithPassword.
// We immediately sign that session out, then issue a fresh 6-digit code emailed
// to the user's address. The client must POST the code to mfa-verify-code to
// receive a real session.

import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'
import { template as login2faCodeTemplate } from '../_shared/transactional-email-templates/login-2fa-code.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SITE_NAME = 'ACTV TRKR'
const SENDER_DOMAIN = 'notify.actvtrkr.com'
const FROM_DOMAIN = 'actvtrkr.com'

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

function generateUnsubscribeToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getOrCreateUnsubscribeToken(
  // deno-lint-ignore no-explicit-any
  admin: any,
  email: string,
): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase()

  const { data: existingToken, error: lookupError } = await admin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (lookupError) throw lookupError
  if (existingToken && !existingToken.used_at) return String(existingToken.token)

  const unsubscribeToken = generateUnsubscribeToken()
  const { error: upsertError } = await admin
    .from('email_unsubscribe_tokens')
    .upsert({ token: unsubscribeToken, email: normalizedEmail }, { onConflict: 'email', ignoreDuplicates: true })
  if (upsertError) throw upsertError

  const { data: storedToken, error: storedTokenError } = await admin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (storedTokenError || !storedToken?.token) {
    throw storedTokenError ?? new Error('Failed to confirm unsubscribe token')
  }

  return String(storedToken.token)
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

    // Step 3: Render and enqueue the code directly on the auth queue.
    const ipHint = ipRaw ? ipRaw.replace(/\.\d+$/, '.x') : undefined
    const templateData = {
      code,
      expiresInMinutes: CODE_TTL_MINUTES,
      ipHint,
      userAgentHint: userAgent ? userAgent.slice(0, 80) : undefined,
    }
    const messageId = crypto.randomUUID()
    const idempotencyKey = `mfa-${userId}-${challengeTokenHash.slice(0, 16)}`
    const unsubscribeToken = await getOrCreateUnsubscribeToken(admin, userEmail)

    const html = await renderAsync(React.createElement(login2faCodeTemplate.component, templateData))
    const text = await renderAsync(React.createElement(login2faCodeTemplate.component, templateData), {
      plainText: true,
    })

    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'login-2fa-code',
      recipient_email: userEmail,
      status: 'pending',
    })

    const { error: enqueueError } = await admin.rpc('enqueue_email', {
      queue_name: 'auth_emails',
      payload: {
        message_id: messageId,
        to: userEmail,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: login2faCodeTemplate.subject(templateData),
        html,
        text,
        purpose: 'transactional',
        label: 'login-2fa-code',
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })
    if (enqueueError) {
      console.error('enqueue_email failed for login-2fa-code:', enqueueError.message)
      await admin.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'login-2fa-code',
        recipient_email: userEmail,
        status: 'failed',
        error_message: 'Failed to enqueue login MFA email',
      })
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
