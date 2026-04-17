import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAcquisitionData } from "./useAcquisitionData";
import ExecutiveSummaryPage from "./ExecutiveSummaryPage";
import RevenueQualityPage from "./RevenueQualityPage";
import RetentionCohortsPage from "./RetentionCohortsPage";
import CustomerConcentrationPage from "./CustomerConcentrationPage";
import ProductUsagePage from "./ProductUsagePage";
import FinancialEfficiencyPage from "./FinancialEfficiencyPage";
import RiskFlagsPage from "./RiskFlagsPage";
import MetricDefinitionsPage from "./MetricDefinitionsPage";
import DiligenceExportsPage from "./DiligenceExportsPage";

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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Acquisition Readiness</CardTitle>
        <p className="text-sm text-muted-foreground">A complete view of growth, retention, efficiency, risk, and diligence readiness.</p>
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
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="metrics">Definitions</TabsTrigger>
            <TabsTrigger value="exports">Exports</TabsTrigger>
          </TabsList>
          <TabsContent value="exec" className="mt-6"><ExecutiveSummaryPage data={data} /></TabsContent>
          <TabsContent value="revenue" className="mt-6"><RevenueQualityPage data={data} /></TabsContent>
          <TabsContent value="retention" className="mt-6"><RetentionCohortsPage data={data} /></TabsContent>
          <TabsContent value="concentration" className="mt-6"><CustomerConcentrationPage data={data} /></TabsContent>
          <TabsContent value="usage" className="mt-6"><ProductUsagePage data={data} /></TabsContent>
          <TabsContent value="finance" className="mt-6"><FinancialEfficiencyPage data={data} /></TabsContent>
          <TabsContent value="risk" className="mt-6"><RiskFlagsPage data={data} /></TabsContent>
          <TabsContent value="metrics" className="mt-6"><MetricDefinitionsPage data={data} /></TabsContent>
          <TabsContent value="exports" className="mt-6"><DiligenceExportsPage data={data} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
