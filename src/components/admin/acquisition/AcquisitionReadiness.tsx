import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAcquisitionData } from "./useAcquisitionData";
import { BuyerViewProvider, BuyerViewToggle } from "./BuyerViewContext";
import ExecutiveSummaryPage from "./ExecutiveSummaryPage";
import RevenueQualityPage from "./RevenueQualityPage";
import RetentionCohortsPage from "./RetentionCohortsPage";
import CustomerConcentrationPage from "./CustomerConcentrationPage";
import ProductUsagePage from "./ProductUsagePage";
import FinancialEfficiencyPage from "./FinancialEfficiencyPage";
import RiskFlagsPage from "./RiskFlagsPage";
import MetricDefinitionsPage from "./MetricDefinitionsPage";
import DiligenceExportsPage from "./DiligenceExportsPage";
import SecurityCompliancePage from "./SecurityCompliancePage";
import TechnologyIpPage from "./TechnologyIpPage";
import ForecastingPage from "./ForecastingPage";
import ReconciliationPage from "./ReconciliationPage";
import DiligenceChecklistPage from "./DiligenceChecklistPage";
import DataRoomManager from "./DataRoomManager";
import DealPipelineManager from "./DealPipelineManager";
import ValuationManager from "./ValuationManager";
import AnomalyAlertsPanel from "./AnomalyAlertsPanel";

export default function AcquisitionReadiness() {
  const data = useAcquisitionData();

  if (data.loading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <BuyerViewProvider>
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Acquisition Readiness</CardTitle>
            <p className="text-sm text-muted-foreground">A complete view of growth, retention, efficiency, risk, and diligence readiness.</p>
          </div>
          <BuyerViewToggle />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="exec" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="exec">Executive</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="retention">Retention</TabsTrigger>
            <TabsTrigger value="concentration">Concentration</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="finance">Finance</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="tech">Tech &amp; IP</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="recon">Reconciliation</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="metrics">Definitions</TabsTrigger>
            <TabsTrigger value="exports">Exports</TabsTrigger>
            <TabsTrigger value="dataroom">Data Room</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="valuation">Valuation</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
          </TabsList>
          <TabsContent value="exec" className="mt-6"><ExecutiveSummaryPage data={data} /></TabsContent>
          <TabsContent value="revenue" className="mt-6"><RevenueQualityPage data={data} /></TabsContent>
          <TabsContent value="retention" className="mt-6"><RetentionCohortsPage data={data} /></TabsContent>
          <TabsContent value="concentration" className="mt-6"><CustomerConcentrationPage data={data} /></TabsContent>
          <TabsContent value="usage" className="mt-6"><ProductUsagePage data={data} /></TabsContent>
          <TabsContent value="finance" className="mt-6"><FinancialEfficiencyPage data={data} /></TabsContent>
          <TabsContent value="security" className="mt-6"><SecurityCompliancePage data={data} /></TabsContent>
          <TabsContent value="tech" className="mt-6"><TechnologyIpPage data={data} /></TabsContent>
          <TabsContent value="forecast" className="mt-6"><ForecastingPage data={data} /></TabsContent>
          <TabsContent value="recon" className="mt-6"><ReconciliationPage data={data} /></TabsContent>
          <TabsContent value="checklist" className="mt-6"><DiligenceChecklistPage data={data} /></TabsContent>
          <TabsContent value="risk" className="mt-6"><RiskFlagsPage data={data} /></TabsContent>
          <TabsContent value="metrics" className="mt-6"><MetricDefinitionsPage data={data} /></TabsContent>
          <TabsContent value="exports" className="mt-6"><DiligenceExportsPage data={data} /></TabsContent>
          <TabsContent value="dataroom" className="mt-6"><DataRoomManager /></TabsContent>
          <TabsContent value="pipeline" className="mt-6"><DealPipelineManager /></TabsContent>
          <TabsContent value="valuation" className="mt-6"><ValuationManager /></TabsContent>
          <TabsContent value="alerts" className="mt-6"><AnomalyAlertsPanel /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    </BuyerViewProvider>
  );
}
