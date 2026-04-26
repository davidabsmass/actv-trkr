/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { account_name?: string; dashboard_url?: string }

const Email = ({ account_name, dashboard_url }: Props) => (
  <Html lang="en"><Head /><Preview>Your first insight is in</Preview>
    <Body style={{ background: '#0b0f17', fontFamily: 'system-ui, sans-serif', color: '#e6e8ee', margin: 0 }}>
      <Container style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
        <Heading style={{ color: '#fff', fontSize: 22 }}>Your first insight is in{account_name ? `, ${account_name}` : ''}</Heading>
        <Text>We just generated your first AI-powered performance summary. Take a look — it spotlights what's working and what to fix next.</Text>
        <Button href={dashboard_url || 'https://actvtrkr.com/reports'} style={{ background: '#3b82f6', color: '#fff', padding: '12px 20px', borderRadius: 8, textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>View insight</Button>
      </Container>
    </Body>
  </Html>
)

export const template: TemplateEntry = {
  component: Email,
  subject: () => 'Your first insight is in',
  displayName: 'Retention · First insight',
  previewData: { account_name: 'Acme Ortho', dashboard_url: 'https://actvtrkr.com/reports' },
}
