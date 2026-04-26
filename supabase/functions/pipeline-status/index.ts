// Pipeline Status — admin-only proxy to GitHub Actions API.
// Fetches latest workflow runs server-side so the GitHub token never reaches the browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth: require a valid JWT and admin role ─────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    // ── GitHub config ────────────────────────────────────────────
    const ghToken = Deno.env.get("GITHUB_TOKEN");
    const ghRepo = Deno.env.get("GITHUB_REPO"); // e.g. "owner/repo"
    if (!ghToken || !ghRepo) {
      return json({
        error: "Pipeline not configured",
        detail: "Missing GITHUB_TOKEN or GITHUB_REPO secret.",
      }, 503);
    }

    const ghHeaders = {
      Authorization: `Bearer ${ghToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "actv-trkr-pipeline-status",
    };

    // ── Fetch workflows + their latest runs in parallel ──────────
    const wfRes = await fetch(
      `https://api.github.com/repos/${ghRepo}/actions/workflows`,
      { headers: ghHeaders },
    );
    if (!wfRes.ok) {
      const text = await wfRes.text();
      return json({ error: "GitHub API failed", status: wfRes.status, detail: text }, 502);
    }
    const wfData = await wfRes.json();
    const workflows = (wfData.workflows ?? []) as Array<{
      id: number;
      name: string;
      path: string;
      state: string;
      html_url: string;
    }>;

    const runResults = await Promise.all(
      workflows.map(async (wf) => {
        const r = await fetch(
          `https://api.github.com/repos/${ghRepo}/actions/workflows/${wf.id}/runs?per_page=1`,
          { headers: ghHeaders },
        );
        if (!r.ok) return { workflow: wf, latest: null };
        const j = await r.json();
        const latest = (j.workflow_runs ?? [])[0] ?? null;
        return { workflow: wf, latest };
      }),
    );

    // ── Recent runs across the repo (top 20) ─────────────────────
    const recentRes = await fetch(
      `https://api.github.com/repos/${ghRepo}/actions/runs?per_page=20`,
      { headers: ghHeaders },
    );
    const recentData = recentRes.ok ? await recentRes.json() : { workflow_runs: [] };

    return json({
      repo: ghRepo,
      generated_at: new Date().toISOString(),
      workflows: runResults.map((x) => ({
        id: x.workflow.id,
        name: x.workflow.name,
        path: x.workflow.path,
        state: x.workflow.state,
        html_url: x.workflow.html_url,
        latest_run: x.latest
          ? {
              id: x.latest.id,
              run_number: x.latest.run_number,
              status: x.latest.status,
              conclusion: x.latest.conclusion,
              event: x.latest.event,
              branch: x.latest.head_branch,
              actor: x.latest.actor?.login,
              created_at: x.latest.created_at,
              updated_at: x.latest.updated_at,
              html_url: x.latest.html_url,
            }
          : null,
      })),
      recent_runs: (recentData.workflow_runs ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        run_number: r.run_number,
        status: r.status,
        conclusion: r.conclusion,
        event: r.event,
        branch: r.head_branch,
        actor: r.actor?.login,
        created_at: r.created_at,
        updated_at: r.updated_at,
        html_url: r.html_url,
      })),
    });
  } catch (e) {
    return json({ error: "Server error", detail: (e as Error).message }, 500);
  }
});
