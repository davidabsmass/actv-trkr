/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { account_name?: string; dashboard_url?: string; setup_url?: string }

const Email = ({ account_name, dashboard_url, setup_url }: Props) => (
  <Html lang="en"><Head /><Preview>Welcome to ACTV TRKR — let's get you set up</Preview>
    <Body style={{ background: '#0b0f17', fontFamily: 'system-ui, sans-serif', color: '#e6e8ee', margin: 0 }}>
      <Container style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
        <Heading style={{ color: '#fff', fontSize: 22 }}>Welcome to ACTV TRKR{account_name ? `, ${account_name}` : ''}</Heading>
        <Text>You're in. Two quick steps to start tracking:</Text>
        <Section style={{ background: '#11151f', borderRadius: 8, padding: 16, margin: '16px 0' }}>
          <Text style={{ margin: 0 }}><strong>1.</strong> Install the WordPress plugin</Text>
          <Text style={{ margin: '8px 0 0 0' }}><strong>2.</strong> Add your site &amp; activate</Text>
        </Section>
        <Button href={setup_url || dashboard_url || 'https://actvtrkr.com/get-started'} style={{ background: '#3b82f6', color: '#fff', padding: '12px 20px', borderRadius: 8, textDecoration: 'none' }}>Open setup guide</Button>
        <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 24 }}>Reply to this email if you need a hand — we read every message.</Text>
      </Container>
    </Body>
  </Html>
)

export const template: TemplateEntry = {
  component: Email,
  subject: () => "Welcome to ACTV TRKR — let's get you set up",
  displayName: 'Retention · Welcome',
  previewData: { account_name: 'Acme Ortho', dashboard_url: 'https://actvtrkr.com/dashboard', setup_url: 'https://actvtrkr.com/get-started' },
}
