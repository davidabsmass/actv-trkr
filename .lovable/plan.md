

## Client Dashboard URL

Since clients just need to log in and see their dashboard, the infrastructure already exists. Here is what needs to happen:

### Current State
- The app already has a login page at `/auth` and a protected `/dashboard` that shows data scoped to the user's organization via RLS.
- When you create a client account (via the Signup flow or the Clients page), they get credentials and an org. Logging in automatically shows their org's data.

### What's Missing
The app is not yet published to a live URL. Once published, the login URL **is** the client URL.

### Plan

1. **Publish the app** so it has a live URL (e.g., `your-app.lovable.app`). Optionally connect a custom domain (e.g., `app.yourbrand.com`).

2. **Auto-send credentials**: Update the signup/account-creation flow to display or email the client their login URL + credentials after account creation. Right now the Signup page shows an API key but doesn't surface the dashboard login link.

3. **Minor code change**: On the Signup "complete" step and on the Clients page (when inviting a user), show the published URL so admins can copy and share it with clients. This is a small UI addition — displaying a copyable link like `https://your-domain.com/auth`.

### Implementation Details

- Add a constant or env variable for the published app URL (can use `window.location.origin` at runtime).
- On the Signup "complete" step, add a "Your Dashboard" link section showing the login URL.
- On the Clients page, after inviting a user, show a copyable link to share with the client.
- Optionally, connect a custom domain via **Project Settings → Domains** so clients see a branded URL.

### Steps
1. Publish the app (click Publish in the editor)
2. Optionally connect a custom domain
3. Add copyable dashboard URL to the signup completion and client invite flows

