/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const APP_URL = 'https://actvtrkr.com'

interface AdminNewTicketProps {
  ticketNumber?: number | string
  type?: string
  priority?: string
  subject?: string
  message?: string
  customerName?: string
  customerEmail?: string
  orgName?: string
  siteUrl?: string
  appPath?: string
  ticketUrl?: string
  eventKind?: 'created' | 'customer_replied'
}

const headline = (kind?: string, t?: any) =>
  kind === 'customer_replied'
    ? `Customer replied on ticket #${t}`
    : `New support ticket #${t}`

const AdminNewTicketEmail = ({
  ticketNumber, type, priority, subject, message,
  customerName, customerEmail, orgName, siteUrl, appPath, ticketUrl, eventKind,
}: AdminNewTicketProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{headline(eventKind, ticketNumber)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={contentSection}>
          <Heading style={h1}>{headline(eventKind, ticketNumber)}</Heading>

          <Section style={meta}>
            <MetaRow label="Type" value={type} />
            <MetaRow label="Priority" value={priority} />
            <MetaRow label="From" value={`${customerName || customerEmail || 'Customer'}${customerEmail ? ` <${customerEmail}>` : ''}`} />
            {orgName && <MetaRow label="Org" value={orgName} />}
            {siteUrl && <MetaRow label="Site" value={siteUrl} />}
            {appPath && <MetaRow label="From page" value={appPath} />}
          </Section>

          <Section style={card}>
            <Text style={cardLabel}>Subject</Text>
            <Text style={cardValue}>{subject || '(no subject)'}</Text>
            {message && (
              <>
                <Text style={cardLabel}>Message</Text>
                <Text style={cardPreview}>{message}</Text>
              </>
            )}
          </Section>

          <Section style={buttonWrap}>
            <Button style={button} href={ticketUrl || `${APP_URL}/owner-admin?tab=support`}>
              Open in Inbox
            </Button>
          </Section>
        </Section>
      </Container>
    </Body>
  </Html>
)

const MetaRow = ({ label, value }: { label: string; value?: string }) => (
  <Text style={metaRow}>
    <span style={metaLabel}>{label}: </span>
    <span style={metaValue}>{value || '—'}</span>
  </Text>
)

export const template = {
  component: AdminNewTicketEmail,
  subject: (data: Record<string, any>) =>
    data?.eventKind === 'customer_replied'
      ? `Reply on ticket #${data?.ticketNumber}: ${data?.subject || ''}`.trim()
      : `New ticket #${data?.ticketNumber}: ${data?.subject || ''}`.trim(),
  displayName: 'Admin: new support ticket',
  previewData: {
    ticketNumber: 1042, type: 'bug', priority: 'high',
    subject: 'Dashboard chart not loading', message: 'I refreshed twice and the trends chart stays blank.',
    customerName: 'Jane', customerEmail: 'jane@acme.com', orgName: 'Acme Inc',
    siteUrl: 'acme.com', appPath: '/dashboard', eventKind: 'created',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const meta = { margin: '0 0 16px' }
const metaRow = { fontSize: '13px', color: '#374151', margin: '0 0 4px', lineHeight: '1.5' }
const metaLabel = { color: '#6B7280' as const, fontWeight: '600' as const }
const metaValue = { color: '#111827' as const }
const card = { backgroundColor: '#F3F4F6', borderRadius: '10px', padding: '16px 18px', margin: '12px 0 20px' }
const cardLabel = { fontSize: '11px', color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px', fontWeight: '600' as const }
const cardValue = { fontSize: '15px', color: '#111827', margin: '0 0 12px', fontWeight: '600' as const }
const cardPreview = { fontSize: '14px', color: '#374151', margin: '0', lineHeight: '1.6', whiteSpace: 'pre-wrap' as const }
const buttonWrap = { textAlign: 'center' as const, margin: '20px 0 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '12px 28px', textDecoration: 'none', display: 'inline-block' }
