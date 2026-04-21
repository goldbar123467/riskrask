-- Migration 0014: schedule a 5-second heartbeat that calls the tick
-- edge function. tick handles:
--   1. post_game -> countdown -> active/lobby cycle transitions
--   2. AI takeover for seats whose phase_timer expired or whose human
--      occupant marked left_at
--   3. zombie-room cleanup
--
-- pg_cron 1.4+ (ships with Supabase PG 15) accepts the 'N seconds'
-- shorthand in cron.schedule. If the job already exists we unschedule
-- it first so this migration is rerunnable.

-- Remove any existing schedule with the same name (noop on first run).
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'riskrask-tick';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'riskrask-tick',
  '5 seconds',
  $CRON$
  select net.http_post(
    url := (
      select decrypted_secret
        from vault.decrypted_secrets
       where name = 'project_url'
    ) || '/functions/v1/tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'service_role_key'
      )
    ),
    body := jsonb_build_object('ts', extract(epoch from now()))
  );
  $CRON$
);
