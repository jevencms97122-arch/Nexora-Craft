// Monte la version du launcher aux endroits où elle est déclarée, et affiche la nouvelle.
//
// Usage : node bump-version.mjs [patch|minor|major|X.Y.Z] [--dry]
//   patch (défaut) : 0.1.0 -> 0.1.1     minor : 0.1.0 -> 0.2.0     major : 0.1.0 -> 1.0.0
//   --dry : affiche la version qui serait choisie, sans rien modifier.
//
// Fichiers mis à jour : package.json, package-lock.json, src-tauri/tauri.conf.json,
// src-tauri/Cargo.toml. (Cargo.lock est régénéré par `cargo check`.)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const target = args.find((a) => !a.startsWith("--")) ?? "patch";

const read = (path) => readFileSync(resolve(root, path), "utf8");
const write = (path, content) => writeFileSync(resolve(root, path), content);

const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
const current = conf.version;
const parts = current.split(".").map(Number);
if (parts.length !== 3 || parts.some(Number.isNaN)) {
  console.error(`Version actuelle illisible : « ${current} ».`);
  process.exit(1);
}

let next;
if (/^\d+\.\d+\.\d+$/.test(target)) next = target;
else if (target === "major") next = `${parts[0] + 1}.0.0`;
else if (target === "minor") next = `${parts[0]}.${parts[1] + 1}.0`;
else if (target === "patch") next = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
else {
  console.error(`Argument inconnu : « ${target} ». Attendu : patch, minor, major ou X.Y.Z.`);
  process.exit(1);
}

// Une release ne peut pas reculer : les launchers installés ignoreraient la mise à jour.
const newer = next.split(".").map(Number);
const isNewer = newer[0] !== parts[0] ? newer[0] > parts[0] : newer[1] !== parts[1] ? newer[1] > parts[1] : newer[2] > parts[2];
if (!isNewer) {
  console.error(`La version ${next} n'est pas plus récente que la version actuelle ${current}.`);
  process.exit(1);
}

if (dry) {
  console.log(next);
  process.exit(0);
}

conf.version = next;
write("src-tauri/tauri.conf.json", JSON.stringify(conf, null, 2) + "\n");

const pkg = JSON.parse(read("package.json"));
pkg.version = next;
write("package.json", JSON.stringify(pkg, null, 2) + "\n");

const lock = JSON.parse(read("package-lock.json"));
lock.version = next;
if (lock.packages?.[""]) lock.packages[""].version = next;
write("package-lock.json", JSON.stringify(lock, null, 2) + "\n");

// Dans Cargo.toml, seule la première ligne « version = » (celle du paquet) est concernée.
const cargo = read("src-tauri/Cargo.toml");
const updated = cargo.replace(/^version = "[^"]*"/m, `version = "${next}"`);
if (updated === cargo) {
  console.error("Ligne de version introuvable dans src-tauri/Cargo.toml.");
  process.exit(1);
}
write("src-tauri/Cargo.toml", updated);

console.log(next);
