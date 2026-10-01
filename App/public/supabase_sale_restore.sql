-- Keep realized-sale basis math cent-accurate and preserve optional bullion details on undo.
CREATE OR REPLACE FUNCTION public.benza_sell_holding_atomic(p_holding_id uuid, p_quantity numeric, p_sale_proceeds numeric, p_transaction_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_holding public.holdings;
  v_cost_removed numeric;
  v_oz_removed numeric;
  v_realized numeric;
  v_remaining_qty numeric;
  v_sale_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not public.benza_is_pro(v_user_id) then raise exception 'Benza Bullion Pro is required for realized sale tracking'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Sale quantity must be greater than 0'; end if;
  if p_sale_proceeds is null or p_sale_proceeds < 0 then raise exception 'Sale proceeds cannot be negative'; end if;

  select * into v_holding
  from public.holdings
  where id=p_holding_id and user_id=v_user_id
  for update;

  if v_holding.id is null then raise exception 'Holding not found'; end if;
  if p_quantity > v_holding.quantity then raise exception 'Sale quantity exceeds holding quantity'; end if;

  v_cost_removed := case when v_holding.quantity>0 then round(v_holding.cost_basis*(p_quantity/v_holding.quantity),2) else 0 end;
  v_oz_removed := p_quantity*v_holding.weight_oz;
  v_realized := p_sale_proceeds-v_cost_removed;
  v_remaining_qty := v_holding.quantity-p_quantity;

  insert into public.transactions(
    user_id,type,holding_id,metal,product,quantity,weight_oz,total_oz,amount,transaction_date,
    sale_proceeds,realized_gain,cost_basis_removed,holding_snapshot
  )
  values(
    v_user_id,'sell',v_holding.id,v_holding.metal,v_holding.product,p_quantity,v_holding.weight_oz,
    v_oz_removed,p_sale_proceeds,coalesce(p_transaction_date,current_date),
    p_sale_proceeds,v_realized,v_cost_removed,to_jsonb(v_holding)
  )
  returning id into v_sale_id;

  if v_remaining_qty <= 0 then
    delete from public.holdings
    where id=v_holding.id and user_id=v_user_id;
  else
    update public.holdings
    set quantity=v_remaining_qty,
        total_oz=v_remaining_qty*v_holding.weight_oz,
        cost_basis=greatest(0,v_holding.cost_basis-v_cost_removed)
    where id=v_holding.id and user_id=v_user_id;
  end if;

  return jsonb_build_object(
    'sale_id',v_sale_id,
    'holding_id',v_holding.id,
    'sold_quantity',p_quantity,
    'sold_oz',v_oz_removed,
    'sale_proceeds',p_sale_proceeds,
    'cost_basis_removed',v_cost_removed,
    'realized_gain',v_realized,
    'remaining_quantity',greatest(v_remaining_qty,0)
  );
end;
$function$
;

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
