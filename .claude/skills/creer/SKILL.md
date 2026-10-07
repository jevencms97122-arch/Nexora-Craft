---
name: creer
description: Publie une nouvelle version de Nexora Craft. Monte le numéro de version, vérifie que l'app compile, envoie le code sur GitHub et pousse le tag qui déclenche la compilation de l'installateur et la release (mise à jour automatique des launchers installés). À utiliser quand l'utilisateur tape /creer.
disable-model-invocation: true
argument-hint: "[patch|minor|major|X.Y.Z]"
---

# /creer : publier une nouvelle version

Cette commande publie pour de vrai : elle pousse sur GitHub et les launchers des joueurs se mettront
à jour. Elle n'est lancée que par l'utilisateur (`/creer`), jamais de ta propre initiative.

La compilation de l'installateur se fait **sur GitHub**, pas en local : le workflow
`.github/workflows/release.yml` se déclenche sur un tag `vX.Y.Z`, compile pour Windows, signe la mise
à jour et crée la release. Ton rôle est de tout préparer et de pousser le tag.

Argument (`$ARGUMENTS`) : `patch` (défaut, 0.1.0 → 0.1.1), `minor`, `major`, ou une version exacte
comme `1.2.0`.

## Étapes

Arrête-toi à la première étape qui échoue et explique le problème. Ne force jamais (`--force`,
`--no-verify`) et ne supprime jamais un tag déjà poussé.

1. **État du dépôt.** `git status --short` et `git branch --show-current`. La branche doit être
   `main`. S'il y a des fichiers non suivis qui ressemblent à des secrets (`.env`, `*.key`,
   contenu commençant par `nvapi-`), ne les ajoute pas et signale-les. Vérifie avec
   `git diff` et `git status` qu'aucune clé n'est sur le point d'être envoyée : la clé de signature
   (`~/.tauri/nexora-craft-v2.key`) et `relay/.env` ne doivent jamais être dans le dépôt.

2. **Choisir la version.** Lance
   `node .claude/skills/creer/bump-version.mjs <argument> --dry` pour connaître la nouvelle version
   sans rien modifier. Vérifie que le tag n'existe pas déjà : `git tag -l vX.Y.Z` et
   `git ls-remote --tags origin vX.Y.Z` doivent être vides.

3. **Vérifier que tout compile**, avant de toucher à la version :
   - `npm run build` (TypeScript + interface)
   - `cargo check` puis `cargo test` dans `src-tauri/`
   Si l'un échoue, corrige seulement si la cause est évidente et petite ; sinon arrête-toi et
   montre l'erreur. Ne publie jamais une version qui ne compile pas.

4. **Monter la version.** `node .claude/skills/creer/bump-version.mjs <argument>` (sans `--dry`),
   puis `cargo check` dans `src-tauri/` pour mettre `Cargo.lock` à jour.

5. **Commit.** `git add -A`, relis `git status --short` une dernière fois, puis un commit dont le
   message commence par `vX.Y.Z` suivi d'un résumé en français des changements depuis le dernier
   tag (`git log <dernier tag>..HEAD --oneline` et `git diff --stat` pour t'en faire une idée).
   Termine le message par la ligne d'attribution indiquée par l'environnement, s'il y en a une.

6. **Pousser.** `git push origin main`, puis `git tag vX.Y.Z` et `git push origin vX.Y.Z`.
   C'est ce dernier push qui lance la compilation sur GitHub.

7. **Suivre la compilation.** Le dépôt est public, donc l'état du workflow se lit sans
   authentification :
   `curl -s "https://api.github.com/repos/jevencms97122-arch/Nexora-Craft/actions/runs?per_page=1"`
   (champs `status` et `conclusion` du premier élément). La compilation prend une dizaine de
   minutes : vérifie une ou deux fois, sans boucler. Si elle échoue, donne le lien du run
   (`html_url`) et la cause la plus probable. L'échec le plus courant est le secret
   `TAURI_SIGNING_PRIVATE_KEY` manquant dans les réglages du dépôt.

## Compte rendu

Termine par un message court en français, pour quelqu'un qui n'est pas développeur :
- la version publiée ;
- ce qu'elle contient, en deux ou trois points ;
- l'état de la compilation (terminée, en cours, échouée) avec le lien
  `https://github.com/jevencms97122-arch/Nexora-Craft/actions` ;
- le lien de la release : `https://github.com/jevencms97122-arch/Nexora-Craft/releases/latest`.

Dis clairement ce qui n'est pas confirmé : tant que la compilation GitHub n'est pas terminée avec
succès, la version n'est pas encore disponible pour les joueurs.
