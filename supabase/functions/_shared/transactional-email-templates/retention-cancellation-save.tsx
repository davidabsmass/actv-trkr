/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { account_name?: string; reason?: string; support_email?: string; pause_url?: string }

const Email = ({ account_name, reason, support_email, pause_url }: Props) => (
  <Html lang="en"><Head /><Preview>Before you go — can we help?</Preview>
    <Body style={{ background: '#0b0f17', fontFamily: 'system-ui, sans-serif', color: '#e6e8ee', margin: 0 }}>
      <Container style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
        <Heading style={{ color: '#fff', fontSize: 22 }}>Before you go{account_name ? `, ${account_name}` : ''}</Heading>
        <Text>We saw you started a cancellation{reason ? ` (reason: ${reason})` : ''}. We'd hate to lose you — here are a few options that might fit better:</Text>
        <Section style={{ background: '#11151f', borderRadius: 8, padding: 16, margin: '16px 0' }}>
          <Text style={{ margin: 0 }}>• <strong>Pause</strong> for 30/60/90 days — keep your data, no charge</Text>
          <Text style={{ margin: '6px 0 0 0' }}>• <strong>Switch plans</strong> — lighter monitoring-only mode</Text>
          <Text style={{ margin: '6px 0 0 0' }}>• <strong>Talk to us</strong> — reply and we'll fix what's not working</Text>
        </Section>
        <Button href={pause_url || 'https://actvtrkr.com/account'} style={{ background: '#3b82f6', color: '#fff', padding: '12px 20px', borderRadius: 8, textDecoration: 'none', textAlign: 'left'}}>Explore options</Button>
        <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 24 }}>Or just reply to this email — {support_email || 'david@absmass.com'} reads every one.</Text>
      </Container>
    </Body>
  </Html>
)

export const template: TemplateEntry = {
  component: Email,
  subject: () => 'Before you go — can we help?',
  displayName: 'Retention · Cancellation save',
  previewData: { account_name: 'Acme Ortho', reason: 'Not using it enough', support_email: 'david@absmass.com', pause_url: 'https://actvtrkr.com/account' },
}
