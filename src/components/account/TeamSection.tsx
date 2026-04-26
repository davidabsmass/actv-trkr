import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TeamSection() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["org_members", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("org_users")
        .select("id, user_id, role, created_at")
        .eq("org_id", orgId);
      if (error) throw error;

      // Fetch profiles for these users
      const userIds = data.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      return data.map((m) => ({
        ...m,
        email: profileMap.get(m.user_id)?.email || "—",
        full_name: profileMap.get(m.user_id)?.full_name || "",
      }));
    },
    enabled: !!orgId,
  });

  const addMember = useMutation({
    mutationFn: async (memberEmail: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) throw new Error("Session expired");

      const { data, error } = await supabase.functions.invoke("add-org-member", {
        body: { email: memberEmail, orgId },
      });
      if (error) {
        const body = error?.context?.body
          ? await new Response(error.context.body).json().catch(() => null)
          : null;
        throw new Error(body?.error || error.message);
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["org_members", orgId] });
      toast({ title: "Member added", description: data.message });
      setEmail("");
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("org_users")
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org_members", orgId] });
      toast({ title: "Member removed" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    addMember.mutate(email.trim());
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Team Members
        </CardTitle>
        <CardDescription>
          Add people to your organization so they can access the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add member form */}
        <form onSubmit={handleAdd} className="flex gap-2 items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Email address</Label>
            <Input
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={addMember.isPending}
            />
          </div>
          <Button type="submit" size="sm" disabled={addMember.isPending || !email.trim()} className="gap-1.5">
            {addMember.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            Add
          </Button>
        </form>

        {/* Members list */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <div className="divide-y">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.full_name || m.email}
                    </p>
                    {m.full_name && (
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    )}
                  </div>
                  <Badge variant={m.role === "admin" ? "default" : "secondary"} className="text-[10px] shrink-0">
                    {m.role}
                  </Badge>
                </div>
                {m.user_id !== user?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeMember.mutate(m.id)}
                    disabled={removeMember.isPending}
                    aria-label={`Remove ${m.email || "team member"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          New users will receive an account. They should use "Forgot Password" on the login screen to set their password.
        </p>
      </CardContent>
    </Card>
  );
}
