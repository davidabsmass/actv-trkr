import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Subscriber = {
  id: string;
  email: string;
  plan: string;
  status: string;
  mrr: number;
  created_at: string;
  churn_date: string | null;
};

export type FinanceMonth = {
  id: string;
  month: string;
  revenue: number;
  cogs_hosting: number;
  cogs_ai: number;
  cogs_support: number;
  cogs_other: number;
  opex_rd: number;
  opex_sm: number;
  opex_ga: number;
  cash_balance: number | null;
  headcount: number;
  notes: string | null;
};

export type Contract = {
  id: string;
  customer_id: string;
  customer_name: string;
  org_id: string | null;
  plan: string | null;
  acv: number;
  mrr: number;
  contract_start: string | null;
  contract_end: string | null;
  auto_renew: boolean;
  billing_frequency: string;
  industry: string | null;
  geography: string | null;
  custom_terms: string | null;
};

export type RiskFlag = {
  id: string;
  risk_type: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  mitigation_plan: string | null;
  auto_generated: boolean;
  created_at: string;
};

export type MetricDef = {
  id: string;
  metric_key: string;
  metric_name: string;
  category: string;
  formula: string | null;
  description: string | null;
  source_systems: string | null;
  caveats: string | null;
  unit: string | null;
};

export type DiligenceItem = {
  id: string;
  section_key: string;
  item_name: string;
  readiness_status: string;
  notes: string | null;
  linked_document_url: string | null;
  sort_order: number;
};

export type Vendor = {
  id: string;
  vendor_name: string;
  category: string | null;
  criticality: string | null;
  risk_level: string | null;
  monthly_cost: number | null;
  contract_status: string | null;
  contract_renewal_date: string | null;
  backup_plan: string | null;
  dependency_notes: string | null;
};

export type ReconciliationRow = {
  id: string;
  metric_key: string;
  status: string;
  discrepancy_amount: number | null;
  notes: string | null;
  last_reconciled_at: string | null;
  period_start: string | null;
  period_end: string | null;
};

export type SecurityIncident = {
  id: string;
  title: string;
  severity: string;
  status: string;
  identified_at: string;
  resolved_at: string | null;
  summary: string | null;
  remediation_notes: string | null;
};

export type OperationalDoc = {
  id: string;
  document_type: string;
  title: string;
  status: string;
  linked_url: string | null;
  notes: string | null;
};

export type ForecastAssumption = {
  id: string;
  period_label: string;
  scenario: string;
  metric_key: string;
  forecast_value: number | null;
  actual_value: number | null;
  notes: string | null;
};

export type TechDependency = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  criticality: string;
  replaceable: string;
  monthly_cost: number | null;
  owner_notes: string | null;
};

export type IpAssignment = {
  id: string;
  asset_type: string;
  asset_name: string;
  owner_name: string | null;
  assignment_status: string;
  document_url: string | null;
  notes: string | null;
};

export type FounderDependency = {
  id: string;
  process_name: string;
  category: string;
  dependency_level: string;
  documentation_status: string;
  runbook_url: string | null;
  notes: string | null;
};

export type AcquisitionData = {
  subscribers: Subscriber[];
  contracts: Contract[];
  finance: FinanceMonth[];
  risks: RiskFlag[];
  metrics: MetricDef[];
  checklist: DiligenceItem[];
  vendors: Vendor[];
  reconciliation: ReconciliationRow[];
  incidents: SecurityIncident[];
  documents: OperationalDoc[];
  forecasts: ForecastAssumption[];
  techDeps: TechDependency[];
  ipAssignments: IpAssignment[];
  founderDeps: FounderDependency[];
  loading: boolean;
  reload: () => Promise<void>;
};

export function useAcquisitionData(): AcquisitionData {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [finance, setFinance] = useState<FinanceMonth[]>([]);
  const [risks, setRisks] = useState<RiskFlag[]>([]);
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [checklist, setChecklist] = useState<DiligenceItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationRow[]>([]);
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [documents, setDocuments] = useState<OperationalDoc[]>([]);
  const [forecasts, setForecasts] = useState<ForecastAssumption[]>([]);
  const [techDeps, setTechDeps] = useState<TechDependency[]>([]);
  const [ipAssignments, setIpAssignments] = useState<IpAssignment[]>([]);
  const [founderDeps, setFounderDeps] = useState<FounderDependency[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const [sub, ctr, fin, rsk, met, chk, ven, rec, inc, doc, fcst, tdep, ipa, fdep] = await Promise.all([
      supabase.from("subscribers").select("id,email,plan,status,mrr,created_at,churn_date"),
      supabase.from("customer_contracts").select("*").order("acv", { ascending: false }),
      supabase.from("finance_monthly").select("*").order("month", { ascending: true }),
      supabase.from("acquisition_risk_flags").select("*").order("created_at", { ascending: false }),
      supabase.from("metric_definitions").select("*").order("category").order("metric_name"),
      supabase.from("diligence_checklist_items").select("*").order("section_key").order("sort_order"),
      supabase.from("vendor_risk_registry").select("*").order("criticality"),
      supabase.from("reconciliation_status").select("*").order("metric_key"),
      supabase.from("security_incidents").select("*").order("identified_at", { ascending: false }),
      supabase.from("operational_documents").select("*").order("document_type"),
      supabase.from("forecast_assumptions").select("*").order("period_label", { ascending: false }),
      supabase.from("technology_dependencies").select("*").order("criticality"),
      supabase.from("ip_assignments").select("*").order("asset_type"),
      supabase.from("founder_dependencies").select("*").order("dependency_level"),
    ]);
    if (sub.data) setSubscribers(sub.data as Subscriber[]);
    if (ctr.data) setContracts(ctr.data as Contract[]);
    if (fin.data) setFinance(fin.data as FinanceMonth[]);
    if (rsk.data) setRisks(rsk.data as RiskFlag[]);
    if (met.data) setMetrics(met.data as MetricDef[]);
    if (chk.data) setChecklist(chk.data as DiligenceItem[]);
    if (ven.data) setVendors(ven.data as Vendor[]);
    if (rec.data) setReconciliation(rec.data as ReconciliationRow[]);
    if (inc.data) setIncidents(inc.data as SecurityIncident[]);
    if (doc.data) setDocuments(doc.data as OperationalDoc[]);
    if (fcst.data) setForecasts(fcst.data as ForecastAssumption[]);
    if (tdep.data) setTechDeps(tdep.data as TechDependency[]);
    if (ipa.data) setIpAssignments(ipa.data as IpAssignment[]);
    if (fdep.data) setFounderDeps(fdep.data as FounderDependency[]);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  return {
    subscribers, contracts, finance, risks, metrics, checklist, vendors,
    reconciliation, incidents, documents, forecasts, techDeps, ipAssignments, founderDeps,
    loading, reload,
  };
}
