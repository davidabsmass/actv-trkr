import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/hooks/use-org";
import { callManageImportJob } from "@/lib/manage-import-job";

export interface FormIntegration {
  id: string;
  site_id: string;
  org_id: string;
  builder_type: string;
  external_form_id: string;
  form_name: string;
  status: string;
  total_entries_estimated: number;
  total_entries_imported: number;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  form_import_jobs?: FormImportJob[];
}

export interface FormImportJob {
  id: string;
  status: string;
  cursor: string | null;
  batch_size: number;
  total_processed: number;
  total_expected: number;
  last_batch_at: string | null;
  retry_count: number;
  last_error: string | null;
}

export function useFormIntegrations() {
  const { orgId } = useOrg();

  return useQuery({
    queryKey: ["form_integrations", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const data = await callManageImportJob<{ integrations?: FormIntegration[] }>("list", {
        method: "GET",
        query: { org_id: orgId },
      });
      return (data.integrations || []) as FormIntegration[];
    },
    enabled: !!orgId,
    refetchInterval: 10_000, // poll every 10s while importing
  });
}

export function useDiscoverForms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (siteId: string) => {
      return callManageImportJob("discover", { body: { site_id: siteId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });
    },
  });
}

export function useCreateImportJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { form_integration_id: string; batch_size?: number }) => {
      return callManageImportJob("create", { body: params });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });
    },
  });
}

export function useProcessImportBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      return callManageImportJob("process", { body: { job_id: jobId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });
    },
  });
}

export function useResumeImportJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      return callManageImportJob("resume", { body: { job_id: jobId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });
    },
  });
}

export function useRestartImportJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (jobId: string) => {
      return callManageImportJob("restart", { body: { job_id: jobId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });
    },
  });
}
