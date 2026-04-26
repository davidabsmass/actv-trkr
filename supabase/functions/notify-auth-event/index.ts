// notify-auth-event
// Internal endpoint called by other edge functions (server-to-server) when a
// risky auth event occurs. It records the event in `auth_event_alerts`,
// generates a one-time kill token (used by `kill-my-sessions`), and emails
// the user a security alert with a one-click "lock my account" button.
//
// Auth: requires the SUPABASE_SERVICE_ROLE_KEY in the Authorization header
// OR a matching INTERNAL_NOTIFY_SECRET. Never call this directly from the
// browser — always invoke from another edge function.

import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { template as authSecurityAlertTemplate } from '../_shared/transactional-email-templates/auth-security-alert.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_NAME = 'ACTV TRKR'
const SENDER_DOMAIN = 'notify.actvtrkr.com'
const FROM_DOMAIN = 'actvtrkr.com'
const APP_BASE_URL = 'https://actvtrkr.com'

const KILL_TOKEN_TTL_HOURS = 24

type AuthEventType =
  | 'new_device_login'
  | 'password_changed'
  | 'email_changed'
  | 'password_reset_requested'
  | 'too_many_failed_logins'
  | 'step_up_failed'
  | 'mfa_code_new_device'

const SUBJECTS: Record<AuthEventType, string> = {
  new_device_login: 'New sign-in to your ACTV TRKR account',
  password_changed: 'Your ACTV TRKR password was changed',
  email_changed: 'Your ACTV TRKR account email is being changed',
  password_reset_requested: 'Password reset requested for your ACTV TRKR account',
  too_many_failed_logins: 'Multiple failed sign-in attempts on your account',
  step_up_failed: 'Failed admin re-verification on your account',
  mfa_code_new_device: 'New device requested a sign-in code',
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateUnsubscribeToken(): string {
  return generateToken()
}

// deno-lint-ignore no-explicit-any
async function getOrCreateUnsubscribeToken(admin: any, email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase()
  const { data: existing } = await admin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (existing && !existing.used_at) return String(existing.token)

  const token = generateUnsubscribeToken()
  await admin
    .from('email_unsubscribe_tokens')
    .upsert({ token, email: normalizedEmail }, { onConflict: 'email', ignoreDuplicates: true })

  const { data: stored } = await admin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (!stored?.token) throw new Error('failed_to_persist_unsub_token')
  return String(stored.token)
}

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('authorization') ?? ''
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (bearer && bearer === SUPABASE_SERVICE_ROLE_KEY) return true

  const internalSecret = Deno.env.get('INTERNAL_NOTIFY_SECRET')
  const provided = req.headers.get('x-internal-secret') ?? ''
  if (internalSecret && provided && provided === internalSecret) return true
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const userId = String(body?.userId ?? '').trim()
    const eventType = String(body?.eventType ?? '').trim() as AuthEventType
    const ipRaw = String(body?.ip ?? '').trim()
    const userAgent = String(body?.userAgent ?? '').slice(0, 200) || null
    const geoHint = String(body?.geoHint ?? '').slice(0, 80) || null
    const metadata = (body?.metadata && typeof body.metadata === 'object') ? body.metadata : {}
    const sendEmail = body?.sendEmail !== false // default true
    const showKillButton = body?.showKillButton !== false // default true

    if (!userId || !eventType || !SUBJECTS[eventType]) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Look up user email
    const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(userId)
    if (userErr || !userRes?.user?.email) {
      return new Response(JSON.stringify({ error: 'user_not_found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userEmail = userRes.user.email

    const ipHash = ipRaw ? await sha256Hex(ipRaw) : null
    const ipHint = ipRaw ? ipRaw.replace(/\.\d+$/, '.x') : undefined

    // Generate kill token
    const killToken = generateToken()
    const killTokenHash = await sha256Hex(killToken)
    const killExpires = new Date(Date.now() + KILL_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString()

    // Persist event
    const { data: alertRow, error: insErr } = await admin
      .from('auth_event_alerts')
      .insert({
        user_id: userId,
        event_type: eventType,
        ip_hash: ipHash,
        user_agent: userAgent,
        geo_hint: geoHint,
        metadata,
        kill_token_hash: killTokenHash,
        kill_token_expires_at: killExpires,
      })
      .select('id')
      .single()
    if (insErr || !alertRow) {
      console.error('auth_event_alerts insert failed', insErr?.message)
      return new Response(JSON.stringify({ error: 'persist_failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!sendEmail) {
      return new Response(JSON.stringify({ alertId: alertRow.id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const killUrl = `${APP_BASE_URL}/account/lock?token=${killToken}&aid=${alertRow.id}`

    const templateData = {
      whenISO: new Date().toISOString(),
      ipHint,
      userAgentHint: userAgent ? userAgent.slice(0, 80) : undefined,
      killUrl,
      showKillButton,
      // Headline/description are derived from event_type inside the template's HEADLINES map
      ...(authSecurityAlertTemplate as any).previewData,
      // Allow per-event override via metadata
      headline: metadata?.headline,
      description: metadata?.description,
    }

    // Use the per-event headline/description from template's internal map
    const eventCopy = (authSecurityAlertTemplate as any) // read HEADLINES indirectly
    // The template already maps headline/description from event-specific data — but since
    // we don't pass eventType to the component, we resolve copy here:
    const HEADLINES: Record<string, { headline: string; description: string }> = {
      new_device_login: {
        headline: 'New sign-in to your account',
        description: 'Someone signed in to your ACTV TRKR account from a new device or location.',
      },
      password_changed: {
        headline: 'Your password was changed',
        description: 'The password on your ACTV TRKR account was just changed.',
      },
      email_changed: {
        headline: 'Your account email is being changed',
        description:
          'A request was made to change the email address on your ACTV TRKR account. The change is on a 1-hour delay so you have time to cancel it.',
      },
      password_reset_requested: {
        headline: 'Password reset requested',
        description: 'Someone asked to reset the password on your ACTV TRKR account.',
      },
      too_many_failed_logins: {
        headline: 'Multiple failed sign-in attempts',
        description: 'We saw 5 or more failed sign-in attempts on your account in the last 10 minutes.',
      },
      step_up_failed: {
        headline: 'Failed admin re-verification',
        description:
          'Someone with access to your session tried to re-verify your password to perform a sensitive admin action — and got it wrong.',
      },
      mfa_code_new_device: {
        headline: 'Sign-in code requested from a new device',
        description: 'A 2FA sign-in code was just emailed to you for a sign-in from a new device.',
      },
    }
    const copy = HEADLINES[eventType]
    if (copy) {
      templateData.headline = templateData.headline || copy.headline
      templateData.description = templateData.description || copy.description
    }

    const messageId = crypto.randomUUID()
    const idempotencyKey = `auth-alert-${alertRow.id}`
    const unsubscribeToken = await getOrCreateUnsubscribeToken(admin, userEmail)

    const html = await renderAsync(
      React.createElement(authSecurityAlertTemplate.component, templateData),
    )
    const text = await renderAsync(
      React.createElement(authSecurityAlertTemplate.component, templateData),
      { plainText: true },
    )

    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'auth-security-alert',
      recipient_email: userEmail,
      status: 'pending',
    })

    const { error: enqErr } = await admin.rpc('enqueue_email', {
      queue_name: 'auth_emails',
      payload: {
        message_id: messageId,
        to: userEmail,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: SUBJECTS[eventType],
        html,
        text,
        purpose: 'transactional',
        label: 'auth-security-alert',
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    })
    if (enqErr) {
      console.error('enqueue auth-security-alert failed', enqErr.message)
      await admin.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'auth-security-alert',
        recipient_email: userEmail,
        status: 'failed',
        error_message: 'enqueue_failed',
      })
      return new Response(JSON.stringify({ error: 'email_send_failed', alertId: alertRow.id }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await admin
      .from('auth_event_alerts')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', alertRow.id)

    return new Response(JSON.stringify({ alertId: alertRow.id, killUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('notify-auth-event unexpected:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
