
-- Fix numeric-only field labels for Avada forms to human-readable names
-- Patient General form fields
UPDATE lead_fields_flat SET field_label = 'Name' WHERE field_key = '17' AND field_label = '17' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Phone' WHERE field_key = '18' AND field_label = '18' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Email' WHERE field_key = '19' AND field_label = '19' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Type' WHERE field_key = '20' AND field_label = '20' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'City' WHERE field_key = '21' AND field_label = '21' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Zip' WHERE field_key = '22' AND field_label = '22' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'State' WHERE field_key = '23' AND field_label = '23' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Country' WHERE field_key = '24' AND field_label = '24' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Subject' WHERE field_key = '25' AND field_label = '25' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Message' WHERE field_key = '26' AND field_label = '26' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Consent' WHERE field_key = '27' AND field_label = '27' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';

-- Patient Medical form fields
UPDATE lead_fields_flat SET field_label = 'Name' WHERE field_key = '51' AND field_label = '51' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Phone' WHERE field_key = '52' AND field_label = '52' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Email' WHERE field_key = '53' AND field_label = '53' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Physician' WHERE field_key = '54' AND field_label = '54' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'City' WHERE field_key = '55' AND field_label = '55' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Zip' WHERE field_key = '56' AND field_label = '56' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'State' WHERE field_key = '57' AND field_label = '57' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Country' WHERE field_key = '58' AND field_label = '58' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Subject' WHERE field_key = '59' AND field_label = '59' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Message' WHERE field_key = '60' AND field_label = '60' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Consent' WHERE field_key = '61' AND field_label = '61' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';

-- Renew You Near You form fields
UPDATE lead_fields_flat SET field_label = 'Name' WHERE field_key = '13' AND field_label = '13' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Email' WHERE field_key = '14' AND field_label = '14' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Zip' WHERE field_key = '15' AND field_label = '15' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';

-- Physician Medical form fields (backfill entries had numeric labels from db sync)
UPDATE lead_fields_flat SET field_label = 'Name' WHERE field_key = '1' AND field_label = '1' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Phone' WHERE field_key = '2' AND field_label = '2' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Email' WHERE field_key = '3' AND field_label = '3' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Company' WHERE field_key = '4' AND field_label = '4' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'State' WHERE field_key = '5' AND field_label = '5' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Zip' WHERE field_key = '6' AND field_label = '6' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'State' WHERE field_key = '7' AND field_label = '7' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Country' WHERE field_key = '8' AND field_label = '8' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Product Interest' WHERE field_key = '9' AND field_label = '9' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Specialty' WHERE field_key = '10' AND field_label = '10' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Technology' WHERE field_key = '11' AND field_label = '11' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
UPDATE lead_fields_flat SET field_label = 'Message' WHERE field_key = '12' AND field_label = '12' AND org_id = '28e03fb0-64d2-4253-9a27-7f78d186a6fb';
