-- UDAMG APP — Schéma Supabase (Messagerie + Media + Utilisateurs)
-- À exécuter dans Supabase → SQL Editor (une seule fois).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Utilisateurs
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nom text not null default '',
  prenom text not null default '',
  role text not null check (role in (
    'admin','equipe_technique','pasteur','missionnaire','berger',
    'leader','ouvrier','disciple','membre'
  )),
  password_hash text not null,
  is_approved boolean not null default true,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- Media (Audios)
create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null default '',
  category text not null,          -- culte_dimanche | programmes | programmes_speciaux | enseignements | reunions | podcasts | story
  subcategory text,                -- ex: UDAMG / CAMP / Autre / Convention / Réunion Pasteur / Conseil élargi
  kind text not null default 'audio' check (kind in ('audio','video')),
  audio_path text,                 -- chemin dans le bucket "media"
  cover_path text,                 -- chemin dans le bucket "covers"
  duration double precision,
  description text,
  transcript text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists media_items_category_idx on public.media_items (category, created_at desc);

create table if not exists public.favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

create table if not exists public.user_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  media_id uuid not null references public.media_items(id) on delete cascade,
  last_position_seconds double precision not null default 0,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, media_id)
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  item_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists playlists_user_idx on public.playlists (user_id, updated_at desc);

-- ---------------------------------------------------------------- Messagerie (diffusion unidirectionnelle)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.users(id) on delete set null,
  sender_name text not null default '',
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_created_idx on public.messages (created_at desc);

create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---------------------------------------------------------------- Espace Événements
create table if not exists public.villes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique
);

create table if not exists public.evenements (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  description text,
  date timestamptz not null,
  lieu text not null default '',
  ville text,
  type_evenement text not null default 'culte_special',
  intervenants text[] not null default '{}',
  image_url text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists evenements_date_idx on public.evenements (date);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  special boolean not null default false,
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  unique (evenement_id, user_id)
);

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements(id) on delete cascade,
  badge_id text not null,
  nom text not null,
  prenom text not null,
  profil text not null default 'Externe',
  categorie_age text,
  tel text,
  email text,
  eglise text,
  jours_presence text[] not null default '{}',
  referent text,
  notes text,
  sms_status text not null default 'none',
  wa_status text not null default 'none',
  created_at timestamptz not null default now(),
  unique (evenement_id, badge_id)
);
create index if not exists event_participants_evt_idx on public.event_participants (evenement_id, nom);

create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements(id) on delete cascade,
  nom text not null,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.event_pointages (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements(id) on delete cascade,
  participant_id uuid not null references public.event_participants(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  scanned_by text not null default '',
  "timestamp" timestamptz not null default now(),
  unique (evenement_id, participant_id, session_id)
);

create table if not exists public.event_enfants (
  id uuid primary key default gen_random_uuid(),
  evenement_id uuid not null references public.evenements(id) on delete cascade,
  session_id uuid not null references public.event_sessions(id) on delete cascade,
  delta integer not null,
  "by" text not null default '',
  "timestamp" timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
alter table public.villes             enable row level security;
alter table public.evenements         enable row level security;
alter table public.invitations        enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_sessions     enable row level security;
alter table public.event_pointages    enable row level security;
alter table public.event_enfants      enable row level security;
-- L'API UDAMG (FastAPI) accède aux tables avec la clé service (bypass RLS).
-- Les clés publiques (anon) n'ont AUCUN accès direct aux tables.
alter table public.users          enable row level security;
alter table public.media_items    enable row level security;
alter table public.favorites      enable row level security;
alter table public.user_progress  enable row level security;
alter table public.playlists      enable row level security;
alter table public.messages       enable row level security;
alter table public.message_reads  enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------- Storage
-- Buckets: "media" (privé, lecture via URL signée) et "covers" (public).
insert into storage.buckets (id, name, public)
values ('media', 'media', false), ('covers', 'covers', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "covers_public_read" on storage.objects;
create policy "covers_public_read" on storage.objects
  for select using (bucket_id = 'covers');

-- ---------------------------------------------------------------- Realtime (suivi de lecture)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'message_reads'
  ) then
    alter publication supabase_realtime add table public.message_reads;
  end if;
end $$;

-- ---------------------------------------------------------------- Stories (éphémères, Équipe technique)
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('image','video')),
  media_path text,
  caption text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_expires_idx on public.stories (expires_at);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
alter table public.stories     enable row level security;
alter table public.story_views enable row level security;

insert into storage.buckets (id, name, public) values ('stories', 'stories', true)
on conflict (id) do update set public = excluded.public;
drop policy if exists "stories_public_read" on storage.objects;
create policy "stories_public_read" on storage.objects for select using (bucket_id = 'stories');

-- ---------------------------------------------------------------- Itération 17 : durée/horaires événements + Pensées du jour
alter table public.evenements add column if not exists duree text;
alter table public.evenements add column if not exists horaires text;

create table if not exists public.pensees (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  texte text,
  date date not null default current_date,
  image_path text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pensees_date_idx on public.pensees (date desc);
alter table public.pensees enable row level security;
