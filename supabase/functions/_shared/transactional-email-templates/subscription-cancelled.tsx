/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const LOGO_URL = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-logo-dark.png'

interface SubscriptionCancelledProps {
  name?: string
}

const SubscriptionCancelledEmail = ({ name }: SubscriptionCancelledProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} subscription has been cancelled</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Logo header */}
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="140" />
        </Section>

        <Section style={contentSection}>
          <Heading style={h1}>
            {name ? `Hi ${name},` : 'Hi there,'}
          </Heading>

          <Text style={text}>
            Your {SITE_NAME} subscription has been cancelled.
          </Text>

          <Text style={textBold}>
            We'll keep your data for 30 days. After that, your account and all associated data will be permanently removed.
          </Text>

          <Text style={text}>
            If you change your mind, simply log back in and resubscribe before the 30-day window closes. All of your tracking data, reports, and settings will still be there.
          </Text>

          <Text style={text}>
            If you have any questions or feedback, just reply to this email — we'd love to hear from you.
          </Text>

          <Text style={signoff}>
            Thanks,
          </Text>
          <Text style={signoffTeam}>
            The {SITE_NAME} Team
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SubscriptionCancelledEmail,
  subject: `Your ${SITE_NAME} subscription has been cancelled`,
  displayName: 'Subscription cancelled',
  previewData: { name: 'Jane' },
} satisfies TemplateEntry

/* ── Styles ─────────────────────────────────────────── */

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const container = {
  maxWidth: '600px',
  margin: '0 auto',
}

const logoSection = {
  padding: '32px 32px 0',
}

const contentSection = {
  padding: '24px 32px 40px',
}

const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#00264D',
  margin: '0 0 20px',
  lineHeight: '1.3',
}

const text = {
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.7',
  margin: '0 0 16px',
}

const textBold = {
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.7',
  margin: '0 0 16px',
  fontWeight: 'bold' as const,
}

const signoff = {
  fontSize: '15px',
  color: '#4B5563',
  margin: '24px 0 0',
  lineHeight: '1.5',
}

const signoffTeam = {
  fontSize: '15px',
  color: '#4B5563',
  margin: '0',
  lineHeight: '1.5',
}
