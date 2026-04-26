import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Calculator, Star, Save } from "lucide-react";
import { computeValuation, formatCurrency, type ValuationInputs } from "./valuationMath";

interface Comp {
  id: string;
  company_name: string;
  ticker: string | null;
  industry: string | null;
  transaction_type: string;
  transaction_date: string | null;
  deal_value: number | null;
  revenue: number | null;
  ebitda: number | null;
  arr: number | null;
  ev_revenue_multiple: number | null;
  ev_ebitda_multiple: number | null;
  ev_arr_multiple: number | null;
  growth_rate_pct: number | null;
  source_notes: string | null;
}

interface Scenario extends ValuationInputs {
  id: string;
  scenario_name: string;
  description: string | null;
  computed_low: number | null;
  computed_mid: number | null;
  computed_high: number | null;
  is_primary: boolean;
  created_at: string;
}

const blankInputs: ValuationInputs = {
  base_arr: null, base_revenue: null, base_ebitda: null,
  growth_rate_pct: null, ebitda_margin_pct: null,
  ev_arr_multiple_low: null, ev_arr_multiple_mid: null, ev_arr_multiple_high: null,
  ev_revenue_multiple_low: null, ev_revenue_multiple_mid: null, ev_revenue_multiple_high: null,
  ev_ebitda_multiple_low: null, ev_ebitda_multiple_mid: null, ev_ebitda_multiple_high: null,
  dcf_projection_years: 5, dcf_discount_rate_pct: null,
  dcf_terminal_growth_pct: null, dcf_terminal_multiple: null, dcf_fcf_margin_pct: null,
};

export default function ValuationManager() {
  const [comps, setComps] = useState<Comp[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  // Working scenario inputs
  const [inputs, setInputs] = useState<ValuationInputs>(blankInputs);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDesc, setScenarioDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // New comp dialog
  const [compDialog, setCompDialog] = useState(false);
  const [compForm, setCompForm] = useState<Partial<Comp>>({ transaction_type: "m_and_a" });

  const loadAll = async () => {
    setLoading(true);
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("valuation_comparables").select("*").order("transaction_date", { ascending: false }),
      supabase.from("valuation_scenarios").select("*").order("is_primary", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    setComps((c as Comp[]) ?? []);
    setScenarios((s as Scenario[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const result = useMemo(() => computeValuation(inputs), [inputs]);

  // Suggested multiples from comps median
  const suggested = useMemo(() => {
    const nums = (arr: (number | null)[]) => arr.filter((x): x is number => typeof x === "number" && x > 0).sort((a, b) => a - b);
    const median = (arr: number[]) => arr.length ? arr[Math.floor(arr.length / 2)] : null;
    const p25 = (arr: number[]) => arr.length ? arr[Math.floor(arr.length * 0.25)] : null;
    const p75 = (arr: number[]) => arr.length ? arr[Math.floor(arr.length * 0.75)] : null;
    const arr = nums(comps.map((c) => c.ev_arr_multiple));
    const rev = nums(comps.map((c) => c.ev_revenue_multiple));
    const eb = nums(comps.map((c) => c.ev_ebitda_multiple));
    return {
      arr: { low: p25(arr), mid: median(arr), high: p75(arr) },
      revenue: { low: p25(rev), mid: median(rev), high: p75(rev) },
      ebitda: { low: p25(eb), mid: median(eb), high: p75(eb) },
    };
  }, [comps]);

  const applySuggested = () => {
    setInputs((prev) => ({
      ...prev,
      ev_arr_multiple_low: suggested.arr.low ?? prev.ev_arr_multiple_low,
      ev_arr_multiple_mid: suggested.arr.mid ?? prev.ev_arr_multiple_mid,
      ev_arr_multiple_high: suggested.arr.high ?? prev.ev_arr_multiple_high,
      ev_revenue_multiple_low: suggested.revenue.low ?? prev.ev_revenue_multiple_low,
      ev_revenue_multiple_mid: suggested.revenue.mid ?? prev.ev_revenue_multiple_mid,
      ev_revenue_multiple_high: suggested.revenue.high ?? prev.ev_revenue_multiple_high,
      ev_ebitda_multiple_low: suggested.ebitda.low ?? prev.ev_ebitda_multiple_low,
      ev_ebitda_multiple_mid: suggested.ebitda.mid ?? prev.ev_ebitda_multiple_mid,
      ev_ebitda_multiple_high: suggested.ebitda.high ?? prev.ev_ebitda_multiple_high,
    }));
    toast.success("Applied multiples from comps median");
  };

  const setNumInput = (key: keyof ValuationInputs) => (v: string) => {
    setInputs({ ...inputs, [key]: v === "" ? null : Number(v) });
  };

  const saveScenario = async () => {
    if (!scenarioName.trim()) { toast.error("Scenario name required"); return; }
    const { data: user } = await supabase.auth.getUser();
    const payload = {
      ...inputs,
      scenario_name: scenarioName.trim(),
      description: scenarioDesc.trim() || null,
      computed_low: result.low,
      computed_mid: result.mid,
      computed_high: result.high,
      computed_breakdown: result.breakdown as never,
      created_by_user_id: user.user?.id ?? null,
    };
    if (editingId) {
      const { error } = await supabase.from("valuation_scenarios").update(payload).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
      toast.success("Scenario updated");
    } else {
      const { error } = await supabase.from("valuation_scenarios").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Scenario saved");
    }
    setEditingId(null);
    setScenarioName("");
    setScenarioDesc("");
    loadAll();
  };

  const loadScenario = (s: Scenario) => {
    const { id, scenario_name, description, computed_low, computed_mid, computed_high, is_primary, created_at, ...rest } = s;
    setInputs({ ...blankInputs, ...rest });
    setScenarioName(scenario_name);
    setScenarioDesc(description ?? "");
    setEditingId(id);
    toast.info(`Editing: ${scenario_name}`);
  };

  const setPrimary = async (id: string) => {
    await supabase.from("valuation_scenarios").update({ is_primary: false }).neq("id", id);
    const { error } = await supabase.from("valuation_scenarios").update({ is_primary: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Set as primary scenario");
    loadAll();
  };

  const deleteScenario = async (id: string) => {
    if (!confirm("Delete this scenario?")) return;
    const { error } = await supabase.from("valuation_scenarios").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Scenario deleted");
    if (editingId === id) { setEditingId(null); setScenarioName(""); setScenarioDesc(""); }
    loadAll();
  };

  const saveComp = async () => {
    if (!compForm.company_name?.trim()) { toast.error("Company name required"); return; }
    // Auto-calc multiples if missing but base values present
    const dv = compForm.deal_value ?? 0;
    const computed = {
      ev_arr_multiple: compForm.ev_arr_multiple ?? (compForm.arr ? dv / compForm.arr : null),
      ev_revenue_multiple: compForm.ev_revenue_multiple ?? (compForm.revenue ? dv / compForm.revenue : null),
      ev_ebitda_multiple: compForm.ev_ebitda_multiple ?? (compForm.ebitda ? dv / compForm.ebitda : null),
    };
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from("valuation_comparables").insert({
      ...compForm,
      ...computed,
      company_name: compForm.company_name.trim(),
      created_by_user_id: user.user?.id ?? null,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Comparable added");
    setCompDialog(false);
    setCompForm({ transaction_type: "m_and_a" });
    loadAll();
  };

  const deleteComp = async (id: string) => {
    if (!confirm("Delete this comparable?")) return;
    const { error } = await supabase.from("valuation_comparables").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Comparable removed");
    loadAll();
  };

  if (loading) {
    return (
      <Card><CardContent className="py-10 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Result Strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Low Estimate</div>
          <div className="text-2xl font-semibold mt-1">{formatCurrency(result.low)}</div>
        </CardContent></Card>
        <Card className="border-primary"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Mid Estimate</div>
          <div className="text-2xl font-semibold mt-1 text-primary">{formatCurrency(result.mid)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">High Estimate</div>
          <div className="text-2xl font-semibold mt-1">{formatCurrency(result.high)}</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="model">
        <TabsList>
          <TabsTrigger value="model"><Calculator className="h-3 w-3 mr-1" /> Model</TabsTrigger>
          <TabsTrigger value="comps">Comparables ({comps.length})</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios ({scenarios.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="model" className="space-y-4 pt-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Base Financials</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><Label className="text-xs">ARR</Label><Input type="number" value={inputs.base_arr ?? ""} onChange={(e) => setNumInput("base_arr")(e.target.value)} /></div>
              <div><Label className="text-xs">Revenue</Label><Input type="number" value={inputs.base_revenue ?? ""} onChange={(e) => setNumInput("base_revenue")(e.target.value)} /></div>
              <div><Label className="text-xs">EBITDA</Label><Input type="number" value={inputs.base_ebitda ?? ""} onChange={(e) => setNumInput("base_ebitda")(e.target.value)} /></div>
              <div><Label className="text-xs">Growth %</Label><Input type="number" value={inputs.growth_rate_pct ?? ""} onChange={(e) => setNumInput("growth_rate_pct")(e.target.value)} /></div>
              <div><Label className="text-xs">EBITDA Margin %</Label><Input type="number" value={inputs.ebitda_margin_pct ?? ""} onChange={(e) => setNumInput("ebitda_margin_pct")(e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Market Multiples</CardTitle>
              <Button size="sm" variant="outline" onClick={applySuggested} disabled={comps.length === 0}>Use comps median</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "EV / ARR", base: inputs.base_arr, keys: ["ev_arr_multiple_low", "ev_arr_multiple_mid", "ev_arr_multiple_high"] as const, br: result.breakdown.arr_method },
                { label: "EV / Revenue", base: inputs.base_revenue, keys: ["ev_revenue_multiple_low", "ev_revenue_multiple_mid", "ev_revenue_multiple_high"] as const, br: result.breakdown.revenue_method },
                { label: "EV / EBITDA", base: inputs.base_ebitda, keys: ["ev_ebitda_multiple_low", "ev_ebitda_multiple_mid", "ev_ebitda_multiple_high"] as const, br: result.breakdown.ebitda_method },
              ].map((row) => (
                <div key={row.label} className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
                  <div className="md:col-span-1 text-sm font-medium pt-2">{row.label}</div>
                  <div><Label className="text-xs">Low</Label><Input type="number" value={inputs[row.keys[0]] ?? ""} onChange={(e) => setNumInput(row.keys[0])(e.target.value)} /></div>
                  <div><Label className="text-xs">Mid</Label><Input type="number" value={inputs[row.keys[1]] ?? ""} onChange={(e) => setNumInput(row.keys[1])(e.target.value)} /></div>
                  <div><Label className="text-xs">High</Label><Input type="number" value={inputs[row.keys[2]] ?? ""} onChange={(e) => setNumInput(row.keys[2])(e.target.value)} /></div>
                  <div className="md:col-span-3 text-xs text-muted-foreground pt-2">
                    {row.br ? `${formatCurrency(row.br.low)} – ${formatCurrency(row.br.mid)} – ${formatCurrency(row.br.high)}` : "Add base value to compute"}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">DCF Inputs</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><Label className="text-xs">Years (1–15)</Label><Input type="number" min="1" max="15" value={inputs.dcf_projection_years ?? 5} onChange={(e) => setNumInput("dcf_projection_years")(e.target.value)} /></div>
              <div><Label className="text-xs">Discount %</Label><Input type="number" value={inputs.dcf_discount_rate_pct ?? ""} onChange={(e) => setNumInput("dcf_discount_rate_pct")(e.target.value)} /></div>
              <div><Label className="text-xs">FCF Margin %</Label><Input type="number" value={inputs.dcf_fcf_margin_pct ?? ""} onChange={(e) => setNumInput("dcf_fcf_margin_pct")(e.target.value)} /></div>
              <div><Label className="text-xs">Terminal Growth %</Label><Input type="number" value={inputs.dcf_terminal_growth_pct ?? ""} onChange={(e) => setNumInput("dcf_terminal_growth_pct")(e.target.value)} /></div>
              <div><Label className="text-xs">Exit Multiple</Label><Input type="number" value={inputs.dcf_terminal_multiple ?? ""} onChange={(e) => setNumInput("dcf_terminal_multiple")(e.target.value)} /></div>
              <div className="md:col-span-5 text-xs text-muted-foreground">
                {result.breakdown.dcf_method
                  ? `DCF EV: ${formatCurrency(result.breakdown.dcf_method.value)} (FCF PV ${formatCurrency(result.breakdown.dcf_method.fcf_pv_total)} + Terminal ${formatCurrency(result.breakdown.dcf_method.terminal_value)})`
                  : "Add ARR/Revenue, discount rate, and FCF margin to compute DCF"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Save Scenario</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Scenario name (e.g. Q4 2026 Base Case)" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
              <Textarea rows={2} placeholder="Description (optional)" value={scenarioDesc} onChange={(e) => setScenarioDesc(e.target.value)} />
              <div className="flex gap-2">
                <Button onClick={saveScenario}><Save className="h-3 w-3 mr-1" /> {editingId ? "Update" : "Save"} Scenario</Button>
                {editingId && (
                  <Button variant="outline" onClick={() => { setEditingId(null); setScenarioName(""); setScenarioDesc(""); setInputs(blankInputs); }}>
                    Cancel Edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comps" className="pt-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Comparable Transactions</CardTitle>
              <Button size="sm" onClick={() => setCompDialog(true)}><Plus className="h-3 w-3 mr-1" /> Add Comp</Button>
            </CardHeader>
            <CardContent>
              {comps.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No comparables yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Deal Value</TableHead>
                      <TableHead>EV/ARR</TableHead>
                      <TableHead>EV/Rev</TableHead>
                      <TableHead>EV/EBITDA</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comps.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.company_name}{c.ticker ? ` (${c.ticker})` : ""}</TableCell>
                        <TableCell>{c.industry ?? "—"}</TableCell>
                        <TableCell>{c.transaction_date ?? "—"}</TableCell>
                        <TableCell>{c.deal_value ? formatCurrency(c.deal_value) : "—"}</TableCell>
                        <TableCell>{c.ev_arr_multiple ? `${c.ev_arr_multiple.toFixed(1)}x` : "—"}</TableCell>
                        <TableCell>{c.ev_revenue_multiple ? `${c.ev_revenue_multiple.toFixed(1)}x` : "—"}</TableCell>
                        <TableCell>{c.ev_ebitda_multiple ? `${c.ev_ebitda_multiple.toFixed(1)}x` : "—"}</TableCell>
                        <TableCell><Button size="icon" variant="ghost" aria-label="Delete comparable" onClick={() => deleteComp(c.id)}><Trash2 className="h-3 w-3" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scenarios" className="pt-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Saved Scenarios</CardTitle></CardHeader>
            <CardContent>
              {scenarios.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No saved scenarios yet</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scenario</TableHead>
                      <TableHead>Low</TableHead>
                      <TableHead>Mid</TableHead>
                      <TableHead>High</TableHead>
                      <TableHead>Saved</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scenarios.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {s.is_primary && <Star className="h-3 w-3 fill-primary text-primary" />}
                            <div>
                              <div className="font-medium">{s.scenario_name}</div>
                              {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(s.computed_low ?? 0)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(s.computed_mid ?? 0)}</TableCell>
                        <TableCell>{formatCurrency(s.computed_high ?? 0)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => loadScenario(s)}>Edit</Button>
                            {!s.is_primary && <Button size="sm" variant="ghost" aria-label="Mark as primary scenario" onClick={() => setPrimary(s.id)}><Star className="h-3 w-3" /></Button>}
                            <Button size="icon" variant="ghost" aria-label="Delete scenario" onClick={() => deleteScenario(s.id)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Comp Dialog */}
      <Dialog open={compDialog} onOpenChange={setCompDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Comparable</DialogTitle>
            <DialogDescription>Multiples auto-calculate from deal value ÷ base metric if not entered.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Company *</Label><Input value={compForm.company_name ?? ""} onChange={(e) => setCompForm({ ...compForm, company_name: e.target.value })} /></div>
              <div><Label>Ticker</Label><Input value={compForm.ticker ?? ""} onChange={(e) => setCompForm({ ...compForm, ticker: e.target.value })} /></div>
              <div><Label>Industry</Label><Input value={compForm.industry ?? ""} onChange={(e) => setCompForm({ ...compForm, industry: e.target.value })} /></div>
              <div><Label>Transaction Date</Label><Input type="date" value={compForm.transaction_date ?? ""} onChange={(e) => setCompForm({ ...compForm, transaction_date: e.target.value })} /></div>
              <div><Label>Deal Value</Label><Input type="number" value={compForm.deal_value ?? ""} onChange={(e) => setCompForm({ ...compForm, deal_value: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><Label>Growth %</Label><Input type="number" value={compForm.growth_rate_pct ?? ""} onChange={(e) => setCompForm({ ...compForm, growth_rate_pct: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><Label>ARR</Label><Input type="number" value={compForm.arr ?? ""} onChange={(e) => setCompForm({ ...compForm, arr: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><Label>Revenue</Label><Input type="number" value={compForm.revenue ?? ""} onChange={(e) => setCompForm({ ...compForm, revenue: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><Label>EBITDA</Label><Input type="number" value={compForm.ebitda ?? ""} onChange={(e) => setCompForm({ ...compForm, ebitda: e.target.value ? Number(e.target.value) : null })} /></div>
            </div>
            <div><Label>Source Notes</Label><Textarea rows={2} value={compForm.source_notes ?? ""} onChange={(e) => setCompForm({ ...compForm, source_notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompDialog(false)}>Cancel</Button>
            <Button onClick={saveComp}>Add Comp</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
