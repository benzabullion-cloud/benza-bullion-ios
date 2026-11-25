const {PGlite}=require('@electric-sql/pglite');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
(async()=>{
 const db=new PGlite();
 await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(bucket_id text references storage.buckets,name text primary key);
  create function storage.foldername(value text) returns text[] language sql immutable as $$select string_to_array(value,'/')$$;
  alter table storage.objects enable row level security;
  grant usage on schema auth,storage to anon,authenticated;
  grant select on storage.objects to anon,authenticated;
  grant insert,delete on storage.objects to authenticated;
  insert into auth.users values ('${id(1)}'),('${id(2)}'),('${id(3)}');
 `);
 for (const migration of [
  '20261124212200_bullion_community.sql',
  '20261124234000_community_text_posts.sql',
  '20261124235100_community_profile_edits.sql',
  '20261125013000_community_comments.sql',
  '20261125140000_unique_community_display_names.sql'
 ]) await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 async function as(n){ await db.exec(`reset role; set "request.jwt.claim.sub"='${n?id(n):''}'; set role ${n?'authenticated':'anon'}`); }
 const rows=async(sql)=>(await db.query(sql)).rows;
 const count=async(table)=>Number((await rows('select count(*) as n from '+table))[0].n);
 await db.exec(`insert into community_moderators values ('${id(3)}')`);
 await as(1);
 await db.exec(`insert into community_profiles values ('${id(1)}','Collector One');
  insert into community_posts(id,author_id,metal,item_type,caption) values ('${id(10)}','${id(1)}','silver','Coin','A silver Maple Leaf');
  insert into storage.objects values ('bullion-community','${id(1)}/${id(10)}.jpg');
  insert into community_posts(id,author_id,metal,item_type,caption) values ('${id(11)}','${id(1)}','silver','Coin','Another coin');`);
 assert.equal((await rows("update community_posts set status='approved' returning id")).length,0);
 await as(0);
 assert.equal(await count('community_posts'),0);
 assert.equal(await count('storage.objects'),0);
 await as(3);
 await assert.rejects(db.exec(`update community_posts set status='approved',published_at=now() where id='${id(11)}'`));
 await db.exec(`insert into storage.objects values ('bullion-community','published/${id(1)}/${id(10)}.jpg')`);
 await db.exec(`update community_posts set status='approved',published_at=now() where id='${id(10)}'`);
 await as(0);
 assert.equal(await count('community_posts'),1);
 assert.equal(await count('storage.objects'),1);
 assert.match((await rows('select name from storage.objects'))[0].name,/^published\//);
 await as(2);
 await assert.rejects(db.exec(`insert into community_profiles(id,display_name) values ('${id(2)}','collector  one')`));
 await db.exec(`insert into community_profiles values ('${id(2)}','Collector Two');
 insert into community_follows values ('${id(2)}','${id(1)}');
 insert into community_likes values ('${id(10)}','${id(2)}');
 insert into community_reports(post_id,reporter_id,reason) values ('${id(10)}','${id(2)}','Off topic');`);
 await assert.rejects(db.exec(`insert into community_likes values ('${id(10)}','${id(2)}')`));
 assert.equal(await count('community_reports'),0);
 await db.exec(`update community_profiles set bio='I collect silver' where id='${id(2)}';
   insert into community_comments(post_id,author_id,body) values ('${id(10)}','${id(2)}','Nice coin');`);
 await db.exec(`insert into community_comment_flags(comment_id,reporter_id,reason)
   select id,'${id(2)}','Off topic' from community_comments;`);
 assert.equal(await count('community_comment_flags'),0);
 await as(0);
 assert.equal(await count('community_comments'),1);
 assert.equal((await rows(`select bio from community_profiles where id='${id(2)}'`))[0].bio,'I collect silver');
 await as(3);
 assert.equal(await count('community_reports'),1);
 assert.equal(await count('community_comment_flags'),1);
 await as(2);
 await db.exec(`insert into community_blocks values ('${id(2)}','${id(1)}')`);
 assert.equal(await count('community_posts'),0);
 assert.equal(await count('community_follows'),0);
 assert.equal(await count('community_comments'),0);
 assert.equal(await count('storage.objects'),0);
 await as(3);
 await db.exec(`update community_posts set status='removed' where id='${id(10)}'`);
 await as(0);
 assert.equal(await count('community_posts'),0);
 assert.equal(await count('storage.objects'),0);
 await db.close();
 console.log('Community RLS: pending privacy, approval, photos, likes, follows, reports, blocking and removal passed');
})().catch(e=>{console.error(e);process.exitCode=1});
