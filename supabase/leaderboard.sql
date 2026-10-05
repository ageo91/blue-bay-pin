-- Blue Bay Pin leaderboard. Paste into Supabase > SQL Editor and run once (safe to re-run).
-- Players have no account: the game signs them in anonymously and they pick a name, shown as Name#1234.
-- Scores can only be written through submit_score(), which checks them and keeps each player's best per hole per day.

-- Players ---------------------------------------------------------------------------------------------
create table if not exists public.players (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  name       text not null check (name ~ '^[A-Za-z0-9_ ]{3,16}$'),
  tag        smallint not null default (floor(random() * 9000) + 1000)::smallint,
  hidden     boolean not null default false,          -- set true in the table editor to remove a name from the boards
  created_at timestamptz not null default now(),
  unique (name, tag)
);
alter table public.players enable row level security;

drop policy if exists "names are public" on public.players;
create policy "names are public" on public.players for select using (not hidden or user_id = auth.uid());
drop policy if exists "pick your own name" on public.players;
create policy "pick your own name" on public.players for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "rename yourself" on public.players;
create policy "rename yourself" on public.players for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- players may only set their own name, never their tag or the hidden flag
revoke insert, update on public.players from anon, authenticated;
grant insert (user_id, name) on public.players to authenticated;
grant update (name) on public.players to authenticated;

-- Words that may not appear in a name. Add more in the table editor.
create table if not exists public.banned_words (word text primary key);
alter table public.banned_words enable row level security;   -- no policies: not readable from the game
insert into public.banned_words (word) values
  ('fuck'),('shit'),('cunt'),('bitch'),('nigg'),('fag'),('whore'),('slut'),('dick'),('pussy'),('rape'),('nazi'),('hitler'),
  ('kut'),('lul'),('hoer'),('kanker'),('tering'),('tyfus'),('mongool'),('neuk'),
  ('admin'),('bluebay'),('steffen')
on conflict do nothing;

create or replace function public.check_player_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if exists (select 1 from banned_words where replace(lower(new.name), ' ', '') like '%' || word || '%') then
    raise exception 'name_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists check_player_name on public.players;
create trigger check_player_name before insert or update of name on public.players
  for each row execute function public.check_player_name();

-- Scores ----------------------------------------------------------------------------------------------
create table if not exists public.scores (
  user_id    uuid not null references public.players on delete cascade,
  hole       smallint not null check (hole between 1 and 18),
  day        date not null,                              -- Curaçao date, set by the server
  strokes    smallint not null check (strokes between 1 and 20),
  best_m     real not null check (best_m >= 0 and best_m < 700),  -- closest any shot stopped to the pin, 0 for a hole in one
  attempts   integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, hole, day)
);
alter table public.scores enable row level security;
drop policy if exists "scores are public" on public.scores;
create policy "scores are public" on public.scores for select using (true);
revoke insert, update, delete on public.scores from anon, authenticated;   -- writes only via submit_score()
create index if not exists scores_board on public.scores (hole, day, strokes, best_m);

-- Post a finished hole. Returns the player's best result today and their rank.
create or replace function public.submit_score(p_hole int, p_strokes int, p_best_m real)
returns table (strokes smallint, best_m real, rank bigint, players bigint)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/Curacao')::date;
  last_at timestamptz;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from players where user_id = uid) then raise exception 'no_name'; end if;
  if p_hole not between 1 and 18 or p_strokes not between 1 and 20 or p_best_m < 0 or p_best_m >= 700
     or (p_strokes = 1 and p_best_m <> 0) then
    raise exception 'invalid_score';
  end if;
  select max(s.updated_at) into last_at from scores s where s.user_id = uid;
  if last_at is not null and now() - last_at < interval '8 seconds' then raise exception 'too_fast'; end if;

  insert into scores as s (user_id, hole, day, strokes, best_m)
  values (uid, p_hole, today, p_strokes, round(p_best_m::numeric, 1))
  on conflict (user_id, hole, day) do update set
    attempts   = s.attempts + 1,
    updated_at = now(),
    best_m     = case when excluded.strokes < s.strokes or (excluded.strokes = s.strokes and excluded.best_m < s.best_m)
                      then excluded.best_m else s.best_m end,
    strokes    = least(s.strokes, excluded.strokes);

  return query
    select me.strokes, me.best_m,
      (select count(*) + 1 from scores o join players p using (user_id)
        where o.hole = p_hole and o.day = today and not p.hidden
          and (o.strokes < me.strokes or (o.strokes = me.strokes and o.best_m < me.best_m))),
      (select count(*) from scores o join players p using (user_id) where o.hole = p_hole and o.day = today and not p.hidden)
    from scores me where me.user_id = uid and me.hole = p_hole and me.day = today;
end $$;
revoke execute on function public.submit_score(int, int, real) from public, anon;
grant execute on function public.submit_score(int, int, real) to authenticated;

-- Today's board for one hole (anyone can read it, no sign-in needed).
create or replace function public.leaderboard(p_hole int, p_limit int default 50)
returns table (rank bigint, name text, tag smallint, strokes smallint, best_m real, is_me boolean)
language sql stable security invoker set search_path = public as $$
  select rank() over (order by s.strokes, s.best_m), p.name, p.tag, s.strokes, s.best_m, s.user_id = auth.uid()
  from scores s join players p using (user_id)
  where s.hole = p_hole and s.day = (now() at time zone 'America/Curacao')::date and not p.hidden
  order by s.strokes, s.best_m
  limit least(p_limit, 100);
$$;
grant execute on function public.leaderboard(int, int) to anon, authenticated;
