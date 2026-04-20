import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { KeyRound, Plus, Copy, AlertTriangle } from "lucide-react";

type ApiKey = {
  id: string;
  label: string;
  key_hash: string;
  created_at: string;
  revoked_at: string | null;
};

export function SecurityApiKeysTab() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<{ key: string; prefix: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["api_keys_security", orgId],
    queryFn: async (): Promise<ApiKey[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, label, key_hash, created_at, revoked_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.functions.invoke("create-api-key", {
        body: { org_id: orgId, label: name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { key: string; prefix: string };
    },
    onSuccess: (data) => {
      setCreatedKey(data);
      setNewKeyName("");
      qc.invalidateQueries({ queryKey: ["api_keys_security", orgId] });
      qc.invalidateQueries({ queryKey: ["security_score", orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create key"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await supabase.from("security_audit_log").insert({
        org_id: orgId,
        actor_type: "admin",
        event_type: "api_key_revoked",
        severity: "warn",
        metadata: { api_key_id: id },
      });
    },
    onSuccess: () => {
      toast.success("API key revoked");
      qc.invalidateQueries({ queryKey: ["api_keys_security", orgId] });
      qc.invalidateQueries({ queryKey: ["security_score", orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Revoke failed"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> API keys</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Generate and revoke programmatic access keys for this organization.</p>
          </div>
          <Button size="sm" onClick={() => { setCreatedKey(null); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Create key
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <KeyRound className="h-10 w-10 text-muted-foreground mx-auto" />
              <div className="font-medium">No API keys yet</div>
              <div className="text-sm text-muted-foreground">Create a key to authenticate external integrations.</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((k) => {
                  const prefix = k.key_hash?.slice(0, 8) ?? "—";
                  const isRevoked = !!k.revoked_at;
                  return (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium text-sm">{k.label}</TableCell>
                      <TableCell className="font-mono text-xs">{prefix}…</TableCell>
                      <TableCell>
                        <Badge variant={isRevoked ? "outline" : "secondary"} className="text-xs capitalize">
                          {isRevoked ? "Revoked" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(k.created_at), { addSuffix: true })}</TableCell>
                      <TableCell>
                        {!isRevoked && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revoke.mutate(k.id)} disabled={revoke.isPending}>
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreatedKey(null); }}>
        <DialogContent className="max-w-md">
          {!createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>Give this key a recognizable name. The full key will be shown only once.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="keyname">Name</Label>
                <Input
                  id="keyname"
                  placeholder="e.g. Production integration"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={100}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={() => create.mutate(newKeyName.trim())} disabled={!newKeyName.trim() || create.isPending}>
                  {create.isPending ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Save your API key</DialogTitle>
                <DialogDescription className="flex items-start gap-2 text-warning">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  This is the only time you'll see this key. Copy it now and store it somewhere safe.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="bg-muted rounded p-3 font-mono text-xs break-all select-all">{createdKey.key}</div>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(createdKey.key);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" /> Copy key
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => { setCreateOpen(false); setCreatedKey(null); }}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
