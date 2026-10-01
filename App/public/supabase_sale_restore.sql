-- Preserve optional bullion details and scan-photo references when undoing a full sale.
CREATE OR REPLACE FUNCTION public.benza_undo_sale_atomic(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions;
  v_current public.holdings;
  v_snapshot jsonb;
  v_restored_qty numeric;
  v_restored_cost numeric;
  v_weight numeric;
  v_purchase_date date;
  v_serial text;
  v_notes text;
  v_photo text;
  v_receipt text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.benza_is_pro(v_user_id) then raise exception 'Benza Bullion Pro is required for realized sale tracking'; end if;

  select * into v_tx
  from public.transactions
  where id=p_sale_id and user_id=v_user_id and type='sell'
  for update;

  if v_tx.id is null then raise exception 'Sale not found'; end if;

  if exists(
    select 1 from public.transactions t
    where t.user_id=v_user_id
      and t.holding_id=v_tx.holding_id
      and t.created_at>v_tx.created_at
      and t.type in ('sell','update','remove')
  ) then
    raise exception 'Undo the most recent sale for this holding first';
  end if;

  select * into v_current
  from public.holdings
  where id=v_tx.holding_id and user_id=v_user_id
  for update;

  v_snapshot := v_tx.holding_snapshot;
  v_weight := coalesce(v_current.weight_oz, (v_snapshot->>'weight_oz')::numeric, v_tx.weight_oz);

  if v_current.id is not null then
    v_restored_qty := v_current.quantity + v_tx.quantity;
    v_restored_cost := v_current.cost_basis + coalesce(v_tx.cost_basis_removed,0);

    update public.holdings
    set quantity=v_restored_qty,
        total_oz=v_restored_qty*v_weight,
        cost_basis=v_restored_cost
    where id=v_tx.holding_id and user_id=v_user_id;
  else
    v_restored_qty := coalesce((v_snapshot->>'quantity')::numeric, v_tx.quantity);
    v_restored_cost := coalesce((v_snapshot->>'cost_basis')::numeric, v_tx.cost_basis_removed,0);
    v_purchase_date := coalesce(
      (v_snapshot->>'purchase_date')::date,
      (select transaction_date from public.transactions t
       where t.user_id=v_user_id and t.holding_id=v_tx.holding_id and t.type='buy'
       order by created_at asc limit 1)
    );
    v_serial := v_snapshot->>'serial_number';
    v_notes := v_snapshot->>'notes';
    v_photo := v_snapshot->>'photo_path';
    v_receipt := v_snapshot->>'receipt_path';

    insert into public.holdings(
      id,user_id,metal,product,quantity,weight_oz,total_oz,cost_basis,purchase_date,
      serial_number,notes,photo_path,receipt_path,bullion_year,purity,mint,scanner_photo_paths
    ) values (
      v_tx.holding_id,v_user_id,v_tx.metal,v_tx.product,v_restored_qty,v_weight,v_restored_qty*v_weight,
      v_restored_cost,v_purchase_date,
      nullif(v_serial,''),nullif(v_notes,''),nullif(v_photo,''),nullif(v_receipt,''),
      (v_snapshot->>'bullion_year')::integer,nullif(v_snapshot->>'purity',''),nullif(v_snapshot->>'mint',''),
      coalesce(array(select jsonb_array_elements_text(v_snapshot->'scanner_photo_paths')),array[]::text[])
    );
  end if;

  delete from public.transactions where id=v_tx.id and user_id=v_user_id;

  return jsonb_build_object(
    'sale_id',p_sale_id,
    'holding_id',v_tx.holding_id,
    'restored_quantity',v_restored_qty,
    'restored_cost_basis',v_restored_cost
  );
end;
$function$
;
