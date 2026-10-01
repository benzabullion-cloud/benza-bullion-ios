-- Run against a compatible test database. Every synthetic record is rolled back.
begin;
set local statement_timeout='10s';
do $$
declare
 v_user uuid:=gen_random_uuid(); v_other uuid:=gen_random_uuid();
 v_h public.holdings; v_restored public.holdings; v_sale jsonb; v_paths text[];
begin
 insert into auth.users(id,aud,role,email) values
 (v_user,'authenticated','authenticated','sweep-'||v_user::text||'@example.invalid'),
 (v_other,'authenticated','authenticated','sweep-'||v_other::text||'@example.invalid');
 insert into public.user_entitlements(user_id,tier,status) values(v_user,'pro','active'),(v_other,'pro','active');
 perform set_config('request.jwt.claim.sub',v_user::text,true);
 v_paths:=array[v_user::text||'/inventory/sweep/front.jpg',v_user::text||'/inventory/sweep/back.jpg'];
 v_h:=public.benza_add_holding_details('silver','Canadian Silver Maple Leaf',2,1,100,null,'SWEEP','Private fixture',null,null,2026,'.9999','Royal Canadian Mint');
 update public.holdings set scanner_photo_paths=v_paths where id=v_h.id;

 -- Partial sale keeps the existing inventory record intact.
 v_sale:=public.benza_sell_holding_atomic(v_h.id,1,60,current_date);
 perform public.benza_undo_sale_atomic((v_sale->>'sale_id')::uuid);
 select * into v_restored from public.holdings where id=v_h.id;
 if v_restored.quantity<>2 or v_restored.cost_basis<>100 or v_restored.bullion_year is distinct from 2026 or v_restored.scanner_photo_paths is distinct from v_paths then raise exception 'Partial sale restore regression'; end if;

 -- A full sale removes the row; undo must restore every optional field.
 v_sale:=public.benza_sell_holding_atomic(v_h.id,2,120,current_date);
 if exists(select 1 from public.holdings where id=v_h.id) then raise exception 'Full sale fixture not removed'; end if;
 perform set_config('request.jwt.claim.sub',v_other::text,true);
 begin
  perform public.benza_undo_sale_atomic((v_sale->>'sale_id')::uuid);
  raise exception 'Wrong account was able to undo a sale';
 exception when others then
  if sqlerrm<>'Sale not found' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub',v_user::text,true);
 perform public.benza_undo_sale_atomic((v_sale->>'sale_id')::uuid);
 select * into v_restored from public.holdings where id=v_h.id;
 if v_restored.id is null or v_restored.quantity<>2 or v_restored.cost_basis<>100 or
    v_restored.bullion_year is distinct from 2026 or v_restored.purity is distinct from '.9999' or
    v_restored.mint is distinct from 'Royal Canadian Mint' or v_restored.serial_number is distinct from 'SWEEP' or
    v_restored.notes is distinct from 'Private fixture' or v_restored.scanner_photo_paths is distinct from v_paths then raise exception 'Full sale lost inventory details'; end if;

 -- Legacy/blank optional metadata stays optional, without an array-extraction error.
 v_sale:=public.benza_sell_holding_atomic(v_h.id,2,120,current_date);
 update public.transactions set holding_snapshot=holding_snapshot-'scanner_photo_paths'-'bullion_year'-'purity'-'mint' where id=(v_sale->>'sale_id')::uuid;
 perform public.benza_undo_sale_atomic((v_sale->>'sale_id')::uuid);
 select * into v_restored from public.holdings where id=v_h.id;
 if v_restored.bullion_year is not null or v_restored.purity is not null or v_restored.mint is not null or cardinality(v_restored.scanner_photo_paths)<>0 then raise exception 'Legacy empty details regression'; end if;
end $$;
rollback;
select 'PASS partial/full sale undo, optional metadata, scanner photos, cross-account rejection and legacy empty metadata; all fixtures rolled back' as result;
