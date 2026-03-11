

## Problem
In the DateRangeSelector dropdown on the Performance page, the preset buttons (like "Last 7 days", "Last 30 days") show black text on a black/dark background when hovering, making the text invisible.

## Root Cause
The hover styles apply `hover:bg-secondary` (which has a dark background) but keep the text color as `text-foreground` (also dark/black), causing insufficient contrast.

## Solution
Add `hover:text-secondary-foreground` to the hover state of both the preset buttons and the "Custom range…" button in DateRangeSelector. This follows the standard Tailwind pattern where background and foreground colors are paired.

**File to modify:** `src/components/dashboard/DateRangeSelector.tsx`

**Changes:**
1. Line 69: Change `"text-foreground hover:bg-secondary"` to `"text-foreground hover:bg-secondary hover:text-secondary-foreground"`
2. Line 87: Same fix for the "Custom range…" button

