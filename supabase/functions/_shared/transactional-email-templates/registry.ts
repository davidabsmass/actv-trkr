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

// Retention add-on templates
import { template as retentionWelcome } from './retention-welcome.tsx'
import { template as retentionConnectionSuccess } from './retention-connection-success.tsx'
import { template as retentionNoDataRescue } from './retention-no-data-rescue.tsx'
import { template as retentionNoSecondLogin } from './retention-no-second-login.tsx'
import { template as retentionFirstInsight } from './retention-first-insight.tsx'
import { template as retentionFailedPayment } from './retention-failed-payment.tsx'
import { template as retentionCancellationSave } from './retention-cancellation-save.tsx'
import { template as retentionWeeklySummary } from './retention-weekly-summary.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcomeEmail,
  'subscription-cancelled': subscriptionCancelled,
  'tracking-stalled': trackingStalled,
  'admin-tracking-digest': adminTrackingDigest,
  'support-ticket-update': supportTicketUpdate,
  'admin-new-support-ticket': adminNewSupportTicket,
  // Retention
  'retention-welcome': retentionWelcome,
  'retention-connection-success': retentionConnectionSuccess,
  'retention-no-data-rescue': retentionNoDataRescue,
  'retention-no-second-login': retentionNoSecondLogin,
  'retention-first-insight': retentionFirstInsight,
  'retention-failed-payment': retentionFailedPayment,
  'retention-cancellation-save': retentionCancellationSave,
  'retention-weekly-summary': retentionWeeklySummary,
}
