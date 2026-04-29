/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { account_name?: string; setup_url?: string; support_email?: string }

const Email = ({ account_name, setup_url, support_email }: Props) => (
  <Html lang="en"><Head /><Preview>Need a hand getting set up?</Preview>
    <Body style={{ background: '#0b0f17', fontFamily: 'system-ui, sans-serif', color: '#e6e8ee', margin: 0 }}>
      <Container style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
        <Heading style={{ color: '#fff', fontSize: 22 }}>Need a hand{account_name ? `, ${account_name}` : ''}?</Heading>
        <Text>We noticed your dashboard hasn't received any data yet. Most setups take under 5 minutes — here's the checklist:</Text>
        <Section style={{ background: '#11151f', borderRadius: 8, padding: 16, margin: '16px 0' }}>
          <Text style={{ margin: 0 }}>1. Install the ACTV TRKR plugin in WordPress</Text>
          <Text style={{ margin: '6px 0 0 0' }}>2. Paste your API key in <em>Settings → ACTV TRKR</em></Text>
          <Text style={{ margin: '6px 0 0 0' }}>3. Visit any page on your site to confirm</Text>
        </Section>
        <Button href={setup_url || 'https://actvtrkr.com/get-started'} style={{ background: '#3b82f6', color: '#fff', padding: '12px 20px', borderRadius: 8, textDecoration: 'none', textAlign: 'left'}}>Open setup guide</Button>
        <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 24 }}>Stuck? Reply to this email or write to {support_email || 'david@absmass.com'} — we'll jump in.</Text>
      </Container>
    </Body>
  </Html>
)

export const template: TemplateEntry = {
  component: Email,
  subject: () => 'Need a hand getting set up?',
  displayName: 'Retention · No-data rescue',
  previewData: { account_name: 'Acme Ortho', setup_url: 'https://actvtrkr.com/get-started', support_email: 'david@absmass.com' },
}
