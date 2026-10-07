import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useAccountStore } from "../store/accountStore";
import { useGameStore } from "../store/gameStore";
import { useThemeStore } from "../store/themeStore";
import { AccountSkin } from "./AccountSkin";
import { Logo } from "./Logo";
import { Icon, type IconName } from "./ui";

const items: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Jouer", icon: "play" },
  { to: "/instances", label: "Instances", icon: "grid" },
  { to: "/content", label: "Explorer", icon: "compass" },
  { to: "/together", label: "Multi", icon: "users" },
  { to: "/gallery", label: "Galerie", icon: "camera" },
];

function NavItem({ to, label, icon }: { to: string; label: string; icon: IconName }) {
  return (
    <NavLink to={to} end={to === "/"} className="group flex flex-col items-center gap-1 py-1.5 w-full">
      {({ isActive }) => (
        <>
          {/* L'indicateur est ancré sur la tuile de l'icône, pas sur tout le bouton : il reste aligné. */}
          <span className="relative">
            <span
              className={`absolute -left-[13px] top-1/2 -translate-y-1/2 w-[3px] rounded-full bg-accent transition-all duration-200 ${
                isActive ? "h-6 opacity-100 shadow-[0_0_10px_1px_var(--color-accent)]" : "h-0 opacity-0"
              }`}
            />
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? "liquid text-accent !border-accent/40"
                  : "text-text-muted group-hover:text-text group-hover:bg-fg/6"
              }`}
            >
              <Icon name={icon} className="w-[20px] h-[20px]" filled={icon === "play" && isActive} />
            </span>
          </span>
          <span
            className={`text-[10.5px] font-medium tracking-wide ${
              isActive ? "text-text" : "text-text-faint group-hover:text-text-muted"
            }`}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { refresh, active } = useAccountStore();
  const runningId = useGameStore((s) => s.runningId);
  const { theme, toggleTheme } = useThemeStore();
  const account = active();

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <aside className="liquid relative z-20 w-[76px] shrink-0 m-2.5 mr-0 rounded-[28px] flex flex-col items-center py-4">
      <div
        data-tauri-drag-region
        className="drag-region mb-4 drop-shadow-[0_6px_14px_color-mix(in_srgb,var(--color-accent)_45%,transparent)]"
      >
        <Logo size={46} className="pointer-events-none" />
      </div>

      <nav className="flex flex-col items-center gap-0.5 w-full stagger-x min-h-0 overflow-y-auto [scrollbar-width:none]">
        {items.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1 w-full">
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit"}
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-text-muted hover:text-text hover:bg-fg/6 transition-colors"
        >
          <Icon name={theme === "dark" ? "moon" : "sun"} className="w-[19px] h-[19px]" />
        </button>
        <NavItem to="/settings" label="Réglages" icon="settings" />
        <NavLink
          to="/account"
          title={account ? account.username : "Se connecter"}
          className={({ isActive }) =>
            `relative mt-2 w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center transition-all bg-panel-3 ${
              isActive
                ? "ring-2 ring-accent shadow-[0_0_18px_-2px_var(--color-accent)]"
                : "ring-1 ring-border-strong hover:ring-accent/60"
            }`
          }
        >
          {account ? (
            <AccountSkin account={account} mode="head" className="w-full h-full" />
          ) : (
            <Icon name="user" className="w-5 h-5 text-text-muted" />
          )}
        </NavLink>
        {runningId && (
          <span className="mt-1 text-[10px] font-semibold text-accent flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> EN JEU
          </span>
        )}
      </div>
    </aside>
  );
}
