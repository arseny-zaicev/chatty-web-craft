-- Reset locked-failed rows back to scheduled
UPDATE campaign_recipients
   SET status = 'scheduled',
       error_message = NULL,
       sent_at = NULL,
       provider_message_id = NULL,
       updated_at = now()
 WHERE campaign_id = 'e7ad95a9-eef4-4dcf-9dac-aacd6d3386c2'
   AND status = 'failed'
   AND whatsapp_number_id IN (
     '76bf0190-f96e-4b67-9cdb-9314fd19ade3'::uuid,
     '1cb2206e-75c9-4779-b036-fd094055b232'::uuid
   )
   AND error_message ILIKE '%131031%';

-- Reassign all scheduled rows off the two bad senders, round-robin to 3 healthy ones
WITH to_move AS (
  SELECT id,
         row_number() OVER (ORDER BY scheduled_at NULLS LAST, id) AS rn
    FROM campaign_recipients
   WHERE campaign_id = 'e7ad95a9-eef4-4dcf-9dac-aacd6d3386c2'
     AND status = 'scheduled'
     AND whatsapp_number_id IN (
       '76bf0190-f96e-4b67-9cdb-9314fd19ade3'::uuid,
       '1cb2206e-75c9-4779-b036-fd094055b232'::uuid
     )
),
healthy(idx, wid) AS (
  VALUES
    (1, 'a5c133ea-d42b-41ab-b611-1e77f2c8f37f'::uuid),
    (2, 'ff324eee-169e-4770-80ea-eda61ca8b9ff'::uuid),
    (3, '2b8401a9-e204-4d5f-80c6-cf21d30f22bd'::uuid)
)
UPDATE campaign_recipients cr
   SET whatsapp_number_id = h.wid,
       updated_at = now()
  FROM to_move tm
  JOIN healthy h ON h.idx = ((tm.rn - 1) % 3) + 1
 WHERE cr.id = tm.id;