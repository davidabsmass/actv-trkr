import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role";
import { useAppBibleReviewStatus } from "@/hooks/use-app-bible-review";

/**
 * Banner shown to system admins when the active app version has un-reviewed
 * App Bible sections. Mounts on admin-facing surfaces only.
 */
export default function AppBibleReviewBanner() {
  const { isAdmin } = useUserRole();
  const { unreviewedCount, totalSections, version, isFullyReviewed, isLoading } =
    useAppBibleReviewStatus();

  if (!isAdmin || isLoading || isFullyReviewed) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-foreground">
          <span className="font-medium">App Bible review pending for v{version}.</span>{" "}
          {unreviewedCount} of {totalSections} section(s) still need admin sign-off
          before this release is considered verified.
        </p>
        <Link
          to="/admin-setup?tab=app-bible"
          className="text-xs text-primary hover:underline mt-1 inline-block"
        >
          Open the App Bible checklist →
        </Link>
      </div>
    </div>
  );
}
