# Prompt pour la session Claude qui gère le serveur Nexora-SMP

> Copie tout ce qui suit (à partir de « Contexte ») dans la session qui administre le serveur Minecraft.

---

## Contexte

Le launcher **Nexora Craft** (app Windows, Tauri) a un nouvel onglet **SMP** qui affiche, pour le serveur
**Nexora-SMP** (`nexora-smp.duckdns.org:25565`) :

- un **classement des joueurs** (temps de jeu, kills, morts, blocs minés…) ;
- les **joueurs connectés**, le **TPS**, la version, le jour du monde ;
- un **fil d'activité** (connexions, morts, progrès) ;
- des **infos** : annonce, règles, liens (carte, Discord, vote…).

Le launcher **ne parle pas directement au serveur Minecraft**. Il lit une base **Supabase** (projet
**Nexora-SMP**, id `vmaketngbwbuscynjkac`, URL `https://vmaketngbwbuscynjkac.supabase.co`). Ton rôle : **faire
écrire dans cette base, régulièrement, les données du serveur**. Le launcher se charge du reste.

Le statut en ligne / nombre de joueurs / latence est déjà obtenu par le launcher via le ping Minecraft
standard : tu n'as rien à faire pour ça.

## Ce que tu dois faire

1. **Créer les tables** ci-dessous (SQL à exécuter dans l'éditeur SQL de Supabase, ou via une migration).
2. **Écrire un petit programme côté serveur** (plugin Paper/Spigot, mod Fabric, ou script qui lit les
   fichiers `world/stats/*.json` et `world/advancements/*.json`) qui pousse les données toutes les
   **30 à 60 secondes** pour le statut et **toutes les 5 minutes** pour les statistiques.
3. **N'utiliser la clé `service_role` que sur le serveur**, jamais dans le launcher, jamais dans un dépôt Git,
   jamais dans un message. Elle se met dans une variable d'environnement ou un fichier de config du serveur
   non versionné. Le launcher n'a **que** le droit de lire (clé publique).

## SQL à exécuter

```sql
-- Lecture publique, écriture réservée au serveur (clé service_role, qui contourne la RLS).

create table public.smp_status (
  id int primary key default 1 check (id = 1),          -- une seule ligne
  online_players jsonb not null default '[]'::jsonb,    -- [{"uuid":"...","username":"..."}]
  max_players int,
  tps numeric(4,1),
  world_day int,
  version text,
  updated_at timestamptz not null default now()
);

create table public.smp_stats (
  uuid uuid not null,
  username text not null,
  stat text not null,
  value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (uuid, stat)
);
create index smp_stats_ranking on public.smp_stats (stat, value desc);

create table public.smp_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('join','leave','death','advancement','chat')),
  username text,
  message text not null check (char_length(message) <= 200),
  created_at timestamptz not null default now()
);
create index smp_events_recent on public.smp_events (created_at desc);

create table public.smp_info (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.smp_status enable row level security;
alter table public.smp_stats  enable row level security;
alter table public.smp_events enable row level security;
alter table public.smp_info   enable row level security;

create policy "smp status is public" on public.smp_status for select to anon, authenticated using (true);
create policy "smp stats are public" on public.smp_stats  for select to anon, authenticated using (true);
create policy "smp events are public" on public.smp_events for select to anon, authenticated using (true);
create policy "smp info is public"   on public.smp_info   for select to anon, authenticated using (true);

-- Ne garde que les 200 derniers événements (à planifier avec pg_cron, ou à faire depuis le serveur).
-- delete from public.smp_events where id not in (select id from public.smp_events order by created_at desc limit 200);
```

(Aucune policy d'écriture : seul `service_role` peut écrire. Ne pas en ajouter pour `anon`.)

## Format exact des données

### `smp_status` — une seule ligne, `id = 1` (upsert toutes les 30–60 s)

| colonne | type | exemple |
|---|---|---|
| `online_players` | jsonb | `[{"uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5","username":"Notch"}]` |
| `max_players` | int | `20` |
| `tps` | numeric | `19.8` (TPS moyen sur 1 min, plafonné à 20) |
| `world_day` | int | `142` (jours écoulés du monde principal) |
| `version` | text | `1.21.11` |
| `updated_at` | timestamptz | `now()` à chaque envoi |

Le launcher considère les données **périmées au bout de 5 minutes** (`updated_at`) et masque alors TPS et
joueurs connectés. Donc : si le serveur s'arrête, ne rien envoyer suffit.

### `smp_stats` — une ligne par (joueur, statistique) (upsert toutes les 5 min)

`uuid` = UUID Minecraft **avec tirets**. `username` = pseudo actuel. Une ligne par joueur et par `stat`.
Les clés `stat` que le launcher **connaît** (toute autre clé est ignorée) :

| `stat` | valeur | source dans `world/stats/<uuid>.json` |
|---|---|---|
| `playtime_seconds` | secondes de jeu | `minecraft:custom` → `minecraft:play_time` ÷ 20 (ticks → s) |
| `mobs_killed` | nombre | `minecraft:custom` → `minecraft:mob_kills` |
| `player_kills` | nombre | `minecraft:custom` → `minecraft:player_kills` |
| `deaths` | nombre | `minecraft:custom` → `minecraft:deaths` |
| `blocks_mined` | nombre | somme de `minecraft:mined` |
| `blocks_placed` | nombre | somme de `minecraft:used` sur les items-blocs (ou via le plugin) |
| `distance_m` | mètres | somme des `minecraft:*_one_cm` (walk, sprint, swim, fly…) ÷ 100 |
| `advancements` | nombre | nombre de progrès terminés (`world/advancements/<uuid>.json`, `done: true`, hors `recipes/`) |
| `balance` | entier | solde d'économie si un plugin d'économie existe (sinon ne pas l'envoyer) |

Le launcher n'affiche un onglet de classement que pour les `stat` **présentes en base**. Tu n'es donc pas
obligé de tout fournir : commence par `playtime_seconds`, `deaths`, `mobs_killed`, `blocks_mined`.
Il affiche le **top 25** par valeur décroissante. Ne publie que les joueurs ayant déjà joué (pas de ligne à 0
pour des UUID inconnus).

### `smp_events` — fil d'activité (insert à chaque événement)

| colonne | exemple |
|---|---|
| `kind` | `join`, `leave`, `death`, `advancement` (ou `chat`) |
| `username` | `Notch` |
| `message` | texte **déjà rédigé en français, ≤ 200 caractères**, affiché tel quel |

Exemples : `Notch a rejoint le serveur`, `Notch est mort noyé`, `Notch a obtenu le progrès « Diamants ! »`.
Ne mets **jamais** de coordonnées, d'adresse IP, ni de contenu de chat privé. Le chat public est facultatif :
ne l'envoie que si les joueurs sont prévenus.

### `smp_info` — clé / valeur jsonb, modifié à la main de temps en temps

| `key` | `value` (jsonb) |
|---|---|
| `announcement` | `"Événement ce samedi à 20h !"` (texte simple, une seule annonce) |
| `rules` | `["Pas de grief","Respect des autres","Pas de triche"]` |
| `links` | `{"map":"https://…","discord":"https://discord.gg/…","rules":"https://…","vote":"https://…","wiki":"https://…"}` |

Les liens doivent commencer par `https://` (ou `http://`) pour être affichés. Clés de `links` reconnues :
`map`, `discord`, `rules`, `vote`, `wiki` (toutes facultatives).

## Exemple d'envoi (HTTP, côté serveur)

```
POST https://vmaketngbwbuscynjkac.supabase.co/rest/v1/smp_status?on_conflict=id
apikey: <SERVICE_ROLE_KEY>
Authorization: Bearer <SERVICE_ROLE_KEY>
Content-Type: application/json
Prefer: resolution=merge-duplicates

{"id":1,"online_players":[{"uuid":"…","username":"Notch"}],"max_players":20,"tps":19.8,"world_day":142,"version":"1.21.11","updated_at":"2026-10-14T18:00:00Z"}
```

```
POST https://vmaketngbwbuscynjkac.supabase.co/rest/v1/smp_stats?on_conflict=uuid,stat
(mêmes en-têtes) — corps : un tableau d'objets {"uuid","username","stat","value","updated_at"}
```

```
POST https://vmaketngbwbuscynjkac.supabase.co/rest/v1/smp_events      (insert simple)
{"kind":"death","username":"Notch","message":"Notch est mort noyé"}
```

## Ce que tu me rends à la fin

1. Confirmation que les 4 tables existent et que la RLS est active (lecture seule publique).
2. Quelles `stat` tu publies réellement, et la fréquence d'envoi.
3. Un exemple de ligne réelle de chaque table.
4. **Rien d'autre à faire côté launcher** : il se met à jour tout seul dès que les tables se remplissent.

## Interdits

- Ne jamais écrire la clé `service_role` dans le launcher, dans un dépôt, dans un log ou dans un message.
- Ne pas ajouter de policy d'écriture pour `anon` ou `authenticated`.
- Ne pas publier d'adresses IP, de coordonnées ni de données privées de joueurs.

---

## Complément : skins des joueurs (table `smp_players`)

**Problème.** Le serveur est en mode hors-ligne : les UUID des joueurs ne sont pas des comptes Mojang. Les
sites de rendu (mc-heads, crafatar…) ne peuvent donc pas retrouver leur skin et renvoient tous Steve. Seul le
serveur (SkinsRestorer / JuxSkins) sait quel skin chaque joueur porte. Le launcher a besoin que le serveur le
publie.

**À faire.** Créer cette table et la remplir pour chaque joueur qui a un skin :

```sql
create table public.smp_players (
  uuid uuid primary key,
  username text not null,
  skin_url text,                                   -- URL https publique d'un PNG 64x64 (ou 64x32)
  skin_model text not null default 'classic' check (skin_model in ('classic','slim')),
  updated_at timestamptz not null default now()
);
alter table public.smp_players enable row level security;
create policy "smp players are public" on public.smp_players for select to anon, authenticated using (true);
-- Aucune policy d'écriture : seul service_role écrit.
```

- `uuid` : le même UUID (avec tirets) que dans `smp_stats` et `smp_status`.
- `skin_url` : l'adresse **directe d'un fichier PNG** du skin, lisible sans connexion.
  - Skin Mojang/Microsoft récupéré par SkinsRestorer : décoder la propriété `textures` (base64 → JSON) et
    prendre `textures.SKIN.url` (adresse `https://textures.minecraft.net/texture/...`).
  - Skin personnalisé (envoyé par le joueur) : le téléverser dans un bucket **public** Supabase Storage
    (ex. `smp-skins/<uuid>.png`) et donner l'URL publique
    `https://vmaketngbwbuscynjkac.supabase.co/storage/v1/object/public/smp-skins/<uuid>.png`.
- `skin_model` : `slim` pour les bras fins (Alex), `classic` sinon.
- Mettre à jour la ligne **à la connexion du joueur** et à chaque changement de skin (pas besoin de boucle
  régulière). Une seule ligne par joueur.
- Si un joueur n'a pas de skin connu, ne pas créer de ligne (le launcher affichera Steve).

Le launcher lit `smp_players` pour les joueurs visibles (classement, connectés) et affiche leur vraie tête et
leur personnage en 3D. Tant que la table est vide ou absente, il se rabat sur Steve sans erreur.

Rends-moi : le SQL appliqué, d'où vient `skin_url` pour chaque type de skin, et un exemple de ligne réelle.

---

## Complément : masquer un joueur de l'onglet SMP

**Besoin.** Depuis le tableau de bord Supabase, pouvoir masquer un joueur : il ne doit apparaître **nulle part** dans
l'onglet SMP du launcher (classement, connectés, profil, skin, journal d'activité). Le masquage doit être
appliqué **dans la base** (pas seulement dans le launcher), pour que les données du joueur ne soient pas lisibles
par l'API publique non plus.

```sql
-- Joueurs masqués : on n'y met que le pseudo. Table illisible pour anon/authenticated (RLS sans policy).
create table public.smp_hidden (username text primary key);
create unique index smp_hidden_lower on public.smp_hidden (lower(username));
alter table public.smp_hidden enable row level security;

-- Fonctions qui lisent la table à la place des visiteurs (security definer).
create function public.smp_is_hidden(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.smp_hidden h where lower(h.username) = lower(n));
$$;

create function public.smp_mentions_hidden(msg text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.smp_hidden h where position(lower(h.username) in lower(msg)) > 0);
$$;

grant execute on function public.smp_is_hidden(text), public.smp_mentions_hidden(text) to anon, authenticated;

-- Les policies de lecture excluent les joueurs masqués.
drop policy "smp stats are public"   on public.smp_stats;
drop policy "smp players are public" on public.smp_players;
drop policy "smp events are public"  on public.smp_events;

create policy "smp stats are public" on public.smp_stats
  for select to anon, authenticated using (not public.smp_is_hidden(username));
create policy "smp players are public" on public.smp_players
  for select to anon, authenticated using (not public.smp_is_hidden(username));
create policy "smp events are public" on public.smp_events
  for select to anon, authenticated
  using ((username is null or not public.smp_is_hidden(username)) and not public.smp_mentions_hidden(message));

-- smp_status contient la liste des connectés (jsonb) : le launcher la lit via cette fonction.
create function public.smp_status_public() returns setof public.smp_status
language sql stable security definer set search_path = public as $$
  select s.id,
         coalesce((select jsonb_agg(p) from jsonb_array_elements(s.online_players) p
                   where not public.smp_is_hidden(p->>'username')), '[]'::jsonb),
         s.max_players, s.tps, s.world_day, s.version, s.updated_at
  from public.smp_status s where s.id = 1;
$$;
grant execute on function public.smp_status_public() to anon, authenticated;
```

(Si une policy porte un autre nom que ceux ci-dessus, utiliser le nom réel dans les `drop policy`.
Vérifier l'ordre des colonnes de `smp_status` : `id, online_players, max_players, tps, world_day, version, updated_at`.)

**Utilisation.** Tableau de bord Supabase → Table Editor → `smp_hidden` → Insert row → saisir le pseudo
(majuscules sans importance). Pour ré-afficher le joueur : supprimer la ligne. Effet immédiat.

**Vérification demandée.** Masquer un pseudo de test, puis, avec la clé publique (anon) :
`smp_stats`, `smp_players`, `smp_events` et `rpc/smp_status_public` ne doivent plus contenir ce pseudo, ni
un événement dont le message le cite. Rends-moi le résultat de ce test, puis ré-affiche le joueur.
