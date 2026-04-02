

## Add Feedback Tab to Settings Page

### What We're Building
A "Feedback" tab in Settings where clients can report problems or request features. Submissions are stored in a `feedback` table and an email notification is sent to **info@newuniformdesign.com**.

### Database

**Migration**: Create `feedback` table with RLS policies.

```sql
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'bug',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Org members can insert their own feedback
CREATE POLICY "fb_insert" ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND is_org_member(org_id));

-- Org members can view their org's feedback
CREATE POLICY "fb_select" ON public.feedback FOR SELECT TO authenticated
  USING (is_org_member(org_id));

-- Admins can view all feedback
CREATE POLICY "fb_select_admin" ON public.feedback FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
```

### Frontend

1. **New component**: `src/components/settings/FeedbackSection.tsx`
   - Form with: category dropdown (Bug, Feature Request, Question, Other), subject input, message textarea, submit button
   - Below the form: list of previous feedback for the org with status badges (open/reviewed/resolved)
   - On submit: insert into `feedback` table via Supabase client, then invoke the edge function to send email notification

2. **Update `src/pages/Settings.tsx`**: Add "Feedback" tab trigger and content panel

### Email Notification

**New edge function**: `supabase/functions/submit-feedback/index.ts`
- Accepts: `{ org_id, user_id, category, subject, message }`
- Inserts into `feedback` table using service role
- Sends email to **info@newuniformdesign.com** via existing `enqueue_email` RPC with:
  - From: `ACTV TRKR <notifications@actvtrkr.com>`
  - Subject: `[Feedback] {category}: {subject}`
  - HTML body with org name, user email, category, and message
- Returns the inserted feedback row

### Translation Keys

Add to `en/common.json` under `settings`:
- `feedback`, `feedbackDesc`, `feedbackCategory`, `feedbackSubject`, `feedbackMessage`, `feedbackSubmit`, `feedbackSuccess`, `feedbackBug`, `feedbackFeature`, `feedbackQuestion`, `feedbackOther`, `feedbackHistory`, `feedbackEmpty`

### Steps
1. Create `feedback` table migration
2. Create `submit-feedback` edge function
3. Build `FeedbackSection.tsx` component
4. Add Feedback tab to `Settings.tsx`
5. Add translation keys

