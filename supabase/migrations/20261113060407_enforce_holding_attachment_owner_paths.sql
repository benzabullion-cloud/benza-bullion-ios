SET lock_timeout = '5s';
DO $guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='benza_add_holding_atomic' AND md5(pg_get_functiondef(p.oid))='f4c98b7afda8e446b2ea733012b87e0b') THEN RAISE EXCEPTION 'Function changed since review: benza_add_holding_atomic'; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='benza_add_holding_details' AND md5(pg_get_functiondef(p.oid))='d57ca988eb469c94a8d888d2a97486e9') THEN RAISE EXCEPTION 'Function changed since review: benza_add_holding_details'; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='benza_update_holding_atomic' AND md5(pg_get_functiondef(p.oid))='8ddd0a699095c6e3d6fc5e59c0ef8088') THEN RAISE EXCEPTION 'Function changed since review: benza_update_holding_atomic'; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='benza_update_holding_details' AND md5(pg_get_functiondef(p.oid))='ea22217a1fefd4e6eb74d80fba805120') THEN RAISE EXCEPTION 'Function changed since review: benza_update_holding_details'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.benza_add_holding_atomic(p_metal text, p_product text, p_quantity numeric, p_weight_oz numeric, p_cost_basis numeric, p_purchase_date date DEFAULT NULL::date, p_serial_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_photo_path text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text)
 RETURNS holdings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_holding public.holdings;
  v_has_pro boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  -- Attachment references must stay inside the authenticated owner's inventory folder.
  if p_photo_path is not null and left(p_photo_path, length(v_user_id::text || '/inventory/')) <> v_user_id::text || '/inventory/' then
    raise exception 'Invalid photo path';
  end if;
  if p_receipt_path is not null and left(p_receipt_path, length(v_user_id::text || '/inventory/')) <> v_user_id::text || '/inventory/' then
    raise exception 'Invalid receipt path';
  end if;

  v_has_pro := public.benza_is_pro(v_user_id);

  if not v_has_pro and (
    nullif(trim(coalesce(p_serial_number,'')),'') is not null or
    nullif(trim(coalesce(p_notes,'')),'') is not null or
    p_photo_path is not null or
    p_receipt_path is not null
  ) then
    raise exception 'Benza Bullion Pro is required for advanced inventory records';
  end if;

  insert into public.holdings(
    user_id,metal,product,quantity,weight_oz,total_oz,cost_basis,purchase_date,
    serial_number,notes,photo_path,receipt_path
  )
  values(
    v_user_id,p_metal,p_product,p_quantity,p_weight_oz,p_quantity*p_weight_oz,p_cost_basis,p_purchase_date,
    nullif(trim(p_serial_number),''),nullif(trim(p_notes),''),p_photo_path,p_receipt_path
  )
  returning * into v_holding;

  insert into public.transactions(
    user_id,type,holding_id,metal,product,quantity,weight_oz,total_oz,amount,transaction_date
  )
  values(
    v_user_id,'buy',v_holding.id,v_holding.metal,v_holding.product,v_holding.quantity,
    v_holding.weight_oz,v_holding.total_oz,v_holding.cost_basis,coalesce(v_holding.purchase_date,current_date)
  );

  return v_holding;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.benza_add_holding_details(p_metal text, p_product text, p_quantity numeric, p_weight_oz numeric, p_cost_basis numeric, p_purchase_date date DEFAULT NULL::date, p_serial_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_photo_path text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text, p_year integer DEFAULT NULL::integer, p_purity text DEFAULT NULL::text, p_mint text DEFAULT NULL::text)
 RETURNS holdings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_holding public.holdings;
  v_has_pro boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  -- Attachment references must stay inside the authenticated owner's inventory folder.
  if p_photo_path is not null and left(p_photo_path, length(v_user_id::text || '/inventory/')) <> v_user_id::text || '/inventory/' then
    raise exception 'Invalid photo path';
  end if;
  if p_receipt_path is not null and left(p_receipt_path, length(v_user_id::text || '/inventory/')) <> v_user_id::text || '/inventory/' then
    raise exception 'Invalid receipt path';
  end if;

  v_has_pro := public.benza_is_pro(v_user_id);
  if p_year is not null and (p_year<1000 or p_year>9999) then raise exception 'Enter a four-digit bullion year'; end if;
  if length(coalesce(p_purity,''))>80 or length(coalesce(p_mint,''))>120 or length(coalesce(p_serial_number,''))>120 then raise exception 'Bullion details are too long'; end if;

  if not v_has_pro and (
    p_year is not null or nullif(trim(coalesce(p_purity,'')),'') is not null or nullif(trim(coalesce(p_mint,'')),'') is not null or
    nullif(trim(coalesce(p_serial_number,'')),'') is not null or
    nullif(trim(coalesce(p_notes,'')),'') is not null or
    p_photo_path is not null or
    p_receipt_path is not null
  ) then
    raise exception 'Benza Bullion Pro is required for advanced inventory records';
  end if;

  insert into public.holdings(
    user_id,metal,product,quantity,weight_oz,total_oz,cost_basis,purchase_date,
    serial_number,notes,photo_path,receipt_path,bullion_year,purity,mint
  )
  values(
    v_user_id,p_metal,p_product,p_quantity,p_weight_oz,p_quantity*p_weight_oz,p_cost_basis,p_purchase_date,
    nullif(trim(p_serial_number),''),nullif(trim(p_notes),''),p_photo_path,p_receipt_path,p_year,nullif(trim(p_purity),''),nullif(trim(p_mint),'')
  )
  returning * into v_holding;

  insert into public.transactions(
    user_id,type,holding_id,metal,product,quantity,weight_oz,total_oz,amount,transaction_date
  )
  values(
    v_user_id,'buy',v_holding.id,v_holding.metal,v_holding.product,v_holding.quantity,
    v_holding.weight_oz,v_holding.total_oz,v_holding.cost_basis,coalesce(v_holding.purchase_date,current_date)
  );

  return v_holding;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.benza_update_holding_atomic(p_holding_id uuid, p_metal text, p_product text, p_quantity numeric, p_weight_oz numeric, p_cost_basis numeric, p_purchase_date date DEFAULT NULL::date, p_serial_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_photo_path text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text)
 RETURNS holdings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_holding public.holdings;
  v_has_pro boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  -- Attachment references must stay inside the authenticated owner's inventory folder.
  if p_photo_path is not null and left(p_photo_path, length(v_user_id::text || '/inventory/')) <> v_user_id::text || '/inventory/' then
    raise exception 'Invalid photo path';
  end if;
  if p_receipt_path is not null and left(p_receipt_path, length(v_user_id::text || '/inventory/')) <> v_user_id::text || '/inventory/' then
    raise exception 'Invalid receipt path';
  end if;

  v_has_pro := public.benza_is_pro(v_user_id);

  if not v_has_pro and (
    nullif(trim(coalesce(p_serial_number,'')),'') is not null or
    nullif(trim(coalesce(p_notes,'')),'') is not null or
    p_photo_path is not null or
    p_receipt_path is not null
  ) then
    raise exception 'Benza Bullion Pro is required for advanced inventory records';
  end if;

  if not v_has_pro and exists(select 1 from public.holdings where id=p_holding_id and user_id=v_user_id and (bullion_year is not null or purity is not null or mint is not null or serial_number is not null or notes is not null or photo_path is not null or receipt_path is not null or cardinality(scanner_photo_paths)>0)) then
    raise exception 'Renew Pro to edit this holding while keeping inventory records';
  end if;
  update public.holdings
  set metal=p_metal,
      product=p_product,
      quantity=p_quantity,
      weight_oz=p_weight_oz,
      total_oz=p_quantity*p_weight_oz,
      cost_basis=p_cost_basis,
      purchase_date=p_purchase_date,
      serial_number=nullif(trim(p_serial_number),''),
      notes=nullif(trim(p_notes),''),
      photo_path=p_photo_path,
      receipt_path=p_receipt_path
  where id=p_holding_id and user_id=v_user_id
  returning * into v_holding;

  if v_holding.id is null then raise exception 'Holding not found'; end if;

  insert into public.transactions(
    user_id,type,holding_id,metal,product,quantity,weight_oz,total_oz,amount,transaction_date
  )
  values(
    v_user_id,'update',v_holding.id,v_holding.metal,v_holding.product,v_holding.quantity,
    v_holding.weight_oz,v_holding.total_oz,v_holding.cost_basis,current_date
  );

  return v_holding;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.benza_update_holding_details(p_holding_id uuid, p_metal text, p_product text, p_quantity numeric, p_weight_oz numeric, p_cost_basis numeric, p_purchase_date date DEFAULT NULL::date, p_serial_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_photo_path text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text, p_year integer DEFAULT NULL::integer, p_purity text DEFAULT NULL::text, p_mint text DEFAULT NULL::text)
 RETURNS holdings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_holding public.holdings;
  v_has_pro boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  -- Attachment references must stay inside the authenticated owner's inventory folder.
  if p_photo_path is not null and left(p_photo_path, length(v_user_id::text || '/inventory/')) <> v_user_id::text || '/inventory/' then
    raise exception 'Invalid photo path';
  end if;
  if p_receipt_path is not null and left(p_receipt_path, length(v_user_id::text || '/inventory/')) <> v_user_id::text || '/inventory/' then
    raise exception 'Invalid receipt path';
  end if;

  v_has_pro := public.benza_is_pro(v_user_id);
  if p_year is not null and (p_year<1000 or p_year>9999) then raise exception 'Enter a four-digit bullion year'; end if;
  if length(coalesce(p_purity,''))>80 or length(coalesce(p_mint,''))>120 or length(coalesce(p_serial_number,''))>120 then raise exception 'Bullion details are too long'; end if;

  if not v_has_pro and (
    p_year is not null or nullif(trim(coalesce(p_purity,'')),'') is not null or nullif(trim(coalesce(p_mint,'')),'') is not null or
    nullif(trim(coalesce(p_serial_number,'')),'') is not null or
    nullif(trim(coalesce(p_notes,'')),'') is not null or
    p_photo_path is not null or
    p_receipt_path is not null
  ) then
    raise exception 'Benza Bullion Pro is required for advanced inventory records';
  end if;

  update public.holdings
  set metal=p_metal,
      product=p_product,
      quantity=p_quantity,
      weight_oz=p_weight_oz,
      total_oz=p_quantity*p_weight_oz,
      cost_basis=p_cost_basis,
      purchase_date=p_purchase_date,
      serial_number=case when v_has_pro then nullif(trim(p_serial_number),'') else serial_number end,
      notes=case when v_has_pro then nullif(trim(p_notes),'') else notes end,
      photo_path=case when v_has_pro then p_photo_path else photo_path end,
      receipt_path=case when v_has_pro then p_receipt_path else receipt_path end,
      bullion_year=case when v_has_pro then p_year else bullion_year end,
      purity=case when v_has_pro then nullif(trim(p_purity),'') else purity end,
      mint=case when v_has_pro then nullif(trim(p_mint),'') else mint end
  where id=p_holding_id and user_id=v_user_id
  returning * into v_holding;

  if v_holding.id is null then raise exception 'Holding not found'; end if;

  insert into public.transactions(
    user_id,type,holding_id,metal,product,quantity,weight_oz,total_oz,amount,transaction_date
  )
  values(
    v_user_id,'update',v_holding.id,v_holding.metal,v_holding.product,v_holding.quantity,
    v_holding.weight_oz,v_holding.total_oz,v_holding.cost_basis,current_date
  );

  return v_holding;
end;
$function$
;
