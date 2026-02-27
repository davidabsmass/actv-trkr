-- Add a column to store which day of the month a monthly schedule should run
ALTER TABLE public.report_schedules
ADD COLUMN run_day_of_month integer NOT NULL DEFAULT 1;
