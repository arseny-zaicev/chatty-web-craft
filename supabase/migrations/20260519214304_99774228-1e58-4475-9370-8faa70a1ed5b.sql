UPDATE public.message_templates
SET variables_sample = jsonb_build_array(
  'Marta',
  'retail channel expansion opportunities',
  E'\n\nWe currently have a few exclusive incentives available with Amazon, Walmart, Target, Macy''s, Nordstrom, Best Buy, Home Depot, and Lowe''s, and I wanted to see if it may be worth exploring whether your products could be a fit'
)
WHERE id = 'cf44676b-8b4a-4d61-870a-443eddd69740';