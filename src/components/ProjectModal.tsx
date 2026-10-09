import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../lib/api";
import type { ModrinthHit, ProjectDetails } from "../lib/types";
import { Icon, Modal, Skeleton, loaderLabel } from "./ui";

/*
 * Page d'un projet Modrinth (mod, modpack, shader...), ouverte en cliquant sur sa carte.
 *
 * La présentation est écrite par l'auteur du projet, en Markdown mêlé de HTML. Elle est affichée
 * dans la fenêtre principale du launcher : elle est donc nettoyée avant affichage (aucun script,
 * aucun formulaire, aucune page incrustée), et ses liens s'ouvrent dans le navigateur.
 */

const SIDES: Record<string, string> = {
  required: "nécessaire",
  optional: "facultatif",
  unsupported: "inutile",
};

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".0", "")} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(".0", "")} k`;
  return String(value);
}

function formatDate(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function isWebLink(link: string | null | undefined): link is string {
  return !!link && /^https?:\/\//i.test(link);
}

/// Dernières versions stables de Minecraft prises en charge (les préversions sont écartées).
function recentVersions(versions: string[]) {
  const stable = versions.filter((v) => /^\d+(\.\d+){1,2}$/.test(v));
  return (stable.length > 0 ? stable : versions).slice(-6).reverse();
}

function renderBody(body: string): string {
  const html = marked.parse(body, { async: false, gfm: true, breaks: false }) as string;
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "iframe", "form", "input", "button", "textarea", "select", "object", "embed", "video", "audio"],
    FORBID_ATTR: ["style", "srcset"],
  });
}

interface Props {
  /// Ce qu'on sait déjà du projet (affiché tout de suite, pendant le chargement de la fiche).
  hit: ModrinthHit;
  favorite: boolean;
  onToggleFavorite: () => void;
  onInstall: (hit: ModrinthHit) => void;
  onClose: () => void;
}

export function ProjectModal({ hit, favorite, onToggleFavorite, onInstall, onClose }: Props) {
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setError(null);
    api
      .getModrinthProject(hit.project_id)
      .then((details) => !cancelled && setProject(details))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [hit.project_id]);

  const body = useMemo(() => (project ? renderBody(project.body) : ""), [project]);

  /// Les liens de la présentation s'ouvrent dans le navigateur, jamais dans le launcher.
  function handleBodyClick(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (isWebLink(href)) openUrl(href);
  }

  const title = project?.title ?? hit.title;
  const icon = project?.icon_url ?? hit.icon_url;
  const type = project?.project_type ?? hit.project_type;
  const slug = project?.slug ?? hit.slug;
  const page = `https://modrinth.com/${type}/${slug}`;
  const links = project
    ? [
        { label: "Code source", url: project.source_url },
        { label: "Signaler un problème", url: project.issues_url },
        { label: "Wiki", url: project.wiki_url },
        { label: "Discord", url: project.discord_url },
      ].filter((l) => isWebLink(l.url))
    : [];

  // La page est rendue à la racine de la fenêtre, et non dans la zone de contenu : son voile
  // recouvre ainsi la barre latérale et la barre de titre, et elle peut occuper toute la largeur.
  return createPortal(
    <>
    <Modal onClose={onClose} width={1500}>
      {/* En-tête : ce que la carte montrait déjà, plus les actions. */}
      <div className="flex items-start gap-4">
        {icon ? (
          <img src={icon} alt="" className="icon-tile w-20 h-20 rounded-2xl shrink-0" />
        ) : (
          <div className="icon-tile w-20 h-20 rounded-2xl shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="page-title truncate">{title}</h2>
          <p className="text-sm text-text-muted mt-1.5 leading-relaxed">{project?.description ?? hit.description}</p>
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2.5 text-[11px] text-text-faint">
            <span className="flex items-center gap-1">
              <Icon name="download" className="w-3.5 h-3.5" />
              {compact(project?.downloads ?? hit.downloads)} téléchargements
            </span>
            {project && (
              <span className="flex items-center gap-1">
                <Icon name="star" className="w-3.5 h-3.5" />
                {compact(project.followers)} abonnés
              </span>
            )}
            {project?.updated && (
              <span className="flex items-center gap-1">
                <Icon name="clock" className="w-3.5 h-3.5" />
                Mis à jour le {formatDate(project.updated)}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-sm w-9 p-0 shrink-0" title="Fermer">
          <Icon name="plus" className="w-4 h-4 rotate-45" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-5">
        <button onClick={() => onInstall(hit)} className="btn btn-primary btn-shine h-11 px-6">
          <Icon name="download" className="w-4 h-4" /> Installer
        </button>
        <button onClick={onToggleFavorite} className={`btn btn-secondary h-11 ${favorite ? "!text-accent" : ""}`}>
          <Icon name="star" filled={favorite} className="w-4 h-4" />
          {favorite ? "Dans mes favoris" : "Ajouter aux favoris"}
        </button>
        <button onClick={() => openUrl(page)} className="btn btn-ghost h-11">
          <Icon name="external" className="w-4 h-4" /> Voir sur Modrinth
        </button>
      </div>

      {error && <div className="alert-error mt-5">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-8 mt-6 items-start">
        <div className="min-w-0 flex flex-col gap-5">
          {/* Galerie : miniatures à faire défiler, agrandies au clic. */}
          {project && project.gallery.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {project.gallery.map((image) => (
                <button
                  key={image.url}
                  onClick={() => setZoom(image.raw_url ?? image.url)}
                  title={image.title ?? "Agrandir"}
                  className="shrink-0 rounded-xl overflow-hidden border border-border-strong hover:border-accent/60 transition-colors"
                >
                  <img src={image.url} alt={image.title ?? ""} className="h-40 w-auto block" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          {project ? (
            <div className="markdown select-text" onClick={handleBodyClick} dangerouslySetInnerHTML={{ __html: body }} />
          ) : (
            !error && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-32 !rounded-xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )
          )}
        </div>

        {/* Fiche technique. */}
        {project && (
          <aside className="flex flex-col gap-4 lg:sticky lg:top-0">
            {project.loaders.length > 0 && (
              <div>
                <div className="label">Loaders</div>
                <div className="flex gap-1.5 flex-wrap">
                  {project.loaders.map((loader) => (
                    <span key={loader} className="badge">
                      {loaderLabel(loader)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {project.game_versions.length > 0 && (
              <div>
                <div className="label">Versions de Minecraft</div>
                <div className="flex gap-1.5 flex-wrap">
                  {recentVersions(project.game_versions).map((version) => (
                    <span key={version} className="badge badge-accent">
                      {version}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-text-faint mt-1.5">
                  {project.game_versions.length} versions prises en charge au total.
                </p>
              </div>
            )}
            {(project.client_side || project.server_side) && (
              <div>
                <div className="label">Où l'installer</div>
                <div className="text-xs text-text-muted leading-relaxed">
                  Sur ton jeu : {SIDES[project.client_side ?? ""] ?? "non précisé"}
                  <br />
                  Sur le serveur : {SIDES[project.server_side ?? ""] ?? "non précisé"}
                </div>
              </div>
            )}
            {project.categories.length > 0 && (
              <div>
                <div className="label">Catégories</div>
                <div className="flex gap-1.5 flex-wrap">
                  {project.categories.map((category) => (
                    <span key={category} className="badge normal-case tracking-normal">
                      {category}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {links.length > 0 && (
              <div>
                <div className="label">Liens</div>
                <div className="flex flex-col items-start gap-1">
                  {links.map((link) => (
                    <button
                      key={link.label}
                      onClick={() => openUrl(link.url as string)}
                      className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                    >
                      {link.label} <Icon name="external" className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(project.license?.name || project.license?.id) && (
              <div>
                <div className="label">Licence</div>
                <div className="text-xs text-text-muted break-words">{project.license.name || project.license.id}</div>
              </div>
            )}
            {project.published && (
              <div>
                <div className="label">Publié le</div>
                <div className="text-xs text-text-muted">{formatDate(project.published)}</div>
              </div>
            )}
          </aside>
        )}
      </div>

    </Modal>
      {zoom && (
        <div
          className="modal-backdrop !z-[60]"
          style={{ background: "color-mix(in srgb, var(--color-bg) 88%, transparent)" }}
          onClick={(e) => {
            e.stopPropagation();
            setZoom(null);
          }}
        >
          <img src={zoom} alt="" className="max-w-[92vw] max-h-[88vh] rounded-2xl shadow-2xl" />
        </div>
      )}
    </>,
    document.body,
  );
}
