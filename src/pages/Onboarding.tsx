import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Zap, Plus, Copy, Check } from "lucide-react";
import { useClients } from "@/hooks/use-dashboard-data";

const Onboarding = () => {
  const navigate = useNavigate();
  const { data: clients, refetch } = useClients();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdClient, setCreatedClient] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name,
          slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          owner_id: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      setCreatedClient(data);
      refetch();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyApiKey = () => {
    if (createdClient?.api_key) {
      navigator.clipboard.writeText(createdClient.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (createdClient) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="glass-card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                <Check className="h-4 w-4 text-success" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Client Created!</h2>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Copy the API key below — you'll need it for the WordPress plugin.
            </p>

            <div className="bg-secondary rounded-lg p-3 flex items-center gap-2 mb-4">
              <code className="text-xs font-mono text-foreground flex-1 break-all">
                {createdClient.api_key}
              </code>
              <button
                onClick={copyApiKey}
                className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition-colors"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>

            <button
              onClick={() => navigate("/")}
              className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 glow-primary">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">ACTV TRKR</span>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">Set up your first client</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Create a client to start tracking analytics.
          </p>

          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              placeholder="Client name (e.g., Example Ortho)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="Slug (e.g., example-ortho)"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />

            <button
              type="submit"
              disabled={loading || !name}
              className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {loading ? "Creating..." : "Create Client"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
