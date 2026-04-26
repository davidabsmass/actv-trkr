/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const APP_URL = 'https://actvtrkr.com'

export interface SupportAccessSummaryAction {
  action: string
  resource_type?: string | null
  occurred_at: string
}

interface SupportAccessSummaryProps {
  recipientName?: string
  endedReason?: 'expired' | 'revoked'
  grantedAt?: string
  endedAt?: string
  actions?: SupportAccessSummaryAction[]
  totalActions?: number
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

const humanize = (a: string) => a.replace(/_/g, ' ')

const SupportAccessSummaryEmail = ({
  recipientName, endedReason, grantedAt, endedAt, actions, totalActions,
}: SupportAccessSummaryProps) => {
  const reason = endedReason === 'revoked' ? 'revoked' : 'expired'
  const headline = reason === 'revoked'
    ? 'Support access has been revoked'
    : 'Support access has ended'
  const count = totalActions ?? actions?.length ?? 0

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Summary of what {SITE_NAME} support did during your access window
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={contentSection}>
            <Heading style={h1}>{headline}</Heading>

            <Text style={text}>
              {recipientName ? `Hi ${recipientName},` : 'Hi,'}
            </Text>

            <Text style={text}>
              The temporary access window you opened for the {SITE_NAME} support
              team has now {reason}. For your records, here's a summary of
              what we did while we had access.
            </Text>

            <Section style={card}>
              <Text style={cardLabel}>Access window</Text>
              <Text style={cardValue}>
                {formatDate(grantedAt)} → {formatDate(endedAt)}
              </Text>
              <Text style={cardLabel}>Status</Text>
              <Text style={cardValue}>
                {reason === 'revoked' ? 'Revoked early' : 'Expired automatically'}
              </Text>
              <Text style={cardLabel}>Actions taken</Text>
              <Text style={cardValue}>
                {count === 0 ? 'No actions recorded' : `${count} action${count === 1 ? '' : 's'}`}
              </Text>
            </Section>

            {actions && actions.length > 0 && (
              <>
                <Hr style={hr} />
                <Heading as="h2" style={h2}>What support did</Heading>
                <Section style={logBox}>
                  {actions.slice(0, 25).map((entry, i) => (
                    <Text key={i} style={logRow}>
                      <span style={logTime}>{formatDate(entry.occurred_at)}</span>
                      {' — '}
                      <span style={logAction}>{humanize(entry.action)}</span>
                      {entry.resource_type ? (
                        <span style={logResource}> ({entry.resource_type})</span>
                      ) : null}
                    </Text>
                  ))}
                  {actions.length > 25 && (
                    <Text style={logMore}>
                      …and {actions.length - 25} more. Full history is always
                      available in your account.
                    </Text>
                  )}
                </Section>
              </>
            )}

            {count === 0 && (
              <Text style={text}>
                No changes were made to your account during this window. We
                may have viewed dashboards or tickets to help diagnose your
                issue, but nothing was modified.
              </Text>
            )}

            <Section style={buttonWrap}>
              <Button style={button} href={`${APP_URL}/account?tab=support`}>
                View access history
              </Button>
            </Section>

            <Text style={text}>
              You can grant support access again any time from your Account
              page. If anything here looks unexpected, just reply and our
              team will look into it right away.
            </Text>

            <Text style={signoff}>Thanks,</Text>
            <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SupportAccessSummaryEmail,
  subject: (data: Record<string, any>) => {
    const reason = data?.endedReason === 'revoked' ? 'revoked' : 'ended'
    return `Summary: support access ${reason}`
  },
  displayName: 'Support access summary',
  previewData: {
    recipientName: 'David',
    endedReason: 'expired',
    grantedAt: '2026-04-25T14:00:00Z',
    endedAt: '2026-04-26T14:00:00Z',
    totalActions: 3,
    actions: [
      { action: 'customer_detail_viewed', resource_type: 'customer', occurred_at: '2026-04-25T14:05:00Z' },
      { action: 'ticket_replied', resource_type: 'ticket', occurred_at: '2026-04-25T14:18:00Z' },
      { action: 'ticket_status_changed', resource_type: 'ticket', occurred_at: '2026-04-25T14:20:00Z' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const h2 = { fontSize: '15px', fontWeight: '600' as const, color: '#111827', margin: '20px 0 10px' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const card = { backgroundColor: '#F3F4F6', borderRadius: '10px', padding: '16px 18px', margin: '20px 0' }
const cardLabel = { fontSize: '11px', color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px', fontWeight: '600' as const }
const cardValue = { fontSize: '14px', color: '#111827', margin: '0 0 12px', fontWeight: '500' as const }
const hr = { borderColor: '#E5E7EB', margin: '24px 0' }
const logBox = { backgroundColor: '#FAFAFA', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '12px 14px', margin: '0 0 20px' }
const logRow = { fontSize: '13px', color: '#374151', margin: '0 0 6px', lineHeight: '1.5' }
const logTime = { color: '#6B7280' }
const logAction = { color: '#111827', fontWeight: '600' as const }
const logResource = { color: '#6B7280' }
const logMore = { fontSize: '12px', color: '#6B7280', fontStyle: 'italic' as const, margin: '8px 0 0' }
const buttonWrap = { textAlign: 'center' as const, margin: '28px 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' }
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
