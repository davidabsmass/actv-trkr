UPDATE leads
SET status = 'new'
WHERE form_id IN ('e1b7652c-7308-4774-a80f-a721acb40e3c', 'd4abda2e-df68-4b7a-bd2e-f37810fbb2ea', '2e9dfe00-8d6b-46d1-acba-d05c88279810')
AND status = 'trashed';