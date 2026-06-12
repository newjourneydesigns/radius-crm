-- Track CCB profile status on roster/profile caches so inactive profiles do
-- not render from stale cached roster rows.

alter table public.circle_roster_cache
  add column if not exists status text,
  add column if not exists status_id text,
  add column if not exists is_active boolean;

alter table public.ccb_individual_profiles
  add column if not exists status text,
  add column if not exists status_id text,
  add column if not exists is_active boolean;

create index if not exists idx_circle_roster_cache_active_leader
  on public.circle_roster_cache (circle_leader_id, ccb_group_id, is_active);

create index if not exists idx_ccb_individual_profiles_active
  on public.ccb_individual_profiles (is_active);

comment on column public.circle_roster_cache.status is 'CCB individual profile status text captured during roster sync.';
comment on column public.circle_roster_cache.status_id is 'CCB individual profile status id captured during roster sync.';
comment on column public.circle_roster_cache.is_active is 'True only when CCB does not mark this roster member/profile inactive.';
comment on column public.ccb_individual_profiles.status is 'CCB individual profile status text.';
comment on column public.ccb_individual_profiles.status_id is 'CCB individual profile status id.';
comment on column public.ccb_individual_profiles.is_active is 'True only when CCB does not mark this profile inactive.';
