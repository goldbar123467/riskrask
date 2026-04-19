-- Migration 0004: Helper RPC functions for edge functions
-- These are called by Supabase edge functions via the service role.

-- =============================================================
-- create_save_with_expiry()
-- Inserts a new save row, letting the trigger assign the code.
-- Returns the generated code and expires_at.
-- anonymous saves (p_owner_id IS NULL): expires in 30 days.
-- owner-linked saves (p_owner_id NOT NULL): never expire.
-- =============================================================
create or replace function create_save_with_expiry(
  p_state_json     jsonb,
  p_schema_version int,
  p_owner_id       uuid default null
)
returns table (code text, expires_at timestamptz)
language plpgsql volatile
security definer
as $$
declare
  v_expires_at timestamptz;
  v_code       text;
begin
  -- Anonymous saves expire after 30 days; owner saves are permanent.
  if p_owner_id is null then
    v_expires_at := now() + interval '30 days';
  else
    v_expires_at := null;
  end if;

  insert into saves (state_json, schema_version, owner_id, expires_at)
  values (p_state_json, p_schema_version, p_owner_id, v_expires_at)
  returning saves.code into v_code;

  return query select v_code, v_expires_at;
end $$;
