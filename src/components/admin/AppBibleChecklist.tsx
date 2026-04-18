import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { pluginManifest } from "@/generated/plugin-manifest";
import { APP_BIBLE_SECTIONS } from "@/data/appBibleSections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Circle, ShieldCheck, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type ReviewRow = {
  id: string;
  app_version: string;
  section_key: string;
  reviewed_by: string;
  reviewer_email: string | null;
  notes: string | null;
  reviewed_at: string;
};

export default function AppBibleChecklist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const version = pluginManifest.version;
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["app_bible_reviews_full", version],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("app_bible_reviews")
        .select("*")
        .eq("app_version", version)
        .order("reviewed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
  });

  const reviewByKey = useMemo(() => {
    const map = new Map<string, ReviewRow>();
    (reviews ?? []).forEach((r) => {
      // Most recent wins (already ordered desc)
      if (!map.has(r.section_key)) map.set(r.section_key, r);
    });
    return map;
  }, [reviews]);

  const reviewedCount = APP_BIBLE_SECTIONS.filter((s) => reviewByKey.has(s.key)).length;
  const total = APP_BIBLE_SECTIONS.length;
  const isFullyReviewed = reviewedCount === total;

  const handleSignOff = async (sectionKey: string) => {
    if (!user) {
      toast.error("You must be signed in to sign off.");
      return;
    }
    setSavingKey(sectionKey);
    const notes = notesByKey[sectionKey]?.trim() || null;
    const { error } = await (supabase as any).from("app_bible_reviews").insert({
      app_version: version,
      section_key: sectionKey,
      reviewed_by: user.id,
      reviewer_email: user.email,
      notes,
    });
    setSavingKey(null);
    if (error) {
      toast.error(`Sign-off failed: ${error.message}`);
      return;
    }
    toast.success(`Section signed off for v${version}`);
    setNotesByKey((prev) => ({ ...prev, [sectionKey]: "" }));
    queryClient.invalidateQueries({ queryKey: ["app_bible_reviews_full", version] });
    queryClient.invalidateQueries({ queryKey: ["app_bible_reviews", version] });
  };

  const handleReset = async (sectionKey: string) => {
    if (!user) return;
    const review = reviewByKey.get(sectionKey);
    if (!review) return;
    const { error } = await (supabase as any)
      .from("app_bible_reviews")
      .delete()
      .eq("id", review.id);
    if (error) {
      toast.error(`Reset failed: ${error.message}`);
      return;
    }
    toast.success("Sign-off cleared.");
    queryClient.invalidateQueries({ queryKey: ["app_bible_reviews_full", version] });
    queryClient.invalidateQueries({ queryKey: ["app_bible_reviews", version] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">App Bible — Release Sign-Off</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              v{version}
            </Badge>
            <Badge
              variant={isFullyReviewed ? "default" : "secondary"}
              className="text-xs"
            >
              {reviewedCount} / {total} reviewed
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isFullyReviewed ? (
            <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-foreground">
                All {total} sections signed off for v{version}. Release gate is open.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <span className="text-foreground">
                {total - reviewedCount} section(s) still need sign-off for v{version}.
                Source of truth: <code className="text-xs">docs/APP_BIBLE.md</code>.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading review history…</p>
      ) : (
        <div className="space-y-3">
          {APP_BIBLE_SECTIONS.map((section) => {
            const review = reviewByKey.get(section.key);
            const isReviewed = !!review;
            return (
              <Card key={section.key} className={isReviewed ? "border-primary/30" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {isReviewed ? (
                        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold">
                          {section.title}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {section.summary}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {section.key}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    {section.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>

                  {isReviewed ? (
                    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-2.5">
                      <div className="text-xs text-foreground space-y-0.5 min-w-0">
                        <p>
                          <span className="text-muted-foreground">Signed off by</span>{" "}
                          <span className="font-medium">
                            {review!.reviewer_email || review!.reviewed_by.slice(0, 8)}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            on {format(new Date(review!.reviewed_at), "PPp")}
                          </span>
                        </p>
                        {review!.notes && (
                          <p className="text-muted-foreground italic break-words">
                            “{review!.notes}”
                          </p>
                        )}
                      </div>
                      {review!.reviewed_by === user?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReset(section.key)}
                          className="shrink-0 h-7 px-2 text-xs"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Reset
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Optional notes (what you verified, links to test runs, etc.)"
                        value={notesByKey[section.key] || ""}
                        onChange={(e) =>
                          setNotesByKey((prev) => ({
                            ...prev,
                            [section.key]: e.target.value,
                          }))
                        }
                        rows={2}
                        className="text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSignOff(section.key)}
                        disabled={savingKey === section.key}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        {savingKey === section.key
                          ? "Signing off…"
                          : `Sign off for v${version}`}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
