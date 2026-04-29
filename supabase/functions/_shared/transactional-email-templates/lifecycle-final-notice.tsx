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
  deletionDate?: string
}

const Email = ({ name, deletionDate }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Final notice — your data will be deleted soon</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt={SITE_NAME} width="140" />
        </Section>
        <Section style={contentSection}>
          <Heading style={h1}>{name ? `Hi ${name},` : 'Hi there,'}</Heading>
          <Text style={textBold}>
            This is the final notice before your {SITE_NAME} data is permanently deleted{deletionDate ? ` on ${deletionDate}` : ' in about 10 days'}.
          </Text>
          <Text style={text}>
            Your account has been archived since your subscription ended. After deletion, your dashboards, reports, tracking history, and site settings cannot be recovered.
          </Text>
          <Text style={text}>
            If you'd like to keep your data and resume tracking, reactivate now — it takes less than a minute.
          </Text>
          <Section style={{ textAlign: 'left', margin: '28px 0' }}>
            <Button href={`${APP_URL}/account`} style={btn}>Reactivate now</Button>
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
  subject: `Final notice — your ${SITE_NAME} data will be deleted soon`,
  displayName: 'Lifecycle: final notice (day 80)',
  previewData: { name: 'Jane', deletionDate: 'June 19, 2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', margin: '0 auto' }
const logoSection = { padding: '32px 32px 0' }
const contentSection = { padding: '24px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const textBold = { ...text, fontWeight: 'bold' as const, color: '#B91C1C' }
const btn = { backgroundColor: '#B91C1C', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '15px', textDecoration: 'none', fontWeight: 'bold' as const, textAlign: 'left' as const}
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
