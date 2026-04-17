import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, Plus, Trash2, ShieldCheck, Clock, Eye } from "lucide-react";

interface DataRoomLink {
  id: string;
  label: string;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_company: string | null;
  watermark_text: string | null;
  allowed_sections: string[];
  expires_at: string;
  max_views: number | null;
  view_count: number;
  revoked_at: string | null;
  created_at: string;
  notes: string | null;
}

const SECTIONS = [
  { key: "executive_summary", label: "Executive Summary" },
  { key: "revenue_quality", label: "Revenue Quality" },
  { key: "retention", label: "Retention & Cohorts" },
  { key: "financial_efficiency", label: "Financial Efficiency" },
  { key: "customer_concentration", label: "Customer Concentration" },
  { key: "risk_flags", label: "Risk Register" },
];

export default function DataRoomManager() {
  const [links, setLinks] = useState<DataRoomLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState<{ url: string; expires_at: string } | null>(null);

  // form state
  const [label, setLabel] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientCompany, setRecipientCompany] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [maxViews, setMaxViews] = useState<string>("");
  const [allowedSections, setAllowedSections] = useState<string[]>(SECTIONS.map((s) => s.key));
  const [notes, setNotes] = useState("");

  const loadLinks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("data_room_links")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load links: " + error.message);
    } else {
      setLinks((data as DataRoomLink[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const resetForm = () => {
    setLabel("");
    setRecipientName("");
    setRecipientEmail("");
    setRecipientCompany("");
    setExpiresInDays(14);
    setMaxViews("");
    setAllowedSections(SECTIONS.map((s) => s.key));
    setNotes("");
  };

  const handleCreate = async () => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-data-room-link", {
        body: {
          label: label.trim(),
          recipient_name: recipientName.trim(),
          recipient_email: recipientEmail.trim(),
          recipient_company: recipientCompany.trim(),
          watermark_text: recipientCompany.trim() || recipientName.trim(),
          allowed_sections: allowedSections,
          expires_in_days: expiresInDays,
          max_views: maxViews ? parseInt(maxViews, 10) : null,
          notes: notes.trim(),
        },
      });
      if (error) throw error;
      const url = `${window.location.origin}/data-room/${data.token}`;
      setNewToken({ url, expires_at: data.expires_at });
      setShowCreate(false);
      resetForm();
      await loadLinks();
    } catch (err: any) {
      toast.error("Failed to create link: " + (err.message ?? "Unknown error"));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this link? It will stop working immediately.")) return;
    const { error } = await supabase
      .from("data_room_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Failed to revoke: " + error.message);
    } else {
      toast.success("Link revoked");
      loadLinks();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getStatus = (link: DataRoomLink): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    if (link.revoked_at) return { label: "Revoked", variant: "destructive" };
    if (new Date(link.expires_at) < new Date()) return { label: "Expired", variant: "secondary" };
    if (link.max_views && link.view_count >= link.max_views) return { label: "Maxed", variant: "secondary" };
    return { label: "Active", variant: "default" };
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                Secure Data Room
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Generate time-limited, watermarked links for buyers, investors, and advisors.
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" /> New link
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No links yet. Create one to share Acquisition Readiness data with buyers.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label / Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Views</TableHead>
                    <TableHead>Sections</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => {
                    const status = getStatus(link);
                    return (
                      <TableRow key={link.id}>
                        <TableCell>
                          <div className="font-medium">{link.label}</div>
                          {link.recipient_company && (
                            <div className="text-xs text-muted-foreground">{link.recipient_company}</div>
                          )}
                          {link.recipient_email && (
                            <div className="text-xs text-muted-foreground">{link.recipient_email}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(link.expires_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Eye className="w-3 h-3 inline mr-1" />
                          {link.view_count}
                          {link.max_views ? ` / ${link.max_views}` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {link.allowed_sections.length} of {SECTIONS.length}
                        </TableCell>
                        <TableCell className="text-right">
                          {!link.revoked_at && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevoke(link.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Data Room Link</DialogTitle>
            <DialogDescription>
              Generate a secure, time-limited link to share with a buyer or investor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Label *</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Acme Capital Q2 review"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Recipient name</Label>
                <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
              </div>
              <div>
                <Label>Company</Label>
                <Input value={recipientCompany} onChange={(e) => setRecipientCompany(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Recipient email</Label>
              <Input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Expires in (days)</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Math.max(1, parseInt(e.target.value || "1", 10)))}
                />
              </div>
              <div>
                <Label>Max views (optional)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Allowed sections</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {SECTIONS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={allowedSections.includes(s.key)}
                      onCheckedChange={(checked) => {
                        setAllowedSections((prev) =>
                          checked ? [...prev, s.key] : prev.filter((k) => k !== s.key)
                        );
                      }}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Internal notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!newToken} onOpenChange={(open) => !open && setNewToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link created</DialogTitle>
            <DialogDescription>
              Copy this URL now — for security, the full token is only shown once.
            </DialogDescription>
          </DialogHeader>
          {newToken && (
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-md text-xs font-mono break-all">
                {newToken.url}
              </div>
              <p className="text-xs text-muted-foreground">
                Expires {new Date(newToken.expires_at).toLocaleString()}
              </p>
              <Button onClick={() => copyToClipboard(newToken.url)} className="w-full">
                <Copy className="w-4 h-4 mr-2" /> Copy URL
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
