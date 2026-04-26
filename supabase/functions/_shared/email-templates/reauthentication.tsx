/// <reference types="npm:@types/react@^18.3.12" />

import * as React from 'npm:react@^18.3.1'

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

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
            <Img
              src="https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-others-v1.jpg"
              alt="ACTV TRKR"
              width="600"
              height="208"
              style={headerImg}
            />
          </a>
        </Section>
        <Section style={bodySection}>
          <Heading style={h1}>Confirm reauthentication</Heading>
          <Text style={text}>Use the code below to confirm your identity:</Text>
          <Text style={codeStyle}>{token}</Text>
          <Text style={footer}>
            This code will expire shortly. If you didn't request this, you can safely ignore this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { padding: '0', maxWidth: '600px', width: '100%', margin: '0 auto' }
const headerSection = { marginBottom: '0', width: '100%', maxWidth: '600px' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0', outline: 'none', textDecoration: 'none', objectFit: 'cover' as const }
const bodySection = { padding: '40px 25px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#6B7280', lineHeight: '1.6', margin: '0 0 24px' }
const codeStyle = { fontFamily: 'Courier, monospace', fontSize: '28px', fontWeight: 'bold' as const, color: '#6C5CE7', margin: '0 0 30px', letterSpacing: '4px' }
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '32px 0 0' }
