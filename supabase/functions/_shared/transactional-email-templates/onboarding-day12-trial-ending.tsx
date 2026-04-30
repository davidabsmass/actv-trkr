/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const HEADER_URL = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-welcome-v1.jpg?v=20260424'

interface Props { name?: string; daysLeft?: number }

const Email = ({ name, daysLeft = 2 }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} trial ends in {daysLeft} day{daysLeft === 1 ? '' : 's'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
            <Img src={HEADER_URL} alt={SITE_NAME} width="600" height="260" style={headerImg} />
          </a>
        </Section>
        <Section style={contentSection}>
          <Heading style={h1}>{name ? `Hi ${name},` : 'Hi there,'}</Heading>

          <Text style={text}>
            Your {SITE_NAME} free trial ends in <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong>. After that, your subscription will start automatically — no action needed if you'd like to keep going.
          </Text>

          <Text style={text}>
            If {SITE_NAME} isn't a fit, you can cancel anytime from your account before the trial ends. <strong>Here's what you'd lose access to:</strong>
          </Text>

          <ul style={list}>
            <li style={listItem}>Live visitor and conversion tracking on your site</li>
            <li style={listItem}>Lead capture, scoring, and Visitor Journeys</li>
            <li style={listItem}>Your AI agent (Nova) and AI-generated insights</li>
            <li style={listItem}>Form analytics, funnels, and Key Action reporting</li>
            <li style={listItem}>SEO scanning, uptime monitoring, and security alerts</li>
            <li style={listItem}>All historical data collected during your trial</li>
          </ul>

          <Section style={buttonWrap}>
            <Button style={button} href="https://actvtrkr.com/account">
              Manage Your Subscription
            </Button>
          </Section>

          <Text style={text}>
            Questions before your trial ends? Just reply to this email — we're happy to help.
          </Text>

          <Text style={signoff}>Thanks,</Text>
          <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: `Your ${SITE_NAME} trial ends soon`,
  displayName: 'Onboarding · Day 12 — Trial ending',
  previewData: { name: 'David', daysLeft: 2 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', width: '100%', margin: '0 auto' }
const headerSection = { marginBottom: '0', width: '100%', maxWidth: '600px' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0', outline: 'none', textDecoration: 'none', objectFit: 'contain' as const, msInterpolationMode: 'bicubic' as const }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const list = { margin: '8px 0 24px', paddingLeft: '22px', color: '#4B5563', fontSize: '15px', lineHeight: '1.7' }
const listItem = { margin: '0 0 6px' }
const buttonWrap = { textAlign: 'left' as const, margin: '28px 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block', textAlign: 'left' as const }
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
