/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'

interface AdminUserExportProps {
  date?: string
  userCount?: number
  downloadUrl?: string
  expiresInDays?: number
}

const AdminUserExportEmail = ({
  date,
  userCount = 0,
  downloadUrl = '#',
  expiresInDays = 7,
}: AdminUserExportProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${SITE_NAME} daily user export — ${userCount} users`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{SITE_NAME} — Daily User Export</Heading>
        <Text style={muted}>{date}</Text>

        <Section style={statBox}>
          <Text style={statLabel}>Total users in system</Text>
          <Text style={statValue}>{userCount.toLocaleString()}</Text>
        </Section>

        <Text style={text}>
          A fresh CSV export of every user account is ready. The file includes
          email, full name, system roles, organization memberships, account
          creation date, and last login.
        </Text>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={downloadUrl} style={button}>
            Download CSV
          </Button>
        </Section>

        <Text style={footer}>
          This download link expires in {expiresInDays} days. You can also
          generate a fresh export anytime from Admin Setup → Subscriber Sites
          → Export Users CSV.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminUserExportEmail,
  subject: ({ date, userCount = 0 }: AdminUserExportProps) =>
    `${SITE_NAME} daily user export — ${userCount} users (${date})`,
  displayName: 'Admin daily user export',
  previewData: {
    date: '2026-04-20',
    userCount: 42,
    downloadUrl: 'https://example.com/download',
    expiresInDays: 7,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#000000', margin: '0 0 8px' }
const muted = { fontSize: '12px', color: '#999999', margin: '0 0 24px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 16px' }
const statBox = { backgroundColor: '#f4f6fb', borderRadius: '6px', padding: '14px 18px', margin: '12px 0 24px', textAlign: 'left' as const}
const statLabel = { fontSize: '12px', color: '#666666', margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const statValue = { fontSize: '28px', color: '#1a1a1a', margin: '4px 0 0', fontWeight: 'bold' as const }
const button = {
  backgroundColor: '#2563eb',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontWeight: 'bold' as const,
  fontSize: '14px', textAlign: 'left' as const}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0', lineHeight: '1.5' }
