/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const HEADER_URL =
  'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-others-v1.jpg'

interface EmailChangeCancelProps {
  newEmail?: string
  effectiveAtISO?: string
  cancelUrl?: string
  ipHint?: string
  userAgentHint?: string
}

const fmtTime = (iso?: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }) + ' UTC'
  } catch {
    return iso
  }
}

const EmailChangeCancelEmail = ({
  newEmail,
  effectiveAtISO,
  cancelUrl,
  ipHint,
  userAgentHint,
}: EmailChangeCancelProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your account email is being changed — you have 1 hour to cancel</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
            <Img src={HEADER_URL} alt={SITE_NAME} width="600" style={headerImg} />
          </a>
        </Section>

        <Section style={contentSection}>
          <Heading style={h1}>Confirm: your email is being changed</Heading>

          <Text style={text}>
            A request was just made to change the email on your {SITE_NAME} account
            {newEmail ? <> to <strong>{newEmail}</strong></> : null}.
          </Text>

          <Text style={text}>
            The change will take effect at <strong>{fmtTime(effectiveAtISO)}</strong> (about 1 hour
            from now). Until then, you can cancel it with one click — even if someone has access to
            your session.
          </Text>

          {(ipHint || userAgentHint) && (
            <Section style={metaWrap}>
              {userAgentHint && <Text style={metaText}>Device: {userAgentHint}</Text>}
              {ipHint && <Text style={metaText}>Location hint: {ipHint}</Text>}
            </Section>
          )}

          <Text style={text}>
            <strong>If you didn&apos;t request this</strong>, click the button below immediately.
          </Text>

          {cancelUrl && (
            <Section style={ctaWrap}>
              <Button href={cancelUrl} style={ctaButton}>
                Cancel this email change
              </Button>
            </Section>
          )}

          {cancelUrl && (
            <Text style={smallText}>
              Or open this link manually:{' '}
              <Link href={cancelUrl} style={link}>
                {cancelUrl}
              </Link>
            </Text>
          )}

          <Hr style={hr} />
          <Text style={signoff}>Stay secure,</Text>
          <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EmailChangeCancelEmail,
  subject: `[${SITE_NAME}] Confirm your email change (1 hour to cancel)`,
  displayName: 'Email change cancel',
  previewData: {
    newEmail: 'new@example.com',
    effectiveAtISO: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    cancelUrl: 'https://actvtrkr.com/auth/cancel-email-change?token=preview',
    ipHint: 'United States',
    userAgentHint: 'Chrome on macOS',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto', width: '100%' }
const headerSection = { marginBottom: '0', lineHeight: '0' as const, fontSize: '0' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0' }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const smallText = { fontSize: '12px', color: '#6B7280', lineHeight: '1.6', margin: '8px 0 0', wordBreak: 'break-all' as const }
const metaWrap = { margin: '20px 0 24px', padding: '14px 16px', backgroundColor: '#F9FAFB', borderRadius: '8px' }
const metaText = { fontSize: '13px', color: '#374151', margin: '3px 0', lineHeight: '1.5' }
const ctaWrap = { textAlign: 'center' as const, margin: '24px 0 12px' }
const ctaButton = {
  backgroundColor: '#DC2626',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block',
}
const link = { color: '#00264D', textDecoration: 'underline' }
const hr = { borderColor: '#E5E7EB', margin: '28px 0 18px' }
const signoff = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
