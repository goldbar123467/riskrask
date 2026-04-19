-- Migration 0002: generate_save_code() function + auto-fill trigger

-- =============================================================
-- generate_save_code()
-- Generates a unique 8-character save code from the 31-char
-- Crockford alphabet (excludes 0, O, 1, I, L).
-- Retries up to 10 times on collision before raising.
-- =============================================================
create or replace function generate_save_code()
returns text
language plpgsql volatile
as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  attempt  text;
  tries    int := 0;
begin
  loop
    attempt := '';
    for i in 1..8 loop
      attempt := attempt || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    if not exists (select 1 from saves where code = attempt) then
      return attempt;
    end if;

    tries := tries + 1;
    if tries > 10 then
      raise exception 'could not generate unique save code after 10 attempts';
    end if;
  end loop;
end $$;

-- =============================================================
-- generate_room_code()
-- Same logic but produces a 6-character room invite code.
-- =============================================================
create or replace function generate_room_code()
returns text
language plpgsql volatile
as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  attempt  text;
  tries    int := 0;
begin
  loop
    attempt := '';
    for i in 1..6 loop
      attempt := attempt || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    if not exists (select 1 from rooms where code = attempt) then
      return attempt;
    end if;

    tries := tries + 1;
    if tries > 10 then
      raise exception 'could not generate unique room code after 10 attempts';
    end if;
  end loop;
end $$;

-- =============================================================
-- Trigger: auto-fill saves.code on INSERT when NULL
-- =============================================================
create or replace function saves_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    new.code := generate_save_code();
  end if;
  return new;
end $$;

create trigger saves_auto_code
  before insert on saves
  for each row
  when (new.code is null)
  execute function saves_before_insert();

-- =============================================================
-- Trigger: auto-fill rooms.code on INSERT when NULL
-- =============================================================
create or replace function rooms_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    new.code := generate_room_code();
  end if;
  return new;
end $$;

create trigger rooms_auto_code
  before insert on rooms
  for each row
  when (new.code is null)
  execute function rooms_before_insert();
