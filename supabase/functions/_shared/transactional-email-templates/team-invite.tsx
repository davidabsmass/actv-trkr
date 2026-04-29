/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'
const HEADER_URL = 'https://qnnxlvoybbmmqoxuqyvf.supabase.co/storage/v1/object/public/email-assets/actv-trkr-email-header-others-v1.jpg'

interface TeamInviteEmailProps {
  inviterName?: string
  inviterEmail?: string
  orgName?: string
  role?: string
  setPasswordUrl?: string
}

const TeamInviteEmail = ({
  inviterName,
  inviterEmail,
  orgName,
  role,
  setPasswordUrl,
}: TeamInviteEmailProps) => {
  const inviter = inviterName || inviterEmail || 'A teammate'
  const org = orgName || 'their organization'
  const roleLabel = role === 'admin' ? 'Admin' : 'Manager'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{inviter} invited you to join {org} on {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <a href="https://actvtrkr.com" style={{ textDecoration: 'none', display: 'block' }}>
              <Img
                src={HEADER_URL}
                alt={SITE_NAME}
                width="600"
                height="208"
                style={headerImg}
              />
            </a>
          </Section>

          <Section style={contentSection}>
            <Heading style={h1}>You've been invited to {SITE_NAME}</Heading>

            <Text style={text}>
              <strong>{inviter}</strong> has added you to <strong>{org}</strong> on {SITE_NAME} as a <strong>{roleLabel}</strong>.
            </Text>

            <Text style={text}>
              {SITE_NAME} is the WordPress activity, conversion and lead-tracking dashboard your team uses to monitor traffic, forms and site health in one place.
            </Text>

            <Text style={text}>
              To accept the invitation and access the dashboard, click below to set your password:
            </Text>

            <Section style={buttonWrap}>
              <Button style={button} href={setPasswordUrl || 'https://actvtrkr.com/reset-password'}>
                Set Your Password
              </Button>
            </Section>

            <Text style={text}>
              Once your password is set, you'll be taken straight into the dashboard for {org}.
            </Text>

            <Text style={textMuted}>
              If you weren't expecting this invitation, you can safely ignore this email — no account access is granted until you set a password.
            </Text>

            <Text style={signoff}>Thanks,</Text>
            <Text style={signoffTeam}>The {SITE_NAME} Team</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TeamInviteEmail,
  subject: (data: Record<string, any>) => {
    const inviter = data?.inviterName || data?.inviterEmail || 'Your teammate'
    const org = data?.orgName ? ` to ${data.orgName}` : ''
    return `${inviter} invited you${org} on ${SITE_NAME}`
  },
  displayName: 'Team invite',
  previewData: {
    inviterName: 'David',
    inviterEmail: 'david@newuniformdesign.com',
    orgName: 'New Uniform Design',
    role: 'manager',
    setPasswordUrl: 'https://actvtrkr.com/reset-password?token=sample-reset-token',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { maxWidth: '600px', width: '100%', margin: '0 auto' }
const headerSection = { marginBottom: '0', width: '100%', maxWidth: '600px' }
const headerImg = { width: '100%', maxWidth: '600px', height: 'auto' as const, display: 'block' as const, border: '0', outline: 'none', textDecoration: 'none', objectFit: 'cover' as const }
const contentSection = { padding: '32px 32px 40px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#00264D', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#4B5563', lineHeight: '1.7', margin: '0 0 16px' }
const textMuted = { fontSize: '13px', color: '#9CA3AF', lineHeight: '1.6', margin: '24px 0 16px' }
const buttonWrap = { textAlign: 'center' as const, margin: '28px 0' }
const button = { backgroundColor: '#6C5CE7', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, borderRadius: '12px', padding: '14px 32px', textDecoration: 'none', display: 'inline-block' }
const signoff = { fontSize: '15px', color: '#4B5563', margin: '24px 0 0', lineHeight: '1.5' }
const signoffTeam = { fontSize: '15px', color: '#4B5563', margin: '0', lineHeight: '1.5' }
