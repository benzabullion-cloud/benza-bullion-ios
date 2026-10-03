-- Preserve advanced records server-side when Free accounts edit basic holding fields.
-- Apply before shipping the corresponding app update.
CREATE OR REPLACE FUNCTION public.benza_update_holding_details(p_holding_id uuid, p_metal text, p_product text, p_quantity numeric, p_weight_oz numeric, p_cost_basis numeric, p_purchase_date date DEFAULT NULL::date, p_serial_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_photo_path text DEFAULT NULL::text, p_receipt_path text DEFAULT NULL::text, p_year integer DEFAULT NULL, p_purity text DEFAULT NULL, p_mint text DEFAULT NULL)
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
$function$;
revoke all on function public.benza_update_holding_details(uuid,text,text,numeric,numeric,numeric,date,text,text,text,text,integer,text,text) from public,anon;
grant execute on function public.benza_update_holding_details(uuid,text,text,numeric,numeric,numeric,date,text,text,text,text,integer,text,text) to authenticated;
