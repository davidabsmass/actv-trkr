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
    <Preview>Have you followed your Visitor Journeys yet?</Preview>
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
            One week in. Have you followed your <strong>Visitor Journeys</strong> yet?
          </Text>

          <Text style={text}>
            Visitor Journeys show the actual path a person took before they converted — every page, every click, every minute. It's the difference between knowing <em>that</em> someone became a lead and knowing <em>how</em> they did.
          </Text>

          <Text style={text}>
            Pick a recent lead, follow their journey, and you'll usually find one or two pages that quietly do all the heavy lifting. That's where you double down.
          </Text>

          <Section style={buttonWrap}>
            <Button style={button} href="https://actvtrkr.com/leads">
              View Your Visitor Journeys
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
  subject: 'Have you followed your Visitor Journeys yet?',
  displayName: 'Onboarding · Day 7 — Visitor Journeys',
  previewData: { name: 'David' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', width: '100%', margin: '0 auto' }
const headerSection = { marginBottom: '0', width: '100%', maxWidth: '600px' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0', outline: 'none', textDecoration: 'none', objectFit: 'contain' as const, msInterpolationMode: 'bicubic' as const }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const buttonWrap = { textAlign: 'left' as const, margin: '28px 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block', textAlign: 'left' as const }
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
