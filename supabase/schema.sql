-- =============================================================================
--  Ebook — Schéma Supabase complet
--  À coller dans Supabase > SQL Editor > New query, puis « Run ».
--  Le script peut être relancé sans danger (idempotent autant que possible).
-- =============================================================================

-- Extension utilisée pour retirer les accents lors de la normalisation des titres
create extension if not exists unaccent with schema extensions;


-- -----------------------------------------------------------------------------
-- 1. Fonction de normalisation : « Les Misérables » -> « les miserables »
--    Sert à regrouper les avis d'un même livre entre utilisateurs.
-- -----------------------------------------------------------------------------
create or replace function public.normaliser_texte(t text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;


-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- Catalogue commun : une ligne par couple (titre, auteur) normalisé.
-- Ne contient aucune donnée personnelle : seulement un titre et un auteur.
create table if not exists public.catalogue (
  id               uuid primary key default gen_random_uuid(),
  titre            text not null,
  auteur           text not null default '',
  titre_normalise  text not null,
  auteur_normalise text not null default '',
  created_at       timestamptz not null default now(),
  unique (titre_normalise, auteur_normalise)
);

-- Livres : privés, propres à chaque utilisateur.
create table if not exists public.books (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  catalogue_id  uuid references public.catalogue (id) on delete set null,
  titre         text not null check (char_length(titre) between 1 and 200),
  auteur        text not null default '' check (char_length(auteur) <= 200),
  type          text not null default 'roman' check (type in ('roman', 'theatre', 'autre')),
  langue        text not null default 'fr' check (langue in ('fr', 'en')),
  derniere_page integer not null default 1 check (derniere_page >= 1), -- marque-page
  created_at    timestamptz not null default now()
);
create index if not exists books_user_id_idx on public.books (user_id);
create index if not exists books_catalogue_id_idx on public.books (catalogue_id);

-- Pages : texte d'une page photographiée.
create table if not exists public.pages (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references public.books (id) on delete cascade,
  numero     integer not null check (numero >= 1),
  texte      text not null default '' check (char_length(texte) <= 20000),
  created_at timestamptz not null default now(),
  unique (book_id, numero)
);

-- Avis : publics, rattachés au catalogue (commun) et au livre de l'auteur de l'avis.
create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  book_id        uuid not null references public.books (id) on delete cascade,
  catalogue_id   uuid not null references public.catalogue (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  auteur_affiche text not null check (char_length(auteur_affiche) between 1 and 40), -- pseudo
  note           smallint not null check (note between 1 and 5),
  resume         text not null default '' check (char_length(resume) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  unique (user_id, catalogue_id), -- un seul avis par utilisateur et par livre
  unique (user_id, book_id)
);
create index if not exists reviews_catalogue_id_idx on public.reviews (catalogue_id);


-- -----------------------------------------------------------------------------
-- 3. Déclencheurs
-- -----------------------------------------------------------------------------

-- 3a. À chaque création / modification du titre ou de l'auteur d'un livre,
--     on le relie automatiquement à la bonne ligne du catalogue (créée si besoin).
create or replace function public.lier_catalogue()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_titre  text;
  v_auteur text;
  v_id     uuid;
begin
  new.titre  := trim(new.titre);
  new.auteur := trim(coalesce(new.auteur, ''));
  v_titre  := public.normaliser_texte(new.titre);
  v_auteur := public.normaliser_texte(new.auteur);

  if v_titre = '' then
    raise exception 'Titre invalide';
  end if;

  insert into public.catalogue (titre, auteur, titre_normalise, auteur_normalise)
  values (new.titre, new.auteur, v_titre, v_auteur)
  on conflict (titre_normalise, auteur_normalise) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.catalogue
    where titre_normalise = v_titre and auteur_normalise = v_auteur;
  end if;

  new.catalogue_id := v_id;
  return new;
end;
$$;

drop trigger if exists books_lier_catalogue on public.books;
create trigger books_lier_catalogue
  before insert or update of titre, auteur on public.books
  for each row execute function public.lier_catalogue();

-- 3b. Avant d'enregistrer un avis : on vérifie que le livre appartient bien à
--     l'auteur de l'avis et on recopie son catalogue_id (impossible à falsifier).
create or replace function public.preparer_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogue uuid;
begin
  if tg_op = 'UPDATE' then
    new.user_id    := old.user_id;     -- l'auteur ne change jamais
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  select catalogue_id into v_catalogue
  from public.books
  where id = new.book_id and user_id = new.user_id;

  if v_catalogue is null then
    raise exception 'Ce livre ne fait pas partie de ta bibliothèque';
  end if;

  new.catalogue_id   := v_catalogue;
  new.auteur_affiche := trim(new.auteur_affiche);
  new.resume         := trim(new.resume);
  return new;
end;
$$;

drop trigger if exists reviews_preparer on public.reviews;
create trigger reviews_preparer
  before insert or update on public.reviews
  for each row execute function public.preparer_review();


-- -----------------------------------------------------------------------------
-- 4. Sécurité : Row Level Security (RLS)
-- -----------------------------------------------------------------------------
alter table public.catalogue enable row level security;
alter table public.books     enable row level security;
alter table public.pages     enable row level security;
alter table public.reviews   enable row level security;

-- Droits de base (les politiques RLS ci-dessous filtrent ensuite ligne par ligne)
revoke all on public.books, public.pages from anon;
grant select                         on public.catalogue to anon, authenticated;
grant select, insert, update, delete on public.books     to authenticated;
grant select, insert, update, delete on public.pages     to authenticated;
grant select                         on public.reviews   to anon, authenticated;
grant insert, update, delete         on public.reviews   to authenticated;

-- Catalogue : lecture publique. Écriture uniquement via le déclencheur.
drop policy if exists "catalogue_lecture_publique" on public.catalogue;
create policy "catalogue_lecture_publique" on public.catalogue
  for select to anon, authenticated using (true);

-- Livres : uniquement le propriétaire
drop policy if exists "books_lecture_proprietaire" on public.books;
create policy "books_lecture_proprietaire" on public.books
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "books_creation_proprietaire" on public.books;
create policy "books_creation_proprietaire" on public.books
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "books_modification_proprietaire" on public.books;
create policy "books_modification_proprietaire" on public.books
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "books_suppression_proprietaire" on public.books;
create policy "books_suppression_proprietaire" on public.books
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Pages : uniquement le propriétaire du livre
drop policy if exists "pages_lecture_proprietaire" on public.pages;
create policy "pages_lecture_proprietaire" on public.pages
  for select to authenticated using (
    exists (select 1 from public.books b where b.id = pages.book_id and b.user_id = (select auth.uid()))
  );

drop policy if exists "pages_creation_proprietaire" on public.pages;
create policy "pages_creation_proprietaire" on public.pages
  for insert to authenticated with check (
    exists (select 1 from public.books b where b.id = pages.book_id and b.user_id = (select auth.uid()))
  );

drop policy if exists "pages_modification_proprietaire" on public.pages;
create policy "pages_modification_proprietaire" on public.pages
  for update to authenticated
  using (
    exists (select 1 from public.books b where b.id = pages.book_id and b.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.books b where b.id = pages.book_id and b.user_id = (select auth.uid()))
  );

drop policy if exists "pages_suppression_proprietaire" on public.pages;
create policy "pages_suppression_proprietaire" on public.pages
  for delete to authenticated using (
    exists (select 1 from public.books b where b.id = pages.book_id and b.user_id = (select auth.uid()))
  );

-- Avis : lecture par tout le monde (même les visiteurs non connectés)
drop policy if exists "reviews_lecture_publique" on public.reviews;
create policy "reviews_lecture_publique" on public.reviews
  for select to anon, authenticated using (true);

-- Avis : création / modification / suppression uniquement par leur auteur
drop policy if exists "reviews_creation_auteur" on public.reviews;
create policy "reviews_creation_auteur" on public.reviews
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.books b where b.id = reviews.book_id and b.user_id = (select auth.uid()))
  );

drop policy if exists "reviews_modification_auteur" on public.reviews;
create policy "reviews_modification_auteur" on public.reviews
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "reviews_suppression_auteur" on public.reviews;
create policy "reviews_suppression_auteur" on public.reviews
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Fin du script ✔
