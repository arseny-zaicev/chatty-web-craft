-- 1) Drop trigger blocking shared sender numbers across active pipelines
DROP TRIGGER IF EXISTS pipelines_assert_sender_unique ON public.pipelines;

-- (keep the function around in case we want to re-enable later, but it's not invoked anymore)

-- 2) Activate Reactivation Leads / DE with shared senders
UPDATE public.pipelines
SET
  auto_outreach_enabled = true,
  daily_cap = 50,
  expected_country_codes = ARRAY['49'],
  sending_window = '{"start":"08:00","end":"20:00","timezone":"Europe/Berlin"}'::jsonb,
  first_touch_template_group_id = '4afeb841-80a3-4168-ad58-ec5b0c7c9652',
  default_sender_number_ids = ARRAY[
    '03df39b9-dea2-4eca-a895-a7ffc6cdff3c'::uuid,
    '97bc481e-bb71-44cb-a7fb-d52a3cf3e056'::uuid,
    '3788de8b-6a8e-4e82-ba9f-f5b7df7ce38e'::uuid
  ]
WHERE id = 'bb13117d-beac-4860-ad2c-49a950cbcd37';