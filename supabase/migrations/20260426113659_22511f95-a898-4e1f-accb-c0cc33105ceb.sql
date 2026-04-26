
CREATE POLICY "pv_select_admin" ON public.pageviews FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "events_select_admin" ON public.events FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "leads_select_admin" ON public.leads FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "le_select_admin" ON public.login_events FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "bl_select_admin" ON public.broken_links FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "fhc_select_admin" ON public.form_health_checks FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "gcomp_select_admin" ON public.goal_completions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "sfq_select_admin" ON public.seo_fix_queue FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
