/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ContactMessageProps {
  reason?: string
  name?: string
  email?: string
  message?: string
  submittedAt?: string
}

const ContactMessageEmail = ({
  reason, name, email, message, submittedAt,
}: ContactMessageProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New contact form submission: ${reason || 'General'}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={contentSection}>
          <Heading style={h1}>New contact form submission</Heading>

          <Section style={meta}>
            <MetaRow label="Reason" value={reason} />
            <MetaRow label="From" value={`${name || 'Anonymous'}${email ? ` <${email}>` : ''}`} />
            {submittedAt && <MetaRow label="Submitted" value={submittedAt} />}
          </Section>

          <Section style={card}>
            <Text style={cardLabel}>Message</Text>
            <Text style={cardPreview}>{message || '(no message)'}</Text>
          </Section>

          {email && (
            <Text style={replyHint}>
              Reply directly to <a href={`mailto:${email}`} style={link}>{email}</a> to respond to this person.
            </Text>
          )}
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
  component: ContactMessageEmail,
  to: 'david@absmass.com',
  subject: (data: Record<string, any>) =>
    `[ACTV TRKR Contact] ${data?.reason || 'General'}${data?.name ? ` — ${data.name}` : ''}`,
  displayName: 'Contact form message',
  previewData: {
    reason: 'Question',
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'Hi, I had a quick question about how attribution works on subdomains.',
    submittedAt: new Date().toISOString(),
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
const cardPreview = { fontSize: '14px', color: '#374151', margin: '0', lineHeight: '1.6', whiteSpace: 'pre-wrap' as const }
const replyHint = { fontSize: '13px', color: '#6B7280', margin: '16px 0 0', lineHeight: '1.5' }
const link = { color: '#6C5CE7', textDecoration: 'underline' }
