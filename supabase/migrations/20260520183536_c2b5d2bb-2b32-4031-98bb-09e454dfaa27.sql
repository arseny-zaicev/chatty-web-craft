
UPDATE campaigns SET status='paused', updated_at=now()
WHERE id IN ('d01c7320-dd4e-4c67-985f-14893f96cd31','fada5b8e-a516-4182-ac48-00e93016ed95')
  AND status='running';
