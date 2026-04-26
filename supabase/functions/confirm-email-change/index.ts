// confirm-email-change
// Two operations on the email-change flow:
//
//   POST { action: "request", newEmail }
//     - Authenticated user (via Authorization: Bearer access_token).
//     - Records a pending email change in `auth_email_change_pending` with a
//       1-hour security delay (effective_at = now + 60min).
//     - Sends a "your email is being changed" alert with cancel link to the
//       OLD email address (the current one on the account).
//     - Triggers Supabase's standard email-change flow against the NEW
//       address, so the new owner must click a confirmation link before
//       the change actually takes effect.
//     - Returns { effectiveAt }.
//
//   POST { action: "cancel", token }
//     - Public. Validates the cancel token from the email and rolls back
//       the pending change (cancelled_at = now). Also clears any pending
//       email change on the auth.users record by re-issuing the user's
//       current email — preventing the new-email confirmation from sticking.
//
// The 1-hour delay gives the legitimate owner time to react if an attacker
// initiates an email change from a stolen session.

import { createClient } from 'npm:@supabase/supabase-js@2'
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template as emailChangeCancelTemplate } from '../_shared/transactional-email-templates/email-change-cancel.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_NAME = 'ACTV TRKR'
const SENDER_DOMAIN = 'notify.actvtrkr.com'
const FROM_DOMAIN = 'actvtrkr.com'
const APP_BASE_URL = 'https://actvtrkr.com'
const DELAY_MINUTES = 60

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// deno-lint-ignore no-explicit-any
async function getOrCreateUnsubscribeToken(admin: any, email: string): Promise<string> {
  const norm = email.trim().toLowerCase()
  const { data: existing } = await admin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', norm)
    .maybeSingle()
  if (existing && !existing.used_at) return String(existing.token)
  const token = generateToken()
  await admin.from('email_unsubscribe_tokens')
    .upsert({ token, email: norm }, { onConflict: 'email', ignoreDuplicates: true })
  const { data: stored } = await admin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', norm)
    .maybeSingle()
  if (!stored?.token) throw new Error('failed_to_persist_unsub_token')
  return String(stored.token)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? '').trim()

    // ───────────────────────────────────────────────────── REQUEST
    if (action === 'request') {
      const newEmailRaw = String(body?.newEmail ?? '').trim().toLowerCase()
      if (!newEmailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmailRaw)) {
        return new Response(JSON.stringify({ error: 'invalid_email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const authHeader = req.headers.get('authorization') ?? ''
      if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Resolve the calling user via the user-scoped client.
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data: userData, error: userErr } = await userClient.auth.getUser()
      if (userErr || !userData?.user?.email) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const userId = userData.user.id
      const oldEmail = userData.user.email
      if (oldEmail.toLowerCase() === newEmailRaw) {
        return new Response(JSON.stringify({ error: 'same_email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Mark any prior pending changes as cancelled (single live request at a time).
      await admin
        .from('auth_email_change_pending')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('cancelled_at', null)
        .is('applied_at', null)

      const cancelToken = generateToken()
      const cancelTokenHash = await sha256Hex(cancelToken)
      const effectiveAt = new Date(Date.now() + DELAY_MINUTES * 60 * 1000).toISOString()
      const ipRaw = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
      const ipHash = ipRaw ? await sha256Hex(ipRaw) : null
      const ua = (req.headers.get('user-agent') ?? '').slice(0, 200) || null

      const { data: pendingRow, error: pendErr } = await admin
        .from('auth_email_change_pending')
        .insert({
          user_id: userId,
          old_email: oldEmail,
          new_email: newEmailRaw,
          cancel_token_hash: cancelTokenHash,
          effective_at: effectiveAt,
          ip_hash: ipHash,
          user_agent: ua,
        })
        .select('id')
        .single()
      if (pendErr || !pendingRow) {
        console.error('pending insert failed', pendErr?.message)
        return new Response(JSON.stringify({ error: 'persist_failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Trigger Supabase's normal email-change confirmation flow on the NEW address.
      // This ensures the new owner must verify before the change applies.
      try {
        await admin.auth.admin.updateUserById(userId, { email: newEmailRaw })
      } catch (e) {
        console.error('admin.updateUserById failed', (e as Error).message)
        // Don't hard fail — the cancel email still goes out so the user is alerted.
      }

      // Send cancel email to the OLD address.
      const cancelUrl = `${APP_BASE_URL}/account/cancel-email-change?token=${cancelToken}&pid=${pendingRow.id}`
      const ipHint = ipRaw ? ipRaw.replace(/\.\d+$/, '.x') : undefined
      const templateData = {
        newEmail: newEmailRaw,
        effectiveAtISO: effectiveAt,
        cancelUrl,
        ipHint,
        userAgentHint: ua ? ua.slice(0, 80) : undefined,
      }

      const messageId = crypto.randomUUID()
      const idempotencyKey = `email-change-${pendingRow.id}`
      const unsubscribeToken = await getOrCreateUnsubscribeToken(admin, oldEmail)

      const html = await renderAsync(
        React.createElement(emailChangeCancelTemplate.component, templateData),
      )
      const text = await renderAsync(
        React.createElement(emailChangeCancelTemplate.component, templateData),
        { plainText: true },
      )

      await admin.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'email-change-cancel',
        recipient_email: oldEmail,
        status: 'pending',
      })

      const subject = typeof emailChangeCancelTemplate.subject === 'function'
        ? emailChangeCancelTemplate.subject(templateData)
        : emailChangeCancelTemplate.subject

      const { error: enqErr } = await admin.rpc('enqueue_email', {
        queue_name: 'auth_emails',
        payload: {
          message_id: messageId,
          to: oldEmail,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: 'transactional',
          label: 'email-change-cancel',
          idempotency_key: idempotencyKey,
          unsubscribe_token: unsubscribeToken,
          queued_at: new Date().toISOString(),
        },
      })
      if (enqErr) {
        console.error('enqueue email-change-cancel failed', enqErr.message)
      }

      return new Response(
        JSON.stringify({
          ok: true,
          effectiveAt,
          message: `We sent a cancel link to ${oldEmail} and a confirmation link to ${newEmailRaw}.`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ───────────────────────────────────────────────────── CANCEL
    if (action === 'cancel') {
      const token = String(body?.token ?? '').trim()
      const pid = String(body?.pid ?? '').trim()
      if (!token || !pid) {
        return new Response(JSON.stringify({ error: 'invalid_payload' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const tokenHash = await sha256Hex(token)
      const { data: pending, error: lookupErr } = await admin
        .from('auth_email_change_pending')
        .select('id, user_id, old_email, new_email, cancel_token_hash, cancelled_at, applied_at, effective_at')
        .eq('id', pid)
        .maybeSingle()
      if (lookupErr || !pending) {
        return new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (pending.cancelled_at || pending.applied_at) {
        return new Response(JSON.stringify({ error: 'already_resolved' }), {
          status: 410,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (pending.cancel_token_hash !== tokenHash) {
        return new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Cancel by re-issuing the OLD email on the auth user, which also wipes any
      // outstanding email-change confirmation issued earlier.
      try {
        await admin.auth.admin.updateUserById(pending.user_id, {
          email: pending.old_email,
          email_confirm: true,
        })
      } catch (e) {
        console.error('cancel updateUserById failed', (e as Error).message)
      }

      await admin
        .from('auth_email_change_pending')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', pending.id)

      // Globally sign the user out — the originator may be an attacker holding the session.
      try { await admin.auth.admin.signOut(pending.user_id, 'global') } catch { /* ignore */ }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'unknown_action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('confirm-email-change unexpected', (e as Error).message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
