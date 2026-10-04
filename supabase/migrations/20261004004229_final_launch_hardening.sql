-- Purchase families have one permanent account owner. Tombstones survive account
-- deletion so an unbound legacy receipt cannot silently move to another account.
create table public.benza_purchase_ownership (
 original_transaction_id text primary key,
 user_id uuid references auth.users(id) on delete set null,
 product_id text not null,
 signed_at timestamptz not null,
 expires_at timestamptz,
 status text not null check(status in ('active','trial','grace','expired','revoked')),
 environment text check(environment in ('Production','Sandbox')),
 updated_at timestamptz not null default now()
);
alter table public.benza_purchase_ownership enable row level security;
revoke all on public.benza_purchase_ownership from anon, authenticated;
grant all on public.benza_purchase_ownership to service_role;
-- Preserve existing, unambiguous receipt ownership without guessing if duplicated.
insert into public.benza_purchase_ownership(original_transaction_id,user_id,product_id,signed_at,expires_at,status,environment)
select original_transaction_id,user_id,product_id,'-infinity'::timestamptz,expires_at,
 case when status='revoked' then 'revoked' when tier='pro' and status in ('active','trial','grace') then status else 'expired' end,null
from public.user_entitlements e where original_transaction_id is not null and product_id is not null
and (select count(*) from public.user_entitlements x where x.original_transaction_id=e.original_transaction_id)=1;

create function public.benza_apply_apple_entitlement(p_user_id uuid,p_original_transaction_id text,p_product_id text,p_signed_at timestamptz,p_expires_at timestamptz,p_status text,p_environment text,p_account_token uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner public.benza_purchase_ownership; v_best public.benza_purchase_ownership; v_result public.user_entitlements;
begin
 if p_original_transaction_id is null or p_original_transaction_id='' or p_signed_at is null or p_signed_at>now()+interval '5 minutes' then raise exception 'Invalid Apple transaction'; end if;
 if p_product_id not in ('benza_pro_monthly','benza_pro_annual','benza_pro_founder_lifetime') then raise exception 'Unknown product'; end if;
 if p_product_id<>'benza_pro_founder_lifetime' and p_expires_at is null then raise exception 'Subscription expiry required'; end if;
 if p_status not in ('active','trial','grace','expired','revoked') or p_environment not in ('Production','Sandbox') then raise exception 'Invalid Apple status'; end if;
 -- Serialize both family ownership and this account's aggregate entitlement.
 perform pg_advisory_xact_lock(hashtextextended(p_original_transaction_id,0));
 select * into v_owner from public.benza_purchase_ownership where original_transaction_id=p_original_transaction_id for update;
 if v_owner.original_transaction_id is null then
   if p_user_id is null or p_account_token is distinct from p_user_id then raise exception 'Purchase must be linked to this account. Contact support for a legacy restore'; end if;
 else
   if v_owner.user_id is null or v_owner.user_id is distinct from p_user_id then raise exception 'Purchase belongs to another account'; end if;
   if p_account_token is not null and p_account_token is distinct from p_user_id then raise exception 'Purchase belongs to another account'; end if;
   if p_signed_at<=v_owner.signed_at then
     select * into v_result from public.user_entitlements where user_id=p_user_id;
     return to_jsonb(v_result);
   end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
 insert into public.benza_purchase_ownership(original_transaction_id,user_id,product_id,signed_at,expires_at,status,environment)
 values(p_original_transaction_id,p_user_id,p_product_id,p_signed_at,p_expires_at,p_status,p_environment)
 on conflict(original_transaction_id) do update set product_id=excluded.product_id,signed_at=excluded.signed_at,expires_at=excluded.expires_at,status=excluded.status,environment=excluded.environment,updated_at=now();
 select * into v_best from public.benza_purchase_ownership where user_id=p_user_id and status in ('active','trial','grace') and (product_id='benza_pro_founder_lifetime' or expires_at>now())
 order by (product_id='benza_pro_founder_lifetime') desc,expires_at desc nulls last limit 1;
 insert into public.user_entitlements(user_id,tier,status,product_id,original_transaction_id,expires_at,trial_ends_at,last_verified_at,updated_at)
 values(p_user_id,case when v_best.user_id is null then 'free' else 'pro' end,coalesce(v_best.status,'inactive'),coalesce(v_best.product_id,p_product_id),coalesce(v_best.original_transaction_id,p_original_transaction_id),v_best.expires_at,case when v_best.status='trial' then v_best.expires_at end,now(),now())
 on conflict(user_id) do update set tier=excluded.tier,status=excluded.status,product_id=excluded.product_id,original_transaction_id=excluded.original_transaction_id,expires_at=excluded.expires_at,trial_ends_at=excluded.trial_ends_at,last_verified_at=excluded.last_verified_at,updated_at=now()
 returning * into v_result;
 return to_jsonb(v_result);
end $$;
revoke execute on function public.benza_apply_apple_entitlement(uuid,text,text,timestamptz,timestamptz,text,text,uuid) from public,anon,authenticated;
grant execute on function public.benza_apply_apple_entitlement(uuid,text,text,timestamptz,timestamptz,text,text,uuid) to service_role;

create table public.benza_file_cleanup (
 path text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 queued_at timestamptz not null default now(), attempts integer not null default 0
);
alter table public.benza_file_cleanup enable row level security;
revoke all on public.benza_file_cleanup from anon,authenticated;
grant all on public.benza_file_cleanup to service_role;
create function public.benza_queue_file_cleanup(p_paths text[]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_path text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if cardinality(p_paths)>50 then raise exception 'Too many cleanup paths'; end if;
 foreach v_path in array coalesce(p_paths,array[]::text[]) loop
  if v_path is null or length(v_path)>1024 or split_part(v_path,'/',1)<>v_user::text or split_part(v_path,'/',2)<>'inventory' then raise exception 'Invalid private file owner'; end if;
  insert into public.benza_file_cleanup(path,user_id) values(v_path,v_user) on conflict do nothing;
 end loop;
end $$;
revoke execute on function public.benza_queue_file_cleanup(text[]) from public,anon;
grant execute on function public.benza_queue_file_cleanup(text[]) to authenticated;
create function public.benza_track_file_cleanup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_path text;
begin
 foreach v_path in array array_remove(array[old.photo_path,old.receipt_path]||coalesce(old.scanner_photo_paths,array[]::text[]),null) loop
  if tg_op='DELETE' or not(v_path=any(array_remove(array[new.photo_path,new.receipt_path]||coalesce(new.scanner_photo_paths,array[]::text[]),null))) then
   insert into public.benza_file_cleanup(path,user_id) values(v_path,old.user_id) on conflict do nothing;
  end if;
 end loop;
 return old;
end $$;
revoke execute on function public.benza_track_file_cleanup() from public,anon,authenticated;
create trigger benza_holdings_file_cleanup after delete or update of photo_path,receipt_path,scanner_photo_paths on public.holdings for each row execute function public.benza_track_file_cleanup();
-- Only the worker may discover old, unreferenced upload objects. Never alter
-- storage.objects directly; delete actual bytes through the Storage API.
create function public.benza_file_is_referenced(p_path text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.holdings h where h.photo_path=p_path or h.receipt_path=p_path or p_path=any(h.scanner_photo_paths))
 or exists(select 1 from public.transactions t where t.type='sell' and not exists(select 1 from public.transactions removed where removed.user_id=t.user_id and removed.holding_id=t.holding_id and removed.type='remove' and removed.created_at>t.created_at) and (t.holding_snapshot->>'photo_path'=p_path or t.holding_snapshot->>'receipt_path'=p_path or coalesce(t.holding_snapshot->'scanner_photo_paths','[]'::jsonb) ? p_path))
$$;
revoke execute on function public.benza_file_is_referenced(text) from public,anon,authenticated;
grant execute on function public.benza_file_is_referenced(text) to service_role;
create function public.benza_discover_orphan_files() returns void language sql security definer set search_path=public,storage,pg_temp as $$
 insert into public.benza_file_cleanup(path,user_id)
 select o.name,u.id from storage.objects o join auth.users u on u.id::text=split_part(o.name,'/',1)
 where o.bucket_id='holding-documents' and split_part(o.name,'/',2)='inventory' and o.created_at<now()-interval '24 hours'
 and not exists(select 1 from public.benza_file_cleanup q where q.path=o.name)
 and not public.benza_file_is_referenced(o.name)
 order by o.created_at limit 200 on conflict do nothing
$$;
revoke execute on function public.benza_discover_orphan_files() from public,anon,authenticated;
grant execute on function public.benza_discover_orphan_files() to service_role;

-- Grace expires at Apple's verified grace-period deadline, just like other plans.
create or replace function public.benza_is_pro(p_user_id uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.user_entitlements e where e.user_id=p_user_id and e.tier='pro' and e.status in ('active','trial','grace') and (e.expires_at is null or e.expires_at>now()))
$$;
revoke execute on function public.benza_is_pro(uuid) from public,anon,authenticated;
create or replace function public.benza_current_user_is_pro() returns boolean language sql stable set search_path=public,pg_temp as $$
 select exists(select 1 from public.user_entitlements e where e.user_id=auth.uid() and e.tier='pro' and e.status in ('active','trial','grace') and (e.expires_at is null or e.expires_at>now()))
$$;
