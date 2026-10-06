-- Itération 19 : rôle COMEV (comité événements) autorisé sur users.role.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in (
  'admin','equipe_technique','pasteur','missionnaire','berger',
  'leader','ouvrier','disciple','membre','comev'
));
