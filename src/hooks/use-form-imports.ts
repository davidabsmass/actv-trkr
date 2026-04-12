import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";

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
      const { data, error } = await supabase.functions.invoke("manage-import-job", {
        body: {},
        method: "GET",
        headers: {},
      });
      // Use query param approach
      const res = await supabase.functions.invoke(`manage-import-job?action=list&org_id=${orgId}`, {
        method: "GET",
      });
      if (res.error) throw res.error;
      return (res.data?.integrations || []) as FormIntegration[];
    },
    enabled: !!orgId,
    refetchInterval: 10_000, // poll every 10s while importing
  });
}

export function useDiscoverForms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (siteId: string) => {
      const res = await supabase.functions.invoke("manage-import-job?action=discover", {
        body: { site_id: siteId },
      });
      if (res.error) throw res.error;
      return res.data;
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
      const res = await supabase.functions.invoke("manage-import-job?action=create", {
        body: params,
      });
      if (res.error) throw res.error;
      return res.data;
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
      const res = await supabase.functions.invoke("manage-import-job?action=process", {
        body: { job_id: jobId },
      });
      if (res.error) throw res.error;
      return res.data;
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
      const res = await supabase.functions.invoke("manage-import-job?action=resume", {
        body: { job_id: jobId },
      });
      if (res.error) throw res.error;
      return res.data;
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
      const res = await supabase.functions.invoke("manage-import-job?action=restart", {
        body: { job_id: jobId },
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form_integrations"] });
    },
  });
}
