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
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const HEADER_URL = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-welcome-v1.jpg?v=20260424'

interface WelcomeEmailProps {
  name?: string
  setPasswordUrl?: string
}

const WelcomeEmail = ({ name, setPasswordUrl }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — set your password to get started</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header */}
        <Section style={headerSection}>
          <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
            <Img
              src={HEADER_URL}
              alt={SITE_NAME}
              width="600"
              height="260"
              style={headerImg}
            />
          </a>
        </Section>

        <Section style={contentSection}>
          <Heading style={h1}>
            {name ? `Hi ${name},` : 'Hi there,'}
          </Heading>

          <Text style={text}>Welcome to ACTV TRKR.</Text>

          <Text style={text}>
            Your account has been created, and you're ready to get started. To access your dashboard, you'll first need to set your password.
          </Text>

          <Text style={text}>
            Click below to create your password and activate your account:
          </Text>

          <Section style={buttonWrap}>
            <Button style={button} href={setPasswordUrl || 'https://actvtrkr.com/reset-password'}>
              Set Your Password
            </Button>
          </Section>

          <Text style={text}>
            Once you log in, we'll take you straight to the setup instructions page so you can install the plugin, connect your WordPress site, and start tracking your data.
          </Text>

          <Text style={text}>
            If you need help at any point, just reply to this email and we'll point you in the right direction.
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
  component: WelcomeEmail,
  subject: `Welcome to ${SITE_NAME} — Set your password to get started`,
  displayName: 'Welcome / account activation',
  previewData: { name: 'David', setPasswordUrl: 'https://actvtrkr.com/reset-password?token=example' },
} satisfies TemplateEntry

/* ── Styles ─────────────────────────────────────────── */

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const container = {
  maxWidth: '600px',
  width: '100%',
  margin: '0 auto',
}

const headerSection = {
  marginBottom: '0',
  width: '100%',
  maxWidth: '600px',
}

const headerImg = {
  width: '100%',
  maxWidth: '600px',
  height: 'auto' as const,
  display: 'block' as const,
  border: '0',
  outline: 'none',
  textDecoration: 'none',
  objectFit: 'contain' as const,
  msInterpolationMode: 'bicubic' as const,
}

const contentSection = {
  padding: '32px 32px 40px',
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

const buttonWrap = {
  textAlign: 'center' as const,
  margin: '28px 0',
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