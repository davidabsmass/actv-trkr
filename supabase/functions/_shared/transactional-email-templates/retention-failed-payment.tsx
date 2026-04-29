/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props { account_name?: string; billing_update_url?: string; support_email?: string }

const Email = ({ account_name, billing_update_url, support_email }: Props) => (
  <Html lang="en"><Head /><Preview>Action needed — payment failed</Preview>
    <Body style={{ background: '#0b0f17', fontFamily: 'system-ui, sans-serif', color: '#e6e8ee', margin: 0 }}>
      <Container style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
        <Heading style={{ color: '#fff', fontSize: 22 }}>Payment failed{account_name ? ` — ${account_name}` : ''}</Heading>
        <Text>We weren't able to charge your card for this billing cycle. To keep tracking running without interruption, please update your payment details.</Text>
        <Section style={{ background: '#1e1410', borderLeft: '3px solid #ef4444', borderRadius: 8, padding: 16, margin: '16px 0' }}>
          <Text style={{ margin: 0, color: '#fca5a5' }}>If we can't recover the payment in the next few days, your account will be paused.</Text>
        </Section>
        <Button href={billing_update_url || 'https://actvtrkr.com/account'} style={{ background: '#ef4444', color: '#fff', padding: '12px 20px', borderRadius: 8, textDecoration: 'none', textAlign: 'left'}}>Update payment method</Button>
        <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 24 }}>Questions? Reply to this email or write to {support_email || 'david@absmass.com'}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template: TemplateEntry = {
  component: Email,
  subject: () => 'Action needed — payment failed',
  displayName: 'Retention · Failed payment',
  previewData: { account_name: 'Acme Ortho', billing_update_url: 'https://actvtrkr.com/account', support_email: 'david@absmass.com' },
}
