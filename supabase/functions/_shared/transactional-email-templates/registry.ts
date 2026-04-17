/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcomeEmail } from './welcome.tsx'
import { template as subscriptionCancelled } from './subscription-cancelled.tsx'
import { template as trackingStalled } from './tracking-stalled.tsx'
import { template as adminTrackingDigest } from './admin-tracking-digest.tsx'
import { template as supportTicketUpdate } from './support-ticket-update.tsx'
import { template as adminNewSupportTicket } from './admin-new-support-ticket.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcomeEmail,
  'subscription-cancelled': subscriptionCancelled,
  'tracking-stalled': trackingStalled,
  'admin-tracking-digest': adminTrackingDigest,
  'support-ticket-update': supportTicketUpdate,
  'admin-new-support-ticket': adminNewSupportTicket,
}
