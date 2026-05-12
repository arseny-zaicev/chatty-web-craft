update audience_rows
set derived_payload = derived_payload
  || jsonb_build_object(
       'var_2','potential business funding based on your D&B profile',
       'var_3','Our team noticed your D&B score has improved, and you may qualify for $50k to $100k in business funding if you would like to learn more.'
     )
where batch_id='0ee28ebc-31d8-4731-b2f9-955ba9bbb53e'
  and validation_status='valid'
  and usage_status='unused';

update audience_batches
set notes = '__static_values__=' || jsonb_build_object(
  'var_2','potential business funding based on your D&B profile',
  'var_3','Our team noticed your D&B score has improved, and you may qualify for $50k to $100k in business funding if you would like to learn more.'
)::text
where id='0ee28ebc-31d8-4731-b2f9-955ba9bbb53e';