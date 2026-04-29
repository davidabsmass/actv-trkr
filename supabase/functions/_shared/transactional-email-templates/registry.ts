/// <reference types="npm:@types/react@^18.3.12" />
import * as React from 'npm:react@^18.3.1'

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
import { template as adminUserExport } from './admin-user-export.tsx'
import { template as supportTicketUpdate } from './support-ticket-update.tsx'
import { template as adminNewSupportTicket } from './admin-new-support-ticket.tsx'
import { template as acquisitionWeeklyDigest } from './acquisition-weekly-digest.tsx'
import { template as contactMessage } from './contact-message.tsx'
import { template as login2faCode } from './login-2fa-code.tsx'
import { template as authSecurityAlert } from './auth-security-alert.tsx'
import { template as emailChangeCancel } from './email-change-cancel.tsx'
import { template as supportAccessSummary } from './support-access-summary.tsx'
import { template as supportAccessStarted } from './support-access-started.tsx'

// Retention add-on templates
import { template as retentionWelcome } from './retention-welcome.tsx'
import { template as retentionConnectionSuccess } from './retention-connection-success.tsx'
import { template as retentionNoDataRescue } from './retention-no-data-rescue.tsx'
import { template as retentionNoSecondLogin } from './retention-no-second-login.tsx'
import { template as retentionFirstInsight } from './retention-first-insight.tsx'
import { template as retentionFailedPayment } from './retention-failed-payment.tsx'
import { template as retentionCancellationSave } from './retention-cancellation-save.tsx'
import { template as retentionWeeklySummary } from './retention-weekly-summary.tsx'

// Lifecycle (cancellation / grace / archive) emails
import { template as lifecycleCancellation } from './lifecycle-cancellation.tsx'
import { template as lifecycleArchiveWarning } from './lifecycle-archive-warning.tsx'
import { template as lifecycleFinalNotice } from './lifecycle-final-notice.tsx'

// Team management
import { template as teamInvite } from './team-invite.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcomeEmail,
  'subscription-cancelled': subscriptionCancelled,
  'tracking-stalled': trackingStalled,
  'admin-tracking-digest': adminTrackingDigest,
  'admin-user-export': adminUserExport,
  'support-ticket-update': supportTicketUpdate,
  'admin-new-support-ticket': adminNewSupportTicket,
  'acquisition-weekly-digest': acquisitionWeeklyDigest,
  'contact-message': contactMessage,
  'login-2fa-code': login2faCode,
  'auth-security-alert': authSecurityAlert,
  'email-change-cancel': emailChangeCancel,
  'support-access-summary': supportAccessSummary,
  'support-access-started': supportAccessStarted,
  // Retention
  'retention-welcome': retentionWelcome,
  'retention-connection-success': retentionConnectionSuccess,
  'retention-no-data-rescue': retentionNoDataRescue,
  'retention-no-second-login': retentionNoSecondLogin,
  'retention-first-insight': retentionFirstInsight,
  'retention-failed-payment': retentionFailedPayment,
  'retention-cancellation-save': retentionCancellationSave,
  'retention-weekly-summary': retentionWeeklySummary,
  // Lifecycle
  'lifecycle-cancellation': lifecycleCancellation,
  'lifecycle-archive-warning': lifecycleArchiveWarning,
  'lifecycle-final-notice': lifecycleFinalNotice,
}
