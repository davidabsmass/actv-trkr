/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const APP_URL = 'https://actvtrkr.com'

interface SupportTicketUpdateProps {
  recipientName?: string
  ticketNumber?: number | string
  subject?: string
  eventKind?: 'created' | 'admin_replied' | 'status_changed' | 'shipped'
  statusLabel?: string
  messagePreview?: string
  ticketUrl?: string
}

const headlineFor = (kind?: string, ticketNumber?: number | string) => {
  switch (kind) {
    case 'created': return `We received your request — ticket #${ticketNumber}`
    case 'admin_replied': return `New reply on ticket #${ticketNumber}`
    case 'status_changed': return `Update on ticket #${ticketNumber}`
    case 'shipped': return `Your feature request shipped 🎉`
    default: return `Update on ticket #${ticketNumber}`
  }
}

const bodyFor = (kind?: string, statusLabel?: string) => {
  switch (kind) {
    case 'created':
      return "Thanks for reaching out. We've created a ticket and our team will follow up as soon as possible. You can reply directly inside the app to add details or share more context."
    case 'admin_replied':
      return "Our team just replied to your ticket. Open it in the app to read the response and continue the conversation."
    case 'status_changed':
      return `Status is now ${statusLabel || 'updated'}. You can view the full thread and add a reply at any time.`
    case 'shipped':
      return "The feature you requested has shipped. Thanks for helping shape the product — we'd love to know what you think."
    default:
      return 'Open your ticket in the app to view the latest updates.'
  }
}

const SupportTicketUpdateEmail = ({
  recipientName, ticketNumber, subject, eventKind, statusLabel, messagePreview, ticketUrl,
}: SupportTicketUpdateProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{headlineFor(eventKind, ticketNumber)}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={contentSection}>
          <Heading style={h1}>{headlineFor(eventKind, ticketNumber)}</Heading>

          <Text style={text}>
            {recipientName ? `Hi ${recipientName},` : 'Hi,'}
          </Text>

          <Text style={text}>{bodyFor(eventKind, statusLabel)}</Text>

          {subject && (
            <Section style={card}>
              <Text style={cardLabel}>Subject</Text>
              <Text style={cardValue}>{subject}</Text>
              {messagePreview && (
                <>
                  <Text style={cardLabel}>Latest update</Text>
                  <Text style={cardPreview}>{messagePreview}</Text>
                </>
              )}
            </Section>
          )}

          <Section style={buttonWrap}>
            <Button style={button} href={ticketUrl || `${APP_URL}/account?tab=support`}>
              View Ticket
            </Button>
          </Section>

          <Text style={text}>
            Just reply inside the app to keep the conversation going. We're here whenever you need us.
          </Text>

          <Text style={signoff}>Thanks,</Text>
          <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportTicketUpdateEmail,
  subject: (data: Record<string, any>) => {
    const t = data?.ticketNumber
    switch (data?.eventKind) {
      case 'created': return `We received your request [Ticket #${t}]`
      case 'admin_replied': return `New reply on your ticket [#${t}]`
      case 'status_changed': return `Ticket #${t} status updated`
      case 'shipped': return `Your feature request shipped 🎉 [#${t}]`
      default: return `Update on ticket #${t}`
    }
  },
  displayName: 'Support ticket update',
  previewData: {
    recipientName: 'David',
    ticketNumber: 1042,
    subject: 'Dashboard chart not loading',
    eventKind: 'admin_replied',
    statusLabel: 'In Progress',
    messagePreview: "We've identified the cause — pushing a fix today.",
    ticketUrl: 'https://actvtrkr.com/account?tab=support&ticket=abc',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const card = { backgroundColor: '#F3F4F6', borderRadius: '10px', padding: '16px 18px', margin: '20px 0', textAlign: 'left' as const}
const cardLabel = { fontSize: '11px', color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px', fontWeight: '600' as const }
const cardValue = { fontSize: '15px', color: '#111827', margin: '0 0 12px', fontWeight: '600' as const }
const cardPreview = { fontSize: '14px', color: '#374151', margin: '0', lineHeight: '1.6' }
const buttonWrap = { textAlign: 'center' as const, margin: '28px 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block', textAlign: 'left' as const}
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
