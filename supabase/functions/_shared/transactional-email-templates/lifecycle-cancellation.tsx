/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const LOGO_URL = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-logo-dark.png'
const APP_URL = 'https://actvtrkr.com'

interface Props {
  name?: string
  graceEndsAt?: string
}

const Email = ({ name, graceEndsAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your tracking is paused — data is safe for 30 days</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="140" />
        </Section>
        <Section style={contentSection}>
          <Heading style={h1}>{name ? `Hi ${name},` : 'Hi there,'}</Heading>
          <Text style={text}>
            Your {SITE_NAME} subscription has been cancelled, so tracking is now paused on all your sites.
          </Text>
          <Text style={textBold}>
            Good news: your data is safe. We'll keep everything intact for the next 30 days{graceEndsAt ? ` (through ${graceEndsAt})` : ''}.
          </Text>
          <Text style={text}>
            Reactivate any time before then and your dashboards, reports, sites, and history will pick up exactly where you left off.
          </Text>
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={`${APP_URL}/account`} style={btn}>Reactivate subscription</Button>
          </Section>
          <Text style={signoff}>Thanks,</Text>
          <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: `Your ${SITE_NAME} tracking is paused — data is safe for 30 days`,
  displayName: 'Lifecycle: cancellation',
  previewData: { name: 'Jane', graceEndsAt: 'May 20, 2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const logoSection = { padding: '32px 32px 0' }
const contentSection = { padding: '24px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const textBold = { ...text, fontWeight: 'bold' as const }
const btn = { backgroundColor: '#00264D', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '15px', textDecoration: 'none', fontWeight: 'bold' as const }
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
