select
  rv.version_number,
  rv.status,
  rv.effective_from,
  rv.effective_from at time zone b.timezone as effective_from_local,
  rv.created_at
from recipe_versions rv
join recipes r
  on r.id = rv.recipe_id
 and r.business_id = rv.business_id
join items i
  on i.id = r.output_item_id
 and i.business_id = r.business_id
join businesses b
  on b.id = rv.business_id
where i.name = 'Hogaza Rústica'
order by rv.version_number;