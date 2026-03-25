
Goal: preserve everything important in one compact handoff, then move you to a truly clean working thread with minimal context overhead.

1) Create a single source of truth handoff file
- Add `PROJECT_HANDOFF.md` at repo root with:
  - Current product decisions (including pricing: Multi-Site Plan = $49/mo, up to 10 sites)
  - Open technical issue: intermittent blank/white screen on dashboard
  - Confirmed fix path to implement next: ref-safe dashboard cards + route error boundary + dashboard query hardening
  - Stripe status: product creation blocked by key permissions (manual product/price IDs pending)
  - Latest marketing copy decisions already requested for dashboard/landing sections
- Keep this file short (1–2 pages max) so next thread can load quickly.

2) Replace `.lovable/plan.md` with an “operator brief”
- Convert it into a 30-second startup brief:
  - What is done
  - What is pending
  - Exact next implementation task
  - Acceptance criteria checklist
- Remove generic “new chat” instructions from this file so it remains technical and actionable.

3) Prepare a zero-friction new-thread starter prompt
- Add a copy/paste block in the handoff:
  - “Use only PROJECT_HANDOFF.md as context. Ignore older chat history. Start with task #1 only.”
- Include one immediate task only: “Fix dashboard white-screen resilience path.”

4) Start a truly fresh working context
- Use a new thread opened from project entry.
- If editor still performs poorly, create a Remix copy and continue there using the same handoff file (keeps code, drops thread baggage).

5) Execution order (once implementation mode is active)
- First write handoff files.
- Then begin only the first technical task (white-screen resilience fixes) in small commits/steps.
- Validate after each step to avoid long, heavy responses and keep iteration speed high.

Technical details to capture in handoff
- Core files involved in current issue:
  - `src/pages/Dashboard.tsx`
  - `src/components/dashboard/WhatsWorking.tsx`
  - `src/components/dashboard/TopPagesAndSources.tsx`
  - `src/components/AppLayout.tsx`
  - `src/App.tsx`
- Current architecture notes:
  - Protected routes + auth/session guard are active.
  - Org context controls dashboard scope (`mm_active_org` in localStorage).
  - Dashboard uses many parallel queries and 15s refresh patterns; failure isolation is currently weak.
