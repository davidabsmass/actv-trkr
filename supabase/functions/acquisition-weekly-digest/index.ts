import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_RECIPIENTS = ['david@newuniformdesign.com', 'annie@newuniformdesign.com']

const fmtUsd = (n: number, compact = true) => {
  if (!isFinite(n)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    maximumFractionDigits: compact && Math.abs(n) >= 1000 ? 0 : 2,
    notation: compact && Math.abs(n) >= 10_000 ? 'compact' : 'standard',
  }).format(n)
}
const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null || !isFinite(n) ? '—' : `${n.toFixed(digits)}%`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(url, key)

    // Pull last 60d of metric snapshots
    const sixtyAgo = new Date(); sixtyAgo.setDate(sixtyAgo.getDate() - 60)
    const { data: snaps } = await supabase
      .from('acquisition_metric_snapshots')
      .select('metric_key, metric_name, metric_value, metric_date')
      .gte('metric_date', sixtyAgo.toISOString().slice(0, 10))
      .order('metric_date', { ascending: false })

    // Latest + ~30d ago for each metric
    const latest = new Map<string, { value: number; name: string; date: string }>()
    const prior = new Map<string, number>()
    const today = new Date()
    for (const s of snaps ?? []) {
      if (!latest.has(s.metric_key)) {
        latest.set(s.metric_key, { value: Number(s.metric_value ?? 0), name: s.metric_name, date: s.metric_date })
      } else {
        const ageDays = Math.abs((today.getTime() - new Date(s.metric_date).getTime()) / 86400000)
        if (ageDays >= 25 && ageDays <= 40 && !prior.has(s.metric_key)) {
          prior.set(s.metric_key, Number(s.metric_value ?? 0))
        }
      }
    }
    const deltaPct = (k: string) => {
      const cur = latest.get(k)?.value
      const prev = prior.get(k)
      if (cur == null || prev == null || prev === 0) return null
      return ((cur - prev) / prev) * 100
    }

    // Risks created in last 7 days
    const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7)
    const { data: newRisks } = await supabase
      .from('acquisition_risk_flags')
      .select('title, severity, description, status, created_at')
      .gte('created_at', sevenAgo.toISOString())
      .order('severity', { ascending: true })

    const { count: openRiskCount } = await supabase
      .from('acquisition_risk_flags')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open')

    // Diligence score
    const { data: checklist } = await supabase
      .from('diligence_checklist_items').select('readiness_status')
    let scorePoints = 0
    let total = (checklist ?? []).length
    for (const c of checklist ?? []) {
      if (c.readiness_status === 'ready') scorePoints += 1
      else if (c.readiness_status === 'partial') scorePoints += 0.5
    }
    const diligenceScore = total > 0 ? Math.round((scorePoints / total) * 100) : 0

    const arr = latest.get('arr')?.value ?? 0
    const mrr = latest.get('mrr')?.value ?? 0
    const nrr = latest.get('nrr_pct')?.value ?? null
    const top1 = latest.get('top_customer_pct')?.value ?? 0
    const runway = latest.get('cash_runway_months')?.value ?? null

    const movements: { label: string; value: string; deltaPct: number | null }[] = []
    for (const k of ['net_new_arr_12mo', 'burn_multiple', 'gross_margin_pct', 'rule_of_40', 'arr_per_employee']) {
      const l = latest.get(k)
      if (!l) continue
      const isPct = k.endsWith('_pct') || k === 'rule_of_40'
      const isCur = k === 'net_new_arr_12mo' || k === 'arr_per_employee'
      const value = isPct ? `${l.value.toFixed(1)}${k === 'rule_of_40' ? '' : '%'}` : isCur ? fmtUsd(l.value) : `${l.value.toFixed(2)}×`
      movements.push({ label: l.name, value, deltaPct: deltaPct(k) })
    }

    const templateData = {
      date: new Date().toISOString().slice(0, 10),
      arr: fmtUsd(arr),
      arrDeltaPct: deltaPct('arr'),
      mrr: fmtUsd(mrr),
      mrrDeltaPct: deltaPct('mrr'),
      nrrPct: fmtPct(nrr, 0),
      topCustomerPct: fmtPct(top1, 1),
      runwayMonths: runway != null ? `${runway.toFixed(1)} months` : '—',
      diligenceScore,
      metrics: movements,
      newRisks: (newRisks ?? []).slice(0, 8).map((r) => ({
        title: r.title,
        severity: r.severity,
        description: r.description ?? '',
      })),
      openRiskCount: openRiskCount ?? 0,
    }

    // Send via existing transactional email pipeline to each admin recipient
    const sendResults: Array<{ to: string; ok: boolean; error?: string }> = []
    for (const to of ADMIN_RECIPIENTS) {
      const res = await fetch(`${url}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          templateName: 'acquisition-weekly-digest',
          recipientEmail: to,
          templateData,
        }),
      })
      const body = await res.text()
      sendResults.push({ to, ok: res.ok, error: res.ok ? undefined : body.slice(0, 300) })
    }

    // Audit log
    await supabase.from('admin_digest_log').insert({
      digest_date: new Date().toISOString().slice(0, 10),
      digest_type: 'acquisition-weekly',
      recipient_email: ADMIN_RECIPIENTS.join(','),
      payload: { templateData, sendResults } as any,
    })

    return new Response(
      JSON.stringify({ ok: true, sent: sendResults.filter((r) => r.ok).length, sendResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
