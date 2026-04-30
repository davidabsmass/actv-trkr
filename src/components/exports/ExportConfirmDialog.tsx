import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download } from "lucide-react";

interface ExportConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  description?: string;
  confirmLabel?: string;
}

/**
 * Lightweight confirmation modal shown before any client-data export.
 *
 * Used for all export trigger surfaces (Forms, Entries, Exports, Archives)
 * so users — including ACTV TRKR Support staff — explicitly acknowledge that
 * the action will be logged in `export_audit_log`.
 */
export function ExportConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  description,
  confirmLabel = "Continue Export",
}: ExportConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Export client data?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              "This export may contain client or lead data. The action will be logged."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
