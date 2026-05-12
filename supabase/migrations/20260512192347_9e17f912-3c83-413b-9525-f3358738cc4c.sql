UPDATE public.audience_rows
SET usage_status = 'unused',
    reserved_at = NULL,
    used_at = NULL,
    used_in_campaign_id = NULL
WHERE used_in_campaign_id = '1e2b9400-f3a7-4240-be53-e5ebc0f0a458';