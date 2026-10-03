const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$ select current_setting('test.user_id',true)::uuid $$;
 create function public.benza_is_pro(uuid) returns boolean language sql as $$ select current_setting('test.pro',true)='true' $$;
 create table holdings(id uuid primary key,user_id uuid,metal text,product text,quantity numeric,weight_oz numeric,total_oz numeric,cost_basis numeric,purchase_date date,serial_number text,notes text,photo_path text,receipt_path text,bullion_year integer,purity text,mint text,scanner_photo_paths text[]);
 create table transactions(user_id uuid,type text,holding_id uuid,metal text,product text,quantity numeric,weight_oz numeric,total_oz numeric,amount numeric,transaction_date date);
 set test.user_id='00000000-0000-0000-0000-000000000001'; set test.pro='false';`);
 const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_preserve_pro_records_on_basic_edits.sql'));
 await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
 const canonical=fs.readFileSync('App/public/supabase_bullion_details.sql','utf8');
 const start=canonical.indexOf('CREATE OR REPLACE FUNCTION public.benza_update_holding_details');
 const end=canonical.indexOf('\n',canonical.indexOf('grant execute on function public.benza_update_holding_details',start));
 const fn=canonical.slice(start,end).trim();
 assert.ok(fs.readFileSync('supabase/migrations/'+migration,'utf8').includes(fn),'migration matches canonical function');
 const id='00000000-0000-0000-0000-000000000010';
 await db.query(`insert into holdings values ($1,'00000000-0000-0000-0000-000000000001','silver','Original',1,1,1,20,current_date,'serial','notes','private/photo','private/receipt',2020,'.999','mint',ARRAY['scan/front','scan/back'])`,[id]);
 for(const metal of ['gold','silver','platinum','palladium','copper']){
  const {rows}=await db.query(`select * from public.benza_update_holding_details($1,$2,'Updated',2,0.5,40,current_date)`,[id,metal]);
  const row=rows[0];assert.equal(row.metal,metal);assert.equal(Number(row.quantity),2);assert.equal(Number(row.total_oz),1);assert.equal(row.serial_number,'serial');assert.equal(row.notes,'notes');assert.equal(row.photo_path,'private/photo');assert.equal(row.receipt_path,'private/receipt');assert.equal(row.bullion_year,2020);assert.equal(row.purity,'.999');assert.equal(row.mint,'mint');assert.deepEqual(row.scanner_photo_paths,['scan/front','scan/back']);
 }
 await assert.rejects(db.query(`select public.benza_update_holding_details($1,'silver','Unauthorized',2,1,30,current_date,'new serial')`,[id]),/Pro is required/);
 await db.exec(`set test.user_id='00000000-0000-0000-0000-000000000002'`);
 await assert.rejects(db.query(`select public.benza_update_holding_details($1,'silver','Foreign',2,1,30)`,[id]),/Holding not found/);
 await db.exec(`set test.user_id='00000000-0000-0000-0000-000000000001';set test.pro='true'`);
 const {rows}=await db.query(`select * from public.benza_update_holding_details($1,'silver','Pro edit',3,1,60,current_date,'new serial','new notes','new photo','new receipt',2021,'.9999','new mint')`,[id]);
 assert.equal(rows[0].serial_number,'new serial');assert.equal(rows[0].bullion_year,2021);assert.equal(rows[0].photo_path,'new photo');assert.deepEqual(rows[0].scanner_photo_paths,['scan/front','scan/back']);
 await db.close();console.log('PASS Free edits preserve Pro records across five metals; unauthorized changes and foreign ownership are rejected; Pro edits remain available');
})().catch(error=>{console.error(error);process.exit(1)});
