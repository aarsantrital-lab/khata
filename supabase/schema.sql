-- Khata sync schema. Run once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- Every device keeps its full ledger offline in IndexedDB. This table only relays rows
-- between devices that share the same sync code. Rows are never deleted by the app.
-- Direct table access is blocked by row level security; devices can only reach their
-- own shop's rows through the functions below, using a hash of the sync code.
-- Safe to run again after an app update: everything is "create if not exists" or "create or replace".

create table if not exists public.khata_records (
  shop_id    text   not null,
  tbl        text   not null,
  id         text   not null,
  data       jsonb  not null,
  updated_at bigint not null,
  server_seq bigint not null,
  primary key (shop_id, tbl, id)
);

create sequence if not exists public.khata_records_seq;
create index if not exists khata_records_pull on public.khata_records (shop_id, server_seq);

alter table public.khata_records enable row level security;
revoke all on public.khata_records from anon, authenticated;

create or replace function public.khata_push(p_shop text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_shop) <> 64 then
    raise exception 'invalid shop id';
  end if;

  -- One push per shop at a time, so sequence numbers commit in order and a device
  -- pulling "everything after N" can never skip a row committed late.
  perform pg_advisory_xact_lock(hashtext(p_shop));

  insert into public.khata_records as r (shop_id, tbl, id, data, updated_at, server_seq)
  select p_shop, x->>'tbl', x->>'id', x->'data', (x->>'updated_at')::bigint, nextval('public.khata_records_seq')
  from jsonb_array_elements(p_rows) as x
  on conflict (shop_id, tbl, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        server_seq = excluded.server_seq
    where r.updated_at < excluded.updated_at;
end;
$$;

create or replace function public.khata_pull(p_shop text, p_since bigint, p_limit int default 500)
returns table (tbl text, id text, data jsonb, updated_at bigint, server_seq bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.tbl, r.id, r.data, r.updated_at, r.server_seq
  from public.khata_records r
  where r.shop_id = p_shop and r.server_seq > p_since
  order by r.server_seq
  limit least(greatest(p_limit, 1), 1000);
$$;

grant execute on function public.khata_push(text, jsonb) to anon;
grant execute on function public.khata_pull(text, bigint, int) to anon;

-- Bill photos. The photo's details sync as a normal row above; the image itself is kept
-- here and only downloaded when a device opens the photo. Images are write-once.

create table if not exists public.khata_photos (
  shop_id    text        not null,
  id         text        not null,
  type       text        not null,
  data       text        not null,  -- base64 image
  bytes      int         not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, id)
);

alter table public.khata_photos enable row level security;
revoke all on public.khata_photos from anon, authenticated;

create or replace function public.khata_photo_put(p_shop text, p_id text, p_type text, p_data text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_shop) <> 64 then
    raise exception 'invalid shop id';
  end if;
  if length(p_id) > 64 then
    raise exception 'invalid photo id';
  end if;
  if p_type not in ('image/webp', 'image/jpeg', 'image/png') then
    raise exception 'photo_bad_type';
  end if;
  -- 2,000,000 base64 characters is about 1.5 MB of image. The app sends 150-400 KB.
  if length(p_data) > 2000000 then
    raise exception 'photo_too_large';
  end if;

  insert into public.khata_photos (shop_id, id, type, data, bytes)
  values (p_shop, p_id, p_type, p_data, (length(p_data) * 3) / 4)
  on conflict (shop_id, id) do nothing;
end;
$$;

create or replace function public.khata_photo_get(p_shop text, p_id text)
returns table (type text, data text)
language sql
stable
security definer
set search_path = public
as $$
  select p.type, p.data from public.khata_photos p where p.shop_id = p_shop and p.id = p_id;
$$;

grant execute on function public.khata_photo_put(text, text, text, text) to anon;
grant execute on function public.khata_photo_get(text, text) to anon;
