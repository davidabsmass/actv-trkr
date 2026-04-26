// Code Health — admin-only proxy to GitHub Code Scanning + Dependabot APIs.
// Surfaces Semgrep/CodeQL findings and dependency vulnerabilities inside the dashboard.
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
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const ghToken = Deno.env.get("GITHUB_TOKEN");
    const ghRepo = Deno.env.get("GITHUB_REPO");
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
      "User-Agent": "actv-trkr-code-health",
    };

    // Fetch in parallel; tolerate per-endpoint failures.
    const [codeRes, depRes] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${ghRepo}/code-scanning/alerts?state=open&per_page=100`,
        { headers: ghHeaders },
      ),
      fetch(
        `https://api.github.com/repos/${ghRepo}/dependabot/alerts?state=open&per_page=100`,
        { headers: ghHeaders },
      ),
    ]);

    type ApiError = { status: number; detail: string };
    const errors: Record<string, ApiError> = {};

    let codeAlerts: Array<Record<string, unknown>> = [];
    if (codeRes.ok) {
      codeAlerts = await codeRes.json();
    } else {
      errors.code_scanning = {
        status: codeRes.status,
        detail: await codeRes.text().catch(() => ""),
      };
    }

    let depAlerts: Array<Record<string, unknown>> = [];
    if (depRes.ok) {
      depAlerts = await depRes.json();
    } else {
      errors.dependabot = {
        status: depRes.status,
        detail: await depRes.text().catch(() => ""),
      };
    }

    type CodeAlert = {
      number: number;
      state: string;
      created_at: string;
      updated_at: string;
      html_url: string;
      rule?: { id?: string; name?: string; severity?: string; description?: string; tags?: string[] };
      tool?: { name?: string };
      most_recent_instance?: {
        ref?: string;
        message?: { text?: string };
        location?: { path?: string; start_line?: number };
      };
    };

    const code_findings = (codeAlerts as CodeAlert[]).map((a) => ({
      number: a.number,
      state: a.state,
      created_at: a.created_at,
      updated_at: a.updated_at,
      html_url: a.html_url,
      tool: a.tool?.name ?? "unknown",
      rule_id: a.rule?.id ?? null,
      rule_name: a.rule?.name ?? a.rule?.id ?? "Unnamed rule",
      severity: a.rule?.severity ?? "warning",
      description: a.rule?.description ?? null,
      message: a.most_recent_instance?.message?.text ?? null,
      path: a.most_recent_instance?.location?.path ?? null,
      line: a.most_recent_instance?.location?.start_line ?? null,
      ref: a.most_recent_instance?.ref ?? null,
    }));

    type DepAlert = {
      number: number;
      state: string;
      created_at: string;
      html_url: string;
      dependency?: {
        package?: { name?: string; ecosystem?: string };
        manifest_path?: string;
      };
      security_advisory?: { summary?: string; severity?: string; cve_id?: string | null; ghsa_id?: string };
      security_vulnerability?: { vulnerable_version_range?: string; first_patched_version?: { identifier?: string } };
    };

    const dep_findings = (depAlerts as DepAlert[]).map((a) => ({
      number: a.number,
      state: a.state,
      created_at: a.created_at,
      html_url: a.html_url,
      package: a.dependency?.package?.name ?? "unknown",
      ecosystem: a.dependency?.package?.ecosystem ?? null,
      manifest: a.dependency?.manifest_path ?? null,
      severity: a.security_advisory?.severity ?? "unknown",
      summary: a.security_advisory?.summary ?? null,
      cve: a.security_advisory?.cve_id ?? null,
      ghsa: a.security_advisory?.ghsa_id ?? null,
      vulnerable_range: a.security_vulnerability?.vulnerable_version_range ?? null,
      patched_version: a.security_vulnerability?.first_patched_version?.identifier ?? null,
    }));

    const sevRank = (s: string) => {
      const v = s?.toLowerCase();
      if (v === "critical") return 0;
      if (v === "high" || v === "error") return 1;
      if (v === "medium" || v === "warning") return 2;
      if (v === "low" || v === "note") return 3;
      return 4;
    };
    code_findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
    dep_findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));

    const counts = {
      code: code_findings.reduce<Record<string, number>>((acc, f) => {
        const k = (f.severity ?? "unknown").toLowerCase();
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
      dependencies: dep_findings.reduce<Record<string, number>>((acc, f) => {
        const k = (f.severity ?? "unknown").toLowerCase();
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    };

    return json({
      repo: ghRepo,
      generated_at: new Date().toISOString(),
      counts,
      code_findings,
      dep_findings,
      errors: Object.keys(errors).length ? errors : undefined,
    });
  } catch (e) {
    return json({ error: "Server error", detail: (e as Error).message }, 500);
  }
});
