-- Remove weekly_brief report template
-- First delete any schedules referencing it
DELETE FROM report_schedules WHERE template_slug = 'weekly_brief';
-- Delete any runs referencing it
DELETE FROM report_runs WHERE template_slug = 'weekly_brief';
-- Delete the template
DELETE FROM report_templates WHERE slug = 'weekly_brief';
