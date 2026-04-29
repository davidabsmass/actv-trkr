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
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const HEADER_URL = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-others-v1.jpg'

interface Login2faCodeProps {
  code?: string
  expiresInMinutes?: number
  ipHint?: string
  userAgentHint?: string
}

const Login2faCodeEmail = ({ code, expiresInMinutes = 10, ipHint, userAgentHint }: Login2faCodeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your ${SITE_NAME} sign-in code: ${code ?? ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
            <Img src={HEADER_URL} alt={SITE_NAME} width="600" style={headerImg} />
          </a>
        </Section>

        <Section style={contentSection}>
          <Heading style={h1}>Your sign-in code</Heading>

          <Text style={text}>
            Use this code to finish signing in to {SITE_NAME}. It expires in {expiresInMinutes} minutes.
          </Text>

          <Section style={codeWrap}>
            <Text style={codeStyle}>{code}</Text>
          </Section>

          <Text style={text}>
            If you didn't try to sign in, you can safely ignore this email — your account stays locked.
          </Text>

          {(ipHint || userAgentHint) && (
            <Section style={metaWrap}>
              <Text style={metaText}>Sign-in attempt details:</Text>
              {userAgentHint && <Text style={metaText}>• Device: {userAgentHint}</Text>}
              {ipHint && <Text style={metaText}>• Location hint: {ipHint}</Text>}
            </Section>
          )}

          <Text style={signoff}>Stay secure,</Text>
          <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Login2faCodeEmail,
  subject: (data: Record<string, any>) => `${data?.code ?? '••••••'} is your ${SITE_NAME} sign-in code`,
  displayName: 'Login 2FA code',
  previewData: { code: '482915', expiresInMinutes: 10, ipHint: 'United States', userAgentHint: 'Chrome on macOS' },
} satisfies TemplateEntry

/* ── Styles ─────────────────────────────────────────── */

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
}

const container = { maxWidth: '600px', margin: '0 auto', width: '100%' }
const headerSection = { marginBottom: '0', lineHeight: '0' as const, fontSize: '0' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0', outline: 'none', textDecoration: 'none' }
const contentSection = { padding: '32px 32px 40px' }

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

const codeWrap = {
  textAlign: 'left' as const,
  margin: '28px 0',
}

const codeStyle = {
  display: 'inline-block',
  fontSize: '34px',
  fontWeight: '700' as const,
  letterSpacing: '0.4em',
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  color: '#00264D',
  backgroundColor: '#F3F4F6',
  borderRadius: '12px',
  padding: '18px 24px',
  margin: '0', textAlign: 'left' as const}

const metaWrap = {
  marginTop: '24px',
  padding: '12px 16px',
  backgroundColor: '#F9FAFB',
  borderRadius: '8px', textAlign: 'left' as const}

const metaText = {
  fontSize: '12px',
  color: '#6B7280',
  margin: '2px 0',
  lineHeight: '1.5',
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
