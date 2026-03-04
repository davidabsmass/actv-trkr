

## Allow Clients to Add Websites

### Current State
- The **Settings** page is hidden from users with `member` org role — only `admin` (org-level or global) sees it in the sidebar.
- The **SitesSection** component on Settings allows adding/removing sites.
- There is no standalone "Add Site" flow accessible to regular members.

### Options

**Option A: Give members access to Settings**
- Change the sidebar gate from `isAdmin || orgRole === "admin"` to `isAdmin || orgRole === "admin" || orgRole === "member"` (i.e., all org members).
- This exposes all settings (API keys, plugin, forms, notifications) to members, which may not be desirable.

**Option B: Add a dedicated "Sites" section visible to all users**
- Extract the SitesSection into its own route or embed it on the Dashboard/Monitoring page.
- Keep sensitive settings (API keys, plugin downloads) restricted to admins.
- Add a simple "Add Site" button somewhere members can reach — e.g., the empty-state banner on the Dashboard or a new sidebar link.

**Option C: Keep it admin-only (current behavior)**
- Clients request site additions through their admin or through you.
- No code changes needed.

### Recommendation: Option B (lightweight version)

1. **`src/components/AppSidebar.tsx`** — Show Settings to all authenticated org members (not just admins), but...
2. **`src/pages/Settings.tsx`** — Conditionally render sections: show SitesSection and NotificationsSection to all members; hide ApiKeysSection and PluginSection for non-admins.
3. No database changes needed — the `sites` table INSERT policy already allows `admin` and `member` roles.

| File | Change |
|------|--------|
| `AppSidebar.tsx` | Show Settings link to all org members |
| `Settings.tsx` | Gate ApiKeysSection and PluginSection behind admin check; show SitesSection and FormsSection to all |

