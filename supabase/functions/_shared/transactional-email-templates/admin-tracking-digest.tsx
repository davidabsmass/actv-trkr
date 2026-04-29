/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'ACTV TRKR'

interface StalledSite {
  domain: string
  org_name: string
  stalled_minutes: number
  stalled_for: string
  customer_emailed: boolean
}

interface AdminDigestProps {
  date?: string
  stalledCount?: number
  stalledSites?: StalledSite[]
}

const AdminTrackingDigestEmail = ({ date, stalledCount = 0, stalledSites = [] }: AdminDigestProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${stalledCount} site(s) stalled >1 hour — ${SITE_NAME} admin digest`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{SITE_NAME} — Admin Tracking Digest</Heading>
        <Text style={muted}>{date}</Text>

        {stalledCount === 0 ? (
          <Section style={okBox}>
            <Text style={okText}>✓ All sites healthy. No tracking outages over the last hour.</Text>
          </Section>
        ) : (
          <>
            <Text style={text}>
              <strong>{stalledCount}</strong> site{stalledCount === 1 ? ' has' : 's have'} been
              stalled for more than 1 hour:
            </Text>

            <Section style={tableWrap}>
              {stalledSites.map((s) => (
                <Section key={s.domain} style={row}>
                  <Text style={rowDomain}>{s.domain}</Text>
                  <Text style={rowMeta}>
                    {s.org_name} • stalled {s.stalled_for}
                    {s.customer_emailed ? ' • customer notified' : ' • customer NOT yet notified'}
                  </Text>
                </Section>
              ))}
            </Section>
          </>
        )}

        <Text style={footer}>
          Customers are notified via in-WP-admin banner immediately and via email after 15 minutes
          stalled. This digest is informational only.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminTrackingDigestEmail,
  subject: ({ stalledCount = 0 }: AdminDigestProps) =>
    stalledCount === 0
      ? `${SITE_NAME} daily digest — all sites healthy`
      : `${SITE_NAME} daily digest — ${stalledCount} site(s) stalled`,
  displayName: 'Admin tracking digest',
  previewData: {
    date: '2026-04-17',
    stalledCount: 2,
    stalledSites: [
      { domain: 'example.com', org_name: 'Example Co', stalled_minutes: 120, stalled_for: '2h', customer_emailed: true },
      { domain: 'foo.com', org_name: 'Foo LLC', stalled_minutes: 75, stalled_for: '1h', customer_emailed: false },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#000000', margin: '0 0 8px' }
const muted = { fontSize: '12px', color: '#999999', margin: '0 0 24px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.6', margin: '0 0 16px' }
const okBox = { backgroundColor: '#e8f5e9', borderRadius: '6px', padding: '14px 18px', margin: '12px 0 24px', textAlign: 'left' as const}
const okText = { fontSize: '14px', color: '#1b5e20', margin: 0, fontWeight: 'bold' }
const tableWrap = { margin: '12px 0 24px' }
const row = { borderBottom: '1px solid #eeeeee', padding: '10px 0' }
const rowDomain = { fontSize: '14px', color: '#000000', fontWeight: 'bold', margin: 0 }
const rowMeta = { fontSize: '12px', color: '#777777', margin: '4px 0 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0', lineHeight: '1.5' }
