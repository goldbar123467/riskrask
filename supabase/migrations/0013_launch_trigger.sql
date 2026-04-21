-- Migration 0013: when rooms.state flips INTO 'active', invoke the
-- launch-game edge function asynchronously via pg_net.
--
-- The URL and service_role key live in Vault (see §2.3 of the build
-- guide):
--   vault.create_secret('<project_url>',       'project_url',       ...)
--   vault.create_secret('<service_role_key>',  'service_role_key',  ...)
--
-- pg_net executes the HTTP call out-of-band; the triggering transaction
-- is NOT blocked on it. A failure to dispatch does not roll back the
-- state change (there is no retry queue in v1; the tick will AI-advance
-- a stuck game eventually, and an operator can re-call launch-game).

create or replace function public.invoke_launch_game()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  if new.state = 'active' and (old.state is distinct from 'active') then
    select decrypted_secret into v_url
      from vault.decrypted_secrets
     where name = 'project_url';

    select decrypted_secret into v_key
      from vault.decrypted_secrets
     where name = 'service_role_key';

    if v_url is null or v_key is null then
      raise warning 'invoke_launch_game: vault secrets project_url/service_role_key not set; skipping HTTP dispatch';
      return new;
    end if;

    perform net.http_post(
      url     := v_url || '/functions/v1/launch-game',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object('room_id', new.id)
    );
  end if;
  return new;
end $$;

drop trigger if exists rooms_invoke_launch on rooms;
create trigger rooms_invoke_launch
  after update of state on rooms
  for each row execute function public.invoke_launch_game();
