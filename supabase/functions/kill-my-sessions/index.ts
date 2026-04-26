// kill-my-sessions
// Public endpoint hit when a user clicks the "lock my account" button in a
// security alert email. It validates the one-time kill token from
// auth_event_alerts, then:
//   1. Signs the user out of ALL sessions globally (revokes all refresh tokens).
//   2. Marks all rows in auth_recent_sessions for that user as revoked.
//   3. Consumes the kill token (single-use).
//
// The endpoint returns a small JSON response that the /account/lock page
// reads to display success or failure. We deliberately do NOT require the
// user to be signed in — the email link IS the credential here.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
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
    const token = String(body?.token ?? '').trim()
    const alertId = String(body?.alertId ?? '').trim()

    if (!token || !alertId) {
      return new Response(JSON.stringify({ error: 'invalid_payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const tokenHash = await sha256Hex(token)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: alert, error: lookupErr } = await admin
      .from('auth_event_alerts')
      .select('id, user_id, kill_token_hash, kill_token_expires_at, kill_token_consumed_at')
      .eq('id', alertId)
      .maybeSingle()

    if (lookupErr || !alert) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (alert.kill_token_consumed_at) {
      return new Response(JSON.stringify({ error: 'already_used' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (alert.kill_token_hash !== tokenHash) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (new Date(alert.kill_token_expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'expired' }), {
        status: 410,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Globally sign the user out (revokes all refresh tokens).
    const { error: signOutErr } = await admin.auth.admin.signOut(alert.user_id, 'global')
    if (signOutErr) {
      console.error('admin.signOut failed', signOutErr.message)
      // continue anyway — we still want to record the lock
    }

    // 2. Mark all recent sessions revoked.
    await admin
      .from('auth_recent_sessions')
      .update({ revoked_at: new Date().toISOString(), revoke_reason: 'kill_switch' })
      .eq('user_id', alert.user_id)
      .is('revoked_at', null)

    // 3. Consume the kill token.
    await admin
      .from('auth_event_alerts')
      .update({ kill_token_consumed_at: new Date().toISOString() })
      .eq('id', alert.id)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('kill-my-sessions unexpected', (e as Error).message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
