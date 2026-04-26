/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
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

export interface AuthSecurityAlertProps {
  headline?: string
  description?: string
  whenISO?: string
  ipHint?: string
  userAgentHint?: string
  killUrl?: string
  showKillButton?: boolean
}

const HEADLINES: Record<string, { headline: string; description: string }> = {
  new_device_login: {
    headline: 'New sign-in to your account',
    description: 'Someone signed in to your ACTV TRKR account from a new device or location.',
  },
  password_changed: {
    headline: 'Your password was changed',
    description: 'The password on your ACTV TRKR account was just changed.',
  },
  email_changed: {
    headline: 'Your account email is being changed',
    description:
      'A request was made to change the email address on your ACTV TRKR account. The change is on a 1-hour delay so you have time to cancel it.',
  },
  password_reset_requested: {
    headline: 'Password reset requested',
    description: 'Someone asked to reset the password on your ACTV TRKR account.',
  },
  too_many_failed_logins: {
    headline: 'Multiple failed sign-in attempts',
    description: 'We saw 5 or more failed sign-in attempts on your account in the last 10 minutes.',
  },
  step_up_failed: {
    headline: 'Failed admin re-verification',
    description:
      'Someone with access to your session tried to re-verify your password to perform a sensitive admin action — and got it wrong.',
  },
  mfa_code_new_device: {
    headline: 'Sign-in code requested from a new device',
    description: 'A 2FA sign-in code was just emailed to you for a sign-in from a new device.',
  },
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

const AuthSecurityAlertEmail = ({
  headline,
  description,
  whenISO,
  ipHint,
  userAgentHint,
  killUrl,
  showKillButton = true,
}: AuthSecurityAlertProps) => {
  const safeHeadline = headline || 'Security alert on your account'
  const safeDescription =
    description ||
    'A security-relevant event was just recorded on your ACTV TRKR account. Review the details below.'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{safeHeadline}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
              <Img src={HEADER_URL} alt={SITE_NAME} width="600" style={headerImg} />
            </a>
          </Section>

          <Section style={contentSection}>
            <Heading style={h1}>{safeHeadline}</Heading>

            <Text style={text}>{safeDescription}</Text>

            <Section style={metaWrap}>
              {whenISO && <Text style={metaText}>When: {fmtTime(whenISO)}</Text>}
              {userAgentHint && <Text style={metaText}>Device: {userAgentHint}</Text>}
              {ipHint && <Text style={metaText}>Location hint: {ipHint}</Text>}
            </Section>

            <Text style={text}>
              <strong>If this was you</strong>, you can ignore this email — no action is needed.
            </Text>

            {showKillButton && killUrl && (
              <>
                <Text style={text}>
                  <strong>If this wasn&apos;t you</strong>, click the button below right now. We&apos;ll
                  immediately sign you out everywhere, lock your account, and email you a recovery link.
                </Text>
                <Section style={ctaWrap}>
                  <Button href={killUrl} style={ctaButton}>
                    This wasn&apos;t me — lock my account
                  </Button>
                </Section>
                <Text style={smallText}>
                  Or open this link manually:{' '}
                  <Link href={killUrl} style={link}>
                    {killUrl}
                  </Link>
                </Text>
              </>
            )}

            <Hr style={hr} />
            <Text style={signoff}>Stay secure,</Text>
            <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AuthSecurityAlertEmail,
  subject: (data: Record<string, any>) => {
    const h = data?.headline || (data?.eventType && HEADLINES[data.eventType]?.headline)
    return h ? `[${SITE_NAME}] ${h}` : `[${SITE_NAME}] Security alert on your account`
  },
  displayName: 'Auth security alert',
  previewData: {
    eventType: 'new_device_login',
    headline: HEADLINES.new_device_login.headline,
    description: HEADLINES.new_device_login.description,
    whenISO: new Date().toISOString(),
    ipHint: 'United States',
    userAgentHint: 'Chrome on macOS',
    killUrl: 'https://actvtrkr.com/auth/kill?token=preview',
    showKillButton: true,
  },
} satisfies TemplateEntry

export const AUTH_ALERT_HEADLINES = HEADLINES

/* Styles */
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
const ctaWrap = { textAlign: 'left' as const, margin: '24px 0 12px' }
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
