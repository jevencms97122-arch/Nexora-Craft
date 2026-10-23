# Contenu Nexora

Les fichiers placés ici sont **embarqués dans le launcher** et apparaissent dans l'onglet
**Explorer → Nexora**, pour tous les joueurs. Ils sont reconnus automatiquement (type, loader,
version de Minecraft) et le launcher indique dans quelles instances ils sont compatibles.

| Dossier           | Ce qu'on y met                          |
|-------------------|------------------------------------------|
| `mods/`           | fichiers `.jar` de mods                  |
| `resourcepacks/`  | packs de ressources / textures (`.zip`)  |
| `shaders/`        | packs de shaders (`.zip`)                |

Règles :
- Seuls les `.jar` et `.zip` sont pris en compte (le reste est ignoré).
- Ne mets que des fichiers dont tu as le droit de redistribuer le contenu (licence du mod / du pack).
- Chaque fichier alourdit l'installateur : garde-les raisonnables.
- Après un ajout, republie une version du launcher (`/creer`) pour que les joueurs les reçoivent.
  En développement (`npm run tauri dev`), les fichiers sont lus directement dans ce dossier.
