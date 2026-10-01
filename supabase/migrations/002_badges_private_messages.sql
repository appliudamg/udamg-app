-- Itération 18 : inscriptions liées à un compte, badges par messagerie/email, messages privés,
-- remise à zéro des séances (gestion 100 % manuelle).

alter table public.event_participants
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists registered_by uuid references public.users(id) on delete set null;
create index if not exists event_participants_user_idx on public.event_participants (evenement_id, user_id);

-- recipient_id null = diffusion à tous ; sinon message privé (ex : badge d'inscription).
alter table public.messages
  add column if not exists recipient_id uuid references public.users(id) on delete cascade;
create index if not exists messages_recipient_idx on public.messages (recipient_id);

-- Suppression de toutes les séances (pointages / compteurs enfants supprimés en cascade).
delete from public.event_sessions;

-- Lien d'action optionnel affiché dans le détail du message (ex : « Voir mon badge »).
alter table public.messages add column if not exists action_url text;
