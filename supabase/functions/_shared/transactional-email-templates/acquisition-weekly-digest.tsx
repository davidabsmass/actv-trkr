/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'

interface MetricRow { label: string; value: string; deltaPct?: number | null }
interface RiskRow { title: string; severity: string; description?: string }

interface AcqDigestProps {
  date?: string
  arr?: string
  arrDeltaPct?: number | null
  mrr?: string
  mrrDeltaPct?: number | null
  nrrPct?: string
  topCustomerPct?: string
  runwayMonths?: string
  diligenceScore?: number
  metrics?: MetricRow[]
  newRisks?: RiskRow[]
  openRiskCount?: number
}

const fmtDelta = (d?: number | null) => {
  if (d == null || !isFinite(d)) return ''
  const sign = d >= 0 ? '+' : ''
  return ` (${sign}${d.toFixed(1)}% MoM)`
}

const sevColor = (s: string) =>
  s === 'critical' ? '#b91c1c' : s === 'high' ? '#dc2626' : s === 'medium' ? '#d97706' : '#6b7280'

const AcqWeeklyDigest = ({
  date,
  arr = '$0',
  arrDeltaPct,
  mrr = '$0',
  mrrDeltaPct,
  nrrPct = '—',
  topCustomerPct = '0%',
  runwayMonths = '—',
  diligenceScore = 0,
  metrics = [],
  newRisks = [],
  openRiskCount = 0,
}: AcqDigestProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{SITE_NAME} acquisition readiness — weekly digest</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{SITE_NAME} — Acquisition Readiness Weekly Digest</Heading>
        <Text style={muted}>{date}</Text>

        <Section style={kpiGrid}>
          <Section style={kpiBox}>
            <Text style={kpiLabel}>ARR</Text>
            <Text style={kpiValue}>{arr}</Text>
            {arrDeltaPct != null && (
              <Text style={{ ...kpiDelta, color: arrDeltaPct >= 0 ? '#16a34a' : '#dc2626' }}>
                {arrDeltaPct >= 0 ? '+' : ''}{arrDeltaPct.toFixed(1)}% MoM
              </Text>
            )}
          </Section>
          <Section style={kpiBox}>
            <Text style={kpiLabel}>MRR</Text>
            <Text style={kpiValue}>{mrr}</Text>
            {mrrDeltaPct != null && (
              <Text style={{ ...kpiDelta, color: mrrDeltaPct >= 0 ? '#16a34a' : '#dc2626' }}>
                {mrrDeltaPct >= 0 ? '+' : ''}{mrrDeltaPct.toFixed(1)}% MoM
              </Text>
            )}
          </Section>
          <Section style={kpiBox}>
            <Text style={kpiLabel}>NRR</Text>
            <Text style={kpiValue}>{nrrPct}</Text>
          </Section>
          <Section style={kpiBox}>
            <Text style={kpiLabel}>Top Customer % ARR</Text>
            <Text style={kpiValue}>{topCustomerPct}</Text>
          </Section>
          <Section style={kpiBox}>
            <Text style={kpiLabel}>Cash Runway</Text>
            <Text style={kpiValue}>{runwayMonths}</Text>
          </Section>
          <Section style={kpiBox}>
            <Text style={kpiLabel}>Diligence Score</Text>
            <Text style={kpiValue}>{diligenceScore}/100</Text>
          </Section>
        </Section>

        {metrics.length > 0 && (
          <>
            <Hr style={hr} />
            <Heading as="h2" style={h2}>Key metric movements</Heading>
            <Section>
              {metrics.map((m) => (
                <Text key={m.label} style={metricRow}>
                  <strong>{m.label}:</strong> {m.value}{fmtDelta(m.deltaPct)}
                </Text>
              ))}
            </Section>
          </>
        )}

        <Hr style={hr} />
        <Heading as="h2" style={h2}>Risk register</Heading>
        <Text style={text}>
          <strong>{openRiskCount}</strong> open risk{openRiskCount === 1 ? '' : 's'}
          {newRisks.length > 0 && ` — ${newRisks.length} new this week`}.
        </Text>

        {newRisks.length > 0 ? (
          <Section style={tableWrap}>
            {newRisks.map((r, i) => (
              <Section key={i} style={row}>
                <Text style={{ ...rowDomain, color: sevColor(r.severity) }}>
                  [{r.severity.toUpperCase()}] {r.title}
                </Text>
                {r.description && <Text style={rowMeta}>{r.description}</Text>}
              </Section>
            ))}
          </Section>
        ) : (
          <Text style={text}>No new risk flags this week. ✓</Text>
        )}

        <Text style={footer}>
          This digest is generated weekly from your acquisition readiness data. Open the
          dashboard for the full breakdown, charts, and downloadable diligence pack.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AcqWeeklyDigest,
  subject: ({ arrDeltaPct }: AcqDigestProps) => {
    const trend = arrDeltaPct == null ? '' : arrDeltaPct >= 0 ? ` (▲ ${arrDeltaPct.toFixed(1)}%)` : ` (▼ ${Math.abs(arrDeltaPct).toFixed(1)}%)`
    return `${SITE_NAME} acquisition weekly digest${trend}`
  },
  displayName: 'Acquisition weekly digest',
  previewData: {
    date: '2026-04-17',
    arr: '$485k',
    arrDeltaPct: 4.2,
    mrr: '$40.4k',
    mrrDeltaPct: 4.2,
    nrrPct: '108%',
    topCustomerPct: '14.5%',
    runwayMonths: '18.2 months',
    diligenceScore: 76,
    metrics: [
      { label: 'Net New ARR (12mo)', value: '$92k', deltaPct: 12.1 },
      { label: 'Burn Multiple', value: '1.4×', deltaPct: -8.0 },
      { label: 'Gross Margin', value: '78%', deltaPct: 1.2 },
    ],
    newRisks: [
      { title: 'Customer A exceeds 20% of ARR', severity: 'high', description: 'Concentration risk auto-detected.' },
    ],
    openRiskCount: 4,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '640px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 8px' }
const h2 = { fontSize: '16px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 12px' }
const muted = { fontSize: '12px', color: '#999999', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 12px' }
const hr = { borderColor: '#eeeeee', margin: '24px 0' }
const kpiGrid = { display: 'block' as const }
const kpiBox = {
  display: 'inline-block' as const,
  width: '32%',
  verticalAlign: 'top' as const,
  padding: '10px 12px',
  margin: '0 0 8px 0',
  backgroundColor: '#f9fafb',
  borderRadius: '6px', textAlign: 'left' as const}
const kpiLabel = { fontSize: '11px', color: '#6b7280', margin: 0, textTransform: 'uppercase' as const }
const kpiValue = { fontSize: '18px', color: '#000000', fontWeight: 'bold' as const, margin: '4px 0 0' }
const kpiDelta = { fontSize: '11px', margin: '2px 0 0' }
const metricRow = { fontSize: '13px', color: '#374151', margin: '0 0 6px' }
const tableWrap = { margin: '8px 0 16px' }
const row = { borderBottom: '1px solid #eeeeee', padding: '8px 0' }
const rowDomain = { fontSize: '13px', fontWeight: 'bold' as const, margin: 0 }
const rowMeta = { fontSize: '12px', color: '#777777', margin: '4px 0 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0', lineHeight: '1.5' }
