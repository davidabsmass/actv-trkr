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
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const HEADER_URL =
  'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-others-v1.jpg'

interface PasswordResetEmailProps {
  resetCode: string
  resetUrl: string
}

const PasswordResetEmail = ({ resetCode, resetUrl }: PasswordResetEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your ACTV TRKR password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
            <Img src={HEADER_URL} alt={SITE_NAME} width="600" style={headerImg} />
          </a>
        </Section>

        <Section style={contentSection}>
          <Heading style={h1}>Reset your password</Heading>
          <Text style={text}>Use this reset code to set a new password for your ACTV TRKR account.</Text>
          <Text style={code}>{resetCode}</Text>
          <Section style={buttonWrap}>
            <Button style={button} href={resetUrl}>Set new password</Button>
          </Section>
          <Text style={text}>This code expires soon. If you didn&apos;t request this, you can safely ignore this email.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PasswordResetEmail,
  subject: `Reset your ${SITE_NAME} password`,
  displayName: 'Password reset code',
  previewData: {
    resetCode: '123456',
    resetUrl: 'https://actvtrkr.com/reset-password?email=user%40example.com',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto', width: '100%' }
const headerSection = { marginBottom: '0', lineHeight: '0' as const, fontSize: '0' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0' }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const code = { fontSize: '30px', letterSpacing: '6px', fontWeight: '700' as const, color: '#00264D', margin: '4px 0 24px' }
const buttonWrap = { textAlign: 'center' as const, margin: '28px 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' }