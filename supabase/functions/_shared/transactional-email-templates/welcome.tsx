/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const LOGO_URL = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-logo-dark.svg'

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — your analytics dashboard is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header with gradient accent */}
        <Section style={headerSection}>
          <div style={gradientBar} />
          <Section style={logoWrap}>
            <Img src={LOGO_URL} alt={SITE_NAME} width="180" height="auto" style={logoImg} />
          </Section>
        </Section>

        <Section style={contentSection}>
          <Heading style={h1}>
            {name ? `Welcome aboard, ${name}!` : 'Welcome aboard!'}
          </Heading>

          <Text style={leadText}>
            Your {SITE_NAME} dashboard is ready. Here's what you can do right away:
          </Text>

          {/* Feature highlights */}
          <Section style={featureCard}>
            <Text style={featureTitle}>📊 Real-Time Analytics</Text>
            <Text style={featureDesc}>
              Track pageviews, sessions, and visitor behavior as it happens across all your sites.
            </Text>
          </Section>

          <Section style={featureCard}>
            <Text style={featureTitle}>🎯 Lead & Form Tracking</Text>
            <Text style={featureDesc}>
              See every form submission, conversion rate, and lead source — attributed to the right campaign.
            </Text>
          </Section>

          <Section style={featureCard}>
            <Text style={featureTitle}>🔍 SEO Monitoring</Text>
            <Text style={featureDesc}>
              Automated SEO scans find issues and suggest one-click fixes to improve your rankings.
            </Text>
          </Section>

          <Section style={featureCard}>
            <Text style={featureTitle}>🛡️ Uptime & Security</Text>
            <Text style={featureDesc}>
              24/7 uptime monitoring with instant alerts, plus security event tracking and SSL checks.
            </Text>
          </Section>

          <Hr style={divider} />

          <Text style={ctaIntro}>
            Get started by installing the tracking plugin on your WordPress site:
          </Text>

          <Section style={buttonWrap}>
            <Button style={button} href="https://actvtrkr.com/get-started">
              Get Started →
            </Button>
          </Section>

          <Text style={footerText}>
            Need help? Just reply to this email — we're here for you.
          </Text>

          <Text style={signoff}>
            — The {SITE_NAME} Team
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: `Welcome to ${SITE_NAME} — Let's get tracking`,
  displayName: 'Welcome email',
  previewData: { name: 'Alex' },
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

const headerSection = {
  marginBottom: '0',
}

const gradientBar = {
  height: '4px',
  background: 'linear-gradient(135deg, #6C5CE7, #8B7CF7)',
  borderRadius: '4px 4px 0 0',
}

const logoWrap = {
  padding: '28px 32px 20px',
  backgroundColor: '#F8F9FC',
}

const logoImg = { margin: '0' }

const contentSection = {
  padding: '32px 32px 40px',
}

const h1 = {
  fontSize: '24px',
  fontWeight: 'bold' as const,
  color: '#00264D',
  margin: '0 0 12px',
  lineHeight: '1.3',
}

const leadText = {
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.6',
  margin: '0 0 28px',
}

const featureCard = {
  backgroundColor: '#F8F9FC',
  borderRadius: '10px',
  padding: '16px 20px',
  marginBottom: '12px',
}

const featureTitle = {
  fontSize: '15px',
  fontWeight: '600' as const,
  color: '#00264D',
  margin: '0 0 4px',
}

const featureDesc = {
  fontSize: '13px',
  color: '#6B7280',
  lineHeight: '1.5',
  margin: '0',
}

const divider = {
  borderColor: '#E5E7EB',
  margin: '28px 0',
}

const ctaIntro = {
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.5',
  margin: '0 0 20px',
}

const buttonWrap = {
  textAlign: 'center' as const,
  marginBottom: '28px',
}

const button = {
  backgroundColor: '#6C5CE7',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '14px 32px',
  textDecoration: 'none',
  display: 'inline-block',
}

const footerText = {
  fontSize: '13px',
  color: '#9CA3AF',
  lineHeight: '1.5',
  margin: '0 0 8px',
}

const signoff = {
  fontSize: '13px',
  color: '#9CA3AF',
  margin: '0',
}