/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'

interface TrackingStalledProps {
  name?: string
  domain?: string
  startedAt?: string
}

const TrackingStalledEmail = ({ name, domain, startedAt }: TrackingStalledProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Tracking is offline for {domain || 'your site'} — quick fix inside</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={contentSection}>
          <Heading style={h1}>
            {name ? `Hi ${name},` : 'Hi there,'}
          </Heading>

          <Text style={text}>
            We noticed that {SITE_NAME} stopped receiving tracking data from{' '}
            <strong>{domain || 'your site'}</strong>
            {startedAt ? ` around ${new Date(startedAt).toLocaleString()}` : ''}.
          </Text>

          <Text style={text}>
            This usually means one of a few things — and almost always takes under a minute to fix.
          </Text>

          <Section style={listBox}>
            <Text style={listTitle}>The most common causes:</Text>
            <Text style={listItem}>• The ACTV TRKR plugin was deactivated or updated</Text>
            <Text style={listItem}>• Your API key was changed or removed</Text>
            <Text style={listItem}>• A caching plugin is stripping our script</Text>
            <Text style={listItem}>• Your site itself is unreachable</Text>
          </Section>

          <Heading style={h2}>How to fix it</Heading>

          <Text style={text}>
            <strong>Step 1.</strong> Log in to your WordPress admin. You should see a red ACTV TRKR banner at the top of the dashboard.
          </Text>
          <Text style={text}>
            <strong>Step 2.</strong> Click <strong>Reconnect Now</strong> in the banner. It will re-test the connection and bring tracking back online.
          </Text>
          <Text style={text}>
            <strong>Step 3.</strong> If the banner doesn't appear, go to <strong>Settings → ACTV TRKR</strong> and click <strong>Test Connection</strong>.
          </Text>

          <Section style={buttonWrap}>
            <Button style={button} href="https://actvtrkr.com/website-setup">
              Open Setup Instructions
            </Button>
          </Section>

          <Text style={text}>
            Once your site reconnects, your dashboard will resume collecting data immediately. You won't need to do anything else.
          </Text>

          <Text style={footer}>
            We only send this kind of email when something needs your attention. You won't get a daily reminder.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TrackingStalledEmail,
  subject: ({ domain }: TrackingStalledProps) =>
    `Tracking is offline for ${domain || 'your site'} — quick fix inside`,
  displayName: 'Tracking stalled — customer alert',
  previewData: { name: 'Jane', domain: 'example.com', startedAt: new Date().toISOString() },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '600px' }
const contentSection = { padding: '10px 0' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#000000', margin: '0 0 20px' }
const h2 = { fontSize: '18px', fontWeight: 'bold', color: '#000000', margin: '28px 0 12px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 16px' }
const listBox = {
  backgroundColor: '#f8f8f8',
  borderRadius: '6px',
  padding: '14px 18px',
  margin: '8px 0 24px', textAlign: 'left' as const}
const listTitle = { fontSize: '14px', color: '#000000', fontWeight: 'bold', margin: '0 0 8px' }
const listItem = { fontSize: '14px', color: '#55575d', margin: '0 0 4px', lineHeight: '1.5' }
const buttonWrap = { textAlign: 'left' as const, margin: '24px 0' }
const button = {
  backgroundColor: '#1a1a1a',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 'bold',
  display: 'inline-block', textAlign: 'left' as const}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0', lineHeight: '1.5' }
