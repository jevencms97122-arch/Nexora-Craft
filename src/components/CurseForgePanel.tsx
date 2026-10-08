import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../lib/api";
import { toast } from "../store/toastStore";
import { useImportStore } from "../store/importStore";
import { Icon } from "./ui";

const CURSEFORGE_URL = "https://www.curseforge.com/minecraft";

const STEPS = [
  { title: "Ouvre CurseForge", text: "Le site s'ouvre dans une fenêtre du launcher." },
  { title: "Télécharge un fichier", text: "Choisis un mod, un shader ou un pack de ressources, puis clique sur Download." },
  { title: "Reviens ici", text: "Le launcher repère le fichier et te demande dans quelle instance l'installer." },
];

/// Mode CurseForge de l'onglet Explorer : le site s'ouvre dans le navigateur, et le launcher
/// surveille le dossier Téléchargements pour proposer d'installer ce qui y arrive.
export function CurseForgePanel() {
  const { watching, start, stop } = useImportStore();

  /// Dans une fenêtre du launcher ; si elle ne peut pas s'ouvrir, on retombe sur le navigateur.
  async function open() {
    start();
    try {
      await api.openCurseForge();
    } catch (e) {
      toast.error(String(e));
      openUrl(CURSEFORGE_URL);
    }
  }

  function openInBrowser() {
    start();
    openUrl(CURSEFORGE_URL);
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <section className="card p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="section-title text-lg">Installer depuis CurseForge</h2>
            <p className="text-sm text-text-muted mt-1.5 leading-relaxed max-w-xl">
              CurseForge n'autorise pas les autres launchers à récupérer tous ses fichiers directement. Tu télécharges
              donc sur leur site, et le launcher s'occupe du reste.
            </p>
          </div>
          {watching && (
            <span className="badge badge-accent h-7 px-3 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse mr-2" /> Surveillance active
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 stagger">
          {STEPS.map((step, i) => (
            <div key={step.title} className="row flex-col items-start !gap-2 !cursor-default">
              <div className="w-8 h-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center text-sm font-bold">
                {i + 1}
              </div>
              <div className="font-semibold text-sm">{step.title}</div>
              <div className="text-[11px] text-text-faint leading-relaxed">{step.text}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={open} className="btn btn-primary btn-shine h-11 px-6">
            <Icon name="external" className="w-4 h-4" /> Ouvrir CurseForge
          </button>
          <button onClick={openInBrowser} className="btn btn-secondary h-11" title="Utile si tu es déjà connecté à CurseForge dans ton navigateur">
            Dans mon navigateur
          </button>
          {watching && (
            <button onClick={stop} className="btn btn-ghost">
              Arrêter la surveillance
            </button>
          )}
        </div>
      </section>

      <div className="text-xs text-text-muted bg-panel-2 rounded-xl px-4 py-3 leading-relaxed">
        Pendant la surveillance (30 minutes au plus), le launcher regarde uniquement les nouveaux fichiers{" "}
        <span className="kbd">.jar</span> et <span className="kbd">.zip</span> de ton dossier Téléchargements. Il lit
        leur description pour savoir à quel loader et à quelle version de Minecraft ils sont destinés. Les modpacks
        CurseForge ne sont pas pris en charge.
      </div>
    </div>
  );
}
