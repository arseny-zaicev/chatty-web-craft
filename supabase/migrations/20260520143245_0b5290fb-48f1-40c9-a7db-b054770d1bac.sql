UPDATE public.campaign_recipients
   SET scheduled_at = now()
 WHERE campaign_id IN (
   '9a2f39fa-a9ae-4eab-afec-efa50651806f',
   '0b47d81a-1e87-414b-afca-1845f21ecd5f'
 )
   AND status = 'scheduled'
   AND sent_at IS NULL;

UPDATE public.campaigns
   SET first_scheduled_at = now(),
       scheduled_start_at = now()
 WHERE id IN (
   '9a2f39fa-a9ae-4eab-afec-efa50651806f',
   '0b47d81a-1e87-414b-afca-1845f21ecd5f'
 );