import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquarePlus, Loader2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  reviewed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export default function FeedbackSection() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["feedback", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Array<{
        id: string;
        category: string;
        subject: string;
        message: string;
        status: string;
        created_at: string;
      }>;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !user) return;
    if (!subject.trim() || !message.trim()) {
      toast.error(t("settings.feedbackMissing", "Please fill in all fields"));
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("submit-feedback", {
        body: { org_id: orgId, category, subject: subject.trim(), message: message.trim() },
      });
      if (error) throw error;

      toast.success(t("settings.feedbackSuccess", "Feedback submitted — thank you!"));
      setSubject("");
      setMessage("");
      setCategory("bug");
      queryClient.invalidateQueries({ queryKey: ["feedback", orgId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  const categoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      bug: t("settings.feedbackBug", "Bug Report"),
      feature_request: t("settings.feedbackFeature", "Feature Request"),
      question: t("settings.feedbackQuestion", "Question"),
      other: t("settings.feedbackOther", "Other"),
    };
    return map[cat] || cat;
  };

  return (
    <div className="space-y-6">
      {/* Submit form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5" />
            {t("settings.feedback", "Submit Feedback")}
          </CardTitle>
          <CardDescription>
            {t("settings.feedbackDesc", "Report a problem, request a feature, or ask a question.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("settings.feedbackCategory", "Category")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">{t("settings.feedbackBug", "Bug Report")}</SelectItem>
                  <SelectItem value="feature_request">{t("settings.feedbackFeature", "Feature Request")}</SelectItem>
                  <SelectItem value="question">{t("settings.feedbackQuestion", "Question")}</SelectItem>
                  <SelectItem value="other">{t("settings.feedbackOther", "Other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("settings.feedbackWebsite", "Website URL")}</Label>
              <Input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://www.example.com"
                maxLength={300}
                type="url"
              />
            </div>

            <div className="space-y-2">
              <Label>{t("settings.feedbackSubject", "Subject")}</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("settings.feedbackSubjectPlaceholder", "Brief summary of your feedback")}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("settings.feedbackMessage", "Message")}</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("settings.feedbackMessagePlaceholder", "Describe the issue or suggestion in detail…")}
                rows={5}
                maxLength={2000}
              />
            </div>

            <Button type="submit" disabled={submitting || !subject.trim() || !message.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("settings.feedbackSubmit", "Submit Feedback")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.feedbackHistory", "Previous Feedback")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("settings.feedbackEmpty", "No feedback submitted yet.")}
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="border rounded-lg p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{item.subject}</span>
                    <Badge variant="outline" className={STATUS_COLORS[item.status] || ""}>
                      {item.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{categoryLabel(item.category)}</span>
                    <span>•</span>
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
