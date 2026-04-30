/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const HEADER_URL = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-welcome-v1.jpg?v=20260424'

interface Props { name?: string }

const Email = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Ask Nova: "Where are my leads coming from?"</Preview>
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
            Quick tip for day three: try asking your AI agent a real question.
          </Text>

          <Text style={quote}>
            "Where are my leads coming from?"
          </Text>

          <Text style={text}>
            Nova will pull from your live data and tell you exactly which sources, campaigns, and pages are producing results — no spreadsheets, no digging through reports.
          </Text>

          <Text style={text}>
            It's the fastest way to get a feel for how {SITE_NAME} thinks. From there, you can ask follow-ups like "which page converts best?" or "which day of the week drives the most leads?"
          </Text>

          <Section style={buttonWrap}>
            <Button style={button} href="https://actvtrkr.com/dashboard">
              Open Your Dashboard & Ask Nova
            </Button>
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
  subject: 'Ask your AI agent: where are my leads coming from?',
  displayName: 'Onboarding · Day 3 — Ask the AI agent',
  previewData: { name: 'David' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', width: '100%', margin: '0 auto' }
const headerSection = { marginBottom: '0', width: '100%', maxWidth: '600px' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0', outline: 'none', textDecoration: 'none', objectFit: 'contain' as const, msInterpolationMode: 'bicubic' as const }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const quote = { fontSize: '17px', color: '#00264D', fontStyle: 'italic' as const, lineHeight: '1.5', margin: '20px 0 24px', padding: '14px 18px', borderLeft: '4px solid #6C5CE7', backgroundColor: '#F5F4FF' }
const buttonWrap = { textAlign: 'left' as const, margin: '28px 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block', textAlign: 'left' as const }
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
