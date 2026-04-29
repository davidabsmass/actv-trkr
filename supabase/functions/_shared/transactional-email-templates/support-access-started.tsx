/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const APP_URL = 'https://actvtrkr.com'

interface SupportAccessStartedProps {
  recipientName?: string
  siteDomain?: string
  durationHours?: number
  expiresAt?: string
  reason?: string
  staffName?: string
}

const formatDate = (iso?: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch { return iso }
}

const formatDuration = (hours?: number) => {
  if (!hours) return ''
  if (hours === 1) return '1 hour'
  if (hours < 24) return `${hours} hours`
  if (hours === 24) return '24 hours (1 day)'
  if (hours === 72) return '72 hours (3 days)'
  return `${hours} hours`
}

const SupportAccessStartedEmail = ({
  recipientName, siteDomain, durationHours, expiresAt, reason, staffName,
}: SupportAccessStartedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{SITE_NAME} support has started a temporary access session</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={contentSection}>
          <Heading style={h1}>Support access has started</Heading>

          <Text style={text}>
            {recipientName ? `Hi ${recipientName},` : 'Hi,'}
          </Text>

          <Text style={text}>
            A temporary support session has just started on your {SITE_NAME}{' '}
            account{siteDomain ? ` for ${siteDomain}` : ''}. We're letting
            you know right away so you're never surprised by support activity.
          </Text>

          <Section style={card}>
            {siteDomain && (
              <>
                <Text style={cardLabel}>Site</Text>
                <Text style={cardValue}>{siteDomain}</Text>
              </>
            )}
            <Text style={cardLabel}>Started by</Text>
            <Text style={cardValue}>{staffName || `${SITE_NAME} Support`}</Text>
            <Text style={cardLabel}>Window</Text>
            <Text style={cardValue}>
              {formatDuration(durationHours)}
              {expiresAt ? ` — expires ${formatDate(expiresAt)}` : ''}
            </Text>
            {reason && (
              <>
                <Text style={cardLabel}>Reason</Text>
                <Text style={cardValue}>{reason}</Text>
              </>
            )}
          </Section>

          <Text style={text}>
            Every action our team takes during this window is logged. You can
            watch activity in real time and revoke access at any time from
            your Account page.
          </Text>

          <Section style={buttonWrap}>
            <Button style={button} href={`${APP_URL}/account?tab=support`}>
              View live activity
            </Button>
          </Section>

          <Text style={text}>
            When the session ends — either when it expires or when you revoke
            it — we'll send a follow-up summary of everything that happened.
          </Text>

          <Text style={textMuted}>
            Didn't expect this? Open your Account page and click "Revoke
            access" immediately, then reply to this email so we can
            investigate.
          </Text>

          <Text style={signoff}>Thanks,</Text>
          <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportAccessStartedEmail,
  subject: (data: Record<string, any>) => {
    const domain = data?.siteDomain ? ` on ${data.siteDomain}` : ''
    return `Support access has started${domain}`
  },
  displayName: 'Support access started',
  previewData: {
    recipientName: 'David',
    siteDomain: 'livesinthebalance.org',
    durationHours: 24,
    expiresAt: '2026-04-27T14:00:00Z',
    reason: 'Investigating missing nightly summary data',
    staffName: 'Annie from ACTV TRKR Support',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const textMuted = { fontSize: '13px', color: '#6B7280', lineHeight: '1.6', margin: '20px 0 0', fontStyle: 'italic' as const }
const card = { backgroundColor: '#F3F4F6', borderRadius: '10px', padding: '16px 18px', margin: '20px 0', textAlign: 'left' as const}
const cardLabel = { fontSize: '11px', color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px', fontWeight: '600' as const }
const cardValue = { fontSize: '14px', color: '#111827', margin: '0 0 12px', fontWeight: '500' as const }
const buttonWrap = { textAlign: 'center' as const, margin: '28px 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block', textAlign: 'left' as const}
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
