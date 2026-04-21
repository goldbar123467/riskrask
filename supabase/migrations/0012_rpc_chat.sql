-- Migration 0012: chat RPC + per-user rate limit.
--
-- The RLS INSERT policy from 0008 already blocks non-members. This RPC
-- adds:
--   - length validation (1..500)
--   - per-user/per-room rate limit (<= 5 msgs in the last 10s)
-- Rate limiting in the RPC (rather than a trigger) keeps the error
-- surface small and deterministic for the client.

create or replace function public.send_chat(
  p_room_id uuid,
  p_text    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_recent int;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;
  if p_text is null or length(p_text) not between 1 and 500 then
    raise exception 'text length must be 1..500' using errcode = '22023';
  end if;
  if not public.is_room_member(p_room_id) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  select count(*) into v_recent
    from room_messages
   where room_id = p_room_id
     and user_id = v_uid
     and created_at > now() - interval '10 seconds';

  if v_recent >= 5 then
    raise exception 'rate limit (max 5 msgs per 10s)' using errcode = '54000';
  end if;

  insert into room_messages (room_id, user_id, text)
  values (p_room_id, v_uid, p_text);
end $$;

revoke all on function public.send_chat(uuid, text) from public;
grant execute on function public.send_chat(uuid, text) to authenticated;
