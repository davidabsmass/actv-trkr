/// <reference types="npm:@types/react@^18.3.12" />

import * as React from 'npm:react@^18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for ACTV TRKR</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
            <Img
              src="https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-v5.jpg?v=20260421d"
              alt="ACTV TRKR"
              width="600"
              height="208"
              style={headerImg}
            />
          </a>
        </Section>
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Thanks for signing up. Confirm your email address (
          <Link href={`mailto:${recipient}`} style={link}>{recipient}</Link>
          ) to get started with your analytics dashboard.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Verify Email
        </Button>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { padding: '0', maxWidth: '600px', width: '100%', margin: '0 auto' }
const headerSection = { marginBottom: '0', width: '100%', maxWidth: '600px' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0', outline: 'none', textDecoration: 'none', objectFit: 'cover' as const }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#6B7280', lineHeight: '1.6', margin: '0 0 24px' }
const link = { color: '#6C5CE7', textDecoration: 'underline' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '12px', padding: '12px 24px', textDecoration: 'none', textAlign: 'left' as const}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '32px 0 0' }
