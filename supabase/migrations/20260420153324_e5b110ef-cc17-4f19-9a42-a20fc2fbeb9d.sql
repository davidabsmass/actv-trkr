GRANT EXECUTE ON FUNCTION public.qa_list_cron_jobs() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_check_pgmq_queue_depth() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_check_rls_status() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.qa_check_has_role_definer() TO service_role, authenticated;