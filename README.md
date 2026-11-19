# Nexora Craft

Launcher Minecraft pour Windows, rapide et agréable : instances, mods en un clic, partage avec les
amis, et un compte Nexora pour retrouver ses skins et ses amis. Fait avec [Tauri](https://tauri.app)
(Rust) et React.

## Ce que fait le launcher

- **Instances** : Vanilla, Fabric, Quilt, Forge et NeoForge, avec Java téléchargé automatiquement.
  Mémoire, arguments JVM, icône et bannière par instance. Duplication, changement de version et de loader.
- **Explorer** : mods, shaders, packs de textures et modpacks depuis Modrinth, avec leurs dépendances.
  Mises à jour des contenus en un clic. Import depuis CurseForge et par glisser-déposer.
- **Mondes** : sauvegardes et restauration en un clic ; sauvegarde automatique avant un changement de version.
- **Partage** : par code Nexora, ou export `.mrpack` lisible par Modrinth, Prism et les autres launchers.
- **Multi** : jouer avec des amis sans ouvrir de port (tunnel playit.gg), serveurs favoris avec état en direct.
- **Compte** : connexion Microsoft, skins (garde-robe, galerie), amis et présence.
- **Confort** : diagnostic des plantages (règles locales + analyse par IA), galerie de captures, thèmes,
  musique d'ambiance, palette de commandes (`Ctrl + K`), mises à jour automatiques signées.

## Développer

Prérequis : [Node.js](https://nodejs.org) 22, [Rust](https://rustup.rs) et les
[prérequis Tauri pour Windows](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev      # lance le launcher en développement
npm run build          # typecheck + compilation de l'interface
cd src-tauri && cargo test
```

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/` | Interface React : pages (`routes/`), composants, stores zustand, appels au backend (`lib/api.ts`) |
| `src-tauri/src/` | Backend Rust : lancement du jeu, instances, contenus, sauvegardes, comptes, mises à jour |
| `supabase/` | Fonction d'analyse de plantage et modèles d'emails du compte Nexora |
| `relay/` | Même relais d'analyse en serveur Node, utilisable à la place de la fonction Supabase |
| `nexora-content/` | Mods, packs et shaders fournis avec le launcher |
| `.github/workflows/` | `ci.yml` (vérifications) et `release.yml` (publication) |

## Publier une version

1. Monter la version dans `package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml` (la même partout).
2. Commit, puis pousser un tag : `git tag v0.1.8 && git push origin main v0.1.8`.
3. Le workflow `Release` compile l'installateur, le signe et crée la release GitHub avec `latest.json`.
   Les launchers installés proposent alors la mise à jour au prochain démarrage.

Le workflow a besoin des secrets de dépôt `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## Vie privée

Le launcher n'embarque aucune clé d'API. Les journaux envoyés à l'analyse IA sont anonymisés (pseudo, adresses IP,
chemins). Les statistiques d'usage sont anonymes (un identifiant aléatoire et la version) et se désactivent dans les
réglages. La clé secrète de « Jouer ensemble » est gardée dans le coffre d'identifiants de Windows.
