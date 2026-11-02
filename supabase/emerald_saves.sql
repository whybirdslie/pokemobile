create table if not exists public.emerald_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sav bytea not null,
  sha256 text not null,
  updated_at timestamptz not null default now()
);

alter table public.emerald_saves enable row level security;

create policy "own save"
  on public.emerald_saves
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
