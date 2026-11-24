alter table public.community_posts
  drop constraint community_posts_metal_check,
  drop constraint community_posts_item_type_check,
  add constraint community_posts_kind_check check (
    (metal = 'bullion' and item_type = 'Discussion') or
    (metal in ('gold','silver','platinum','palladium','copper') and item_type in ('Coin','Round','Bar','Display'))
  );
alter policy community_mod_review on public.community_posts to authenticated
using (benza_community_private.is_moderator())
with check (
  benza_community_private.is_moderator() and
  (status<>'approved' or (published_at is not null and (item_type = 'Discussion' or exists(select 1 from storage.objects where bucket_id='bullion-community' and name=public_photo_path))))
);
alter policy community_photo_upload on storage.objects to authenticated with check (
  bucket_id='bullion-community' and exists(select 1 from public.community_posts p where p.photo_path=name and p.author_id=auth.uid() and p.status='pending' and p.item_type <> 'Discussion')
);
alter policy community_published_photo_upload on storage.objects to authenticated with check (
  bucket_id='bullion-community' and benza_community_private.is_moderator()
  and exists(select 1 from public.community_posts p where p.public_photo_path=name and p.status='pending' and p.item_type <> 'Discussion')
);
