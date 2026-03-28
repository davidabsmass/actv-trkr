

## Add "Create a New Goal" button to Goal Conversions widget

### Change

**File: `src/components/dashboard/GoalConversions.tsx`**

1. Import `useNavigate` from `react-router-dom` and `Button` from UI components.
2. Change the empty-state return (line 104, when no goals exist) from `return null` to rendering a card with a "Create a New Goal" button that navigates to `/settings?tab=general` (where the Goals section lives).
3. Add the same "Create a New Goal" button in the header area of the widget (next to the total count) so users with existing goals can also add more.

Both buttons will call `navigate("/settings?tab=general")` to take the user directly to the Settings page where goals are managed.

### Files to change
1. `src/components/dashboard/GoalConversions.tsx`

