import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAccountStore } from "../store/accountStore";

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
    "no-drag w-11 h-8 flex items-center justify-center text-text-muted hover:bg-white/10 transition-colors";

  return (
    <div className="flex items-center h-full">
      <button className={btn} onClick={() => appWindow.minimize()} aria-label="Réduire">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        className={btn}
        onClick={() => appWindow.toggleMaximize()}
        aria-label="Agrandir/Restaurer"
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" />
            <rect x="0.5" y="2.5" width="7" height="7" fill="var(--color-panel)" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        )}
      </button>
      <button
        className={`${btn} hover:bg-red-500 hover:text-white`}
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

interface Props {
  transparent?: boolean;
}

export function TitleBar({ transparent }: Props) {
  const { refresh, active } = useAccountStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const account = active();

  return (
    <header
      data-tauri-drag-region
      className={`drag-region h-11 shrink-0 flex items-center justify-between pl-4 select-none backdrop-blur-xl ${
        transparent ? "bg-black/20 border-b border-white/5" : "bg-panel/70 border-b border-border"
      }`}
    >
      <span className="text-[13px] font-medium text-text-muted">Nexora Craft</span>

      <div className="flex items-center h-full gap-3">
        <div className="no-drag flex items-center gap-2 pr-1">
          {account ? (
            <>
              <img
                src={`https://mc-heads.net/avatar/${account.uuid}/28`}
                alt=""
                className="w-6 h-6 rounded-xl bg-panel-2"
              />
              <span className="text-[13px] font-medium">{account.username}</span>
            </>
          ) : (
            <span className="text-[13px] text-text-muted">Aucun compte connecté</span>
          )}
        </div>
        <WindowControls />
      </div>
    </header>
  );
}
