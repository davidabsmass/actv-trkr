DELETE FROM seo_fix_queue WHERE scan_id = '08883030-3749-4196-b6f8-f5f412240992';
DELETE FROM seo_fix_history WHERE site_id = '7155b77f-e4c6-4772-a93d-e57f58e0b81d';
DELETE FROM seo_scans WHERE site_id = '7155b77f-e4c6-4772-a93d-e57f58e0b81d';
DELETE FROM ssl_health WHERE site_id = '7155b77f-e4c6-4772-a93d-e57f58e0b81d';
DELETE FROM domain_health WHERE site_id = '7155b77f-e4c6-4772-a93d-e57f58e0b81d';
DELETE FROM monitoring_alerts WHERE site_id = '7155b77f-e4c6-4772-a93d-e57f58e0b81d';
DELETE FROM sites WHERE id = '7155b77f-e4c6-4772-a93d-e57f58e0b81d';