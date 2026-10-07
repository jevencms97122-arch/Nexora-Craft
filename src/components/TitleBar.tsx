import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUiStore } from "../store/uiStore";
import { Icon } from "./ui";

const appWindow = getCurrentWindow();

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const btn =
    "no-drag w-12 h-full flex items-center justify-center text-text-muted hover:text-text hover:bg-fg/8 transition-colors";

  return (
    <div className="flex items-center h-full">
      <button className={btn} onClick={() => appWindow.minimize()} aria-label="Réduire">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button className={btn} onClick={() => appWindow.toggleMaximize()} aria-label="Agrandir/Restaurer">
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="2.5" y="0.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" />
            <rect x="0.5" y="2.5" width="7" height="7" rx="1" fill="var(--color-bg)" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" />
          </svg>
        )}
      </button>
      <button
        className={`${btn} hover:!bg-danger hover:!text-white`}
        onClick={() => appWindow.close()}
        aria-label="Fermer"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" />
          <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" />
        </svg>
      </button>
    </div>
  );
}

export function TitleBar() {
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  return (
    <header data-tauri-drag-region className="drag-region h-9 shrink-0 flex items-center justify-between pl-5 select-none">
      <span data-tauri-drag-region className="text-[11px] font-semibold tracking-[0.18em] uppercase text-text-muted">
        Nexora <span className="text-accent">Craft</span>
      </span>
      <div className="flex items-center h-full gap-2">
        <button
          onClick={() => setPaletteOpen(true)}
          title="Rechercher une commande (Ctrl+K)"
          className="no-drag h-6 px-2.5 rounded-lg flex items-center gap-2 text-[11px] text-text-muted hover:text-text bg-panel border border-border-strong backdrop-blur transition-colors"
        >
          <Icon name="search" className="w-3 h-3" />
          Rechercher
          <span className="font-mono text-[10px] opacity-70">Ctrl K</span>
        </button>
        <WindowControls />
      </div>
    </header>
  );
}
