import type { GameLogLine } from "./types";

/*
 * Analyse des journaux du jeu : reconnaît les pannes courantes et les traduit en explication
 * claire avec des pistes de solution. Les règles sont testées dans l'ordre ; la première qui
 * correspond l'emporte, donc les plus précises sont placées en premier.
 */

export interface CrashReport {
  title: string;
  explanation: string;
  suggestions: string[];
  /// Ligne du journal qui a permis le diagnostic.
  evidence: string | null;
  /// Faux si aucune cause connue n'a été reconnue.
  recognized: boolean;
}

interface Rule {
  pattern: RegExp;
  title: string;
  explain: (match: RegExpMatchArray) => string;
  suggestions: string[];
}

const RULES: Rule[] = [
  {
    pattern: /Failed to encode packet 'serverbound\/minecraft:hello'/i,
    title: "Connexion au serveur impossible : compte invalide",
    explain: () =>
      "Le jeu n'arrive pas à envoyer ton identité au serveur. Le pseudo ou l'identifiant du compte est invalide.",
    suggestions: [
      "Vérifie que ton pseudo fait 16 caractères maximum, avec uniquement des lettres, chiffres et « _ ».",
      "Recrée ton compte depuis la page Compte.",
      "Si le problème persiste, désactive les mods qui touchent au réseau ou à la connexion.",
    ],
  },
  {
    pattern: /duplicate (\w+) classes found on classpath/i,
    title: "Bibliothèque en double (problème du launcher)",
    explain: (m) =>
      `Le jeu a trouvé deux versions de la bibliothèque « ${m[1]} » en même temps. Ça vient de la façon dont le launcher prépare le jeu, pas de tes mods ni de ton ordinateur.`,
    suggestions: [
      "Mets le launcher à jour : ce problème est corrigé dans les versions récentes.",
      "Relance ensuite l'instance, sans rien changer à tes mods.",
    ],
  },
  {
    pattern: /java\.lang\.OutOfMemoryError|Could not reserve enough space|There is insufficient memory for the Java Runtime/i,
    title: "Pas assez de mémoire (RAM)",
    explain: () => "Minecraft a manqué de mémoire et s'est arrêté.",
    suggestions: [
      "Augmente la RAM max de l'instance (4096 Mo ou plus pour un jeu moddé).",
      "Ferme les autres applications gourmandes avant de lancer le jeu.",
      "Si le démarrage échoue tout de suite, la RAM max dépasse peut-être celle de ta machine : baisse-la.",
    ],
  },
  {
    pattern: /UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime/i,
    title: "Mauvaise version de Java",
    explain: () => "Cette version de Minecraft ou un de ses mods a besoin d'une version de Java plus récente.",
    suggestions: [
      "Relance le jeu : le launcher télécharge le Java adapté à la version de Minecraft.",
      "Retire les arguments JVM personnalisés qui forceraient un autre Java.",
    ],
  },
  {
    pattern: /Mod '([^']+)' \(([\w-]+)\)[^\n]*requires[^\n]*? of (?:mod )?'?([\w .-]+?)'?(?: \([\w-]+\))?,? (?:which|but)/i,
    title: "Dépendance de mod manquante",
    explain: (m) => `Le mod « ${m[1].trim()} » a besoin de « ${m[3].trim()} », qui est absent ou dans une mauvaise version.`,
    suggestions: [
      "Installe la dépendance indiquée depuis l'onglet Explorer (le launcher installe désormais les dépendances automatiquement).",
      "Vérifie que les versions des mods correspondent à la version de Minecraft de l'instance.",
    ],
  },
  {
    pattern: /Incompatible mods? found|Mod resolution encountered an incompatible mod set|Could not find required mod|requires .* which is missing/i,
    title: "Mods incompatibles ou dépendance manquante",
    explain: () => "Le chargeur de mods a refusé de démarrer : un mod manque ou n'est pas compatible avec les autres.",
    suggestions: [
      "Ouvre la console : les lignes après « Incompatible mods found » nomment le mod en cause.",
      "Utilise « Tout mettre à jour » sur l'instance.",
      "Désactive les mods ajoutés récemment, un par un, pour trouver le fautif.",
    ],
  },
  {
    pattern: /Duplicate mod|DuplicateModsFoundException|Found duplicate mods/i,
    title: "Mod installé en double",
    explain: () => "Le même mod est présent deux fois dans le dossier « mods ».",
    suggestions: ["Supprime le doublon dans le contenu installé de l'instance (garde la version la plus récente)."],
  },
  {
    pattern: /Mixin apply (?:for mod ([\w-]+) )?failed|MixinApplyError|mixin\.injection\.throwables|[Mm]ixin[^\n]*(?:failed|error)[^\n]*from mod ([\w-]+)/i,
    title: "Un mod est incompatible avec cette version",
    explain: (m) => {
      const mod = m[1] ?? m[2];
      return mod
        ? `Le mod « ${mod} » n'a pas pu modifier le jeu : il n'est pas compatible avec cette version ou avec un autre mod.`
        : "Un mod n'a pas pu modifier le jeu : il n'est pas compatible avec cette version ou avec un autre mod.";
    },
    suggestions: [
      "Mets ce mod à jour, ou désactive-le depuis le contenu installé de l'instance.",
      "S'il est à jour, il est peut-être en conflit avec un autre mod : désactive-les un par un.",
    ],
  },
  {
    pattern: /java\.lang\.(?:NoClassDefFoundError|ClassNotFoundException): ([\w./$]+)/,
    title: "Composant manquant",
    explain: (m) => `Le jeu cherche un composant introuvable (« ${m[1]} »). Il manque en général une bibliothèque dont un mod a besoin.`,
    suggestions: [
      "Installe les dépendances des mods (Fabric API, Architectury, Cloth Config...).",
      "Vérifie que chaque mod correspond bien au loader de l'instance (Fabric, Quilt...).",
    ],
  },
  {
    pattern: /GLFW error 65542|Pixel format not accelerated|does not appear to support OpenGL|Failed to create.*OpenGL|EXCEPTION_ACCESS_VIOLATION.*(?:nvoglv|atio6axx|ig\w+icd)/i,
    title: "Problème de carte graphique",
    explain: () => "Le jeu n'a pas pu utiliser la carte graphique (OpenGL indisponible ou pilote en panne).",
    suggestions: [
      "Mets à jour les pilotes de ta carte graphique (NVIDIA, AMD ou Intel).",
      "Sur un portable, force l'utilisation de la carte graphique dédiée pour Java.",
      "Retire les shaders et mods graphiques pour tester.",
    ],
  },
  {
    pattern: /Invalid session|Failed to (?:verify username|log in)|Invalid credentials|401 Unauthorized/i,
    title: "Session expirée",
    explain: () => "Le serveur d'authentification a refusé ta session.",
    suggestions: [
      "Ce serveur demande un compte Minecraft officiel : un compte créé dans le launcher ne peut pas y entrer.",
    ],
  },
  {
    pattern: /java\.net\.(?:UnknownHostException|ConnectException|SocketTimeoutException)|Connection (?:refused|timed out)/i,
    title: "Problème de réseau",
    explain: () => "Le jeu n'a pas réussi à joindre un serveur.",
    suggestions: [
      "Vérifie ta connexion internet et l'adresse du serveur.",
      "Le serveur est peut-être hors ligne : regarde son statut dans l'onglet Multi.",
      "Un pare-feu ou un antivirus peut bloquer Java.",
    ],
  },
  {
    pattern: /Failed to load (?:level|world)|Exception reading .*level\.dat|Corrupt/i,
    title: "Monde illisible",
    explain: () => "Le jeu n'a pas pu charger un monde : son fichier de sauvegarde semble abîmé.",
    suggestions: [
      "Essaie de restaurer « level.dat_old » à la place de « level.dat » dans le dossier du monde.",
      "Si le monde vient d'une version plus récente du jeu, il ne peut pas être ouvert dans une plus ancienne.",
    ],
  },
];

/// Cherche une cause connue dans les journaux. `exitCode` affine le message quand rien n'est reconnu.
export function analyzeLogs(logs: GameLogLine[], exitCode: number | null = null): CrashReport {
  // On parcourt de la fin vers le début : la cause d'un crash est en général dans les dernières lignes.
  for (const rule of RULES) {
    for (let i = logs.length - 1; i >= 0; i--) {
      const match = logs[i].line.match(rule.pattern);
      if (match) {
        return {
          title: rule.title,
          explanation: rule.explain(match),
          suggestions: rule.suggestions,
          evidence: logs[i].line.trim().slice(0, 300),
          recognized: true,
        };
      }
    }
  }

  const lastError = [...logs].reverse().find((l) => /Exception|Error|FATAL/.test(l.line));
  // 0xC0000005 / 0xC0000409 : plantage natif sous Windows, presque toujours un pilote.
  const nativeCrash = exitCode === -1073741819 || exitCode === -1073740791;
  return {
    title: nativeCrash ? "Plantage du jeu (pilote ou composant natif)" : "Le jeu s'est arrêté de façon inattendue",
    explanation: nativeCrash
      ? "Le jeu a été interrompu brutalement par Windows, souvent à cause d'un pilote graphique ou d'un mod natif."
      : "Aucune cause connue n'a été reconnue dans les journaux.",
    suggestions: nativeCrash
      ? ["Mets à jour les pilotes de ta carte graphique.", "Retire les shaders et les mods de performance pour tester."]
      : [
          "Ouvre la console pour lire les dernières lignes.",
          "Si tu as ajouté des mods récemment, désactive-les un par un.",
          "Relance le jeu : certaines erreurs sont passagères.",
        ],
    evidence: lastError ? lastError.line.trim().slice(0, 300) : null,
    recognized: false,
  };
}
