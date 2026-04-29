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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join ACTV TRKR</Preview>
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
          <Heading style={h1}>You've been invited</Heading>
          <Text style={text}>
            You've been invited to join ACTV TRKR. Click below to accept and create your account.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Accept Invitation
          </Button>
          <Text style={footer}>
            If you weren't expecting this invitation, you can safely ignore this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { padding: '0', maxWidth: '600px', width: '100%', margin: '0 auto' }
const headerSection = { marginBottom: '0', width: '100%', maxWidth: '600px' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0', outline: 'none', textDecoration: 'none', objectFit: 'cover' as const }
const bodySection = { padding: '40px 25px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#6B7280', lineHeight: '1.6', margin: '0 0 24px' }
const link = { color: '#6C5CE7', textDecoration: 'underline' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, borderRadius: '12px', padding: '12px 24px', textDecoration: 'none', textAlign: 'left' as const}
const footer = { fontSize: '12px', color: '#9CA3AF', margin: '32px 0 0' }
