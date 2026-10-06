import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";

interface NavItem {
  to: string;
  label: string;
  icon: ReactElement;
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-[18px] h-[18px]">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const items: NavItem[] = [
  {
    to: "/",
    label: "Jouer",
    icon: <Icon path="M5 3l14 9-14 9V3z" />,
  },
  {
    to: "/instances",
    label: "Instances",
    icon: <Icon path="M4 6h16M4 12h16M4 18h7" />,
  },
  {
    to: "/content",
    label: "Contenu",
    icon: <Icon path="M12 4v16m8-8H4" />,
  },
  {
    to: "/together",
    label: "Jouer ensemble",
    icon: <Icon path="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-2.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 10-1.13-7.84" />,
  },
  {
    to: "/account",
    label: "Compte",
    icon: <Icon path="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 4-6 8-6s8 2 8 6" />,
  },
  {
    to: "/settings",
    label: "Paramètres",
    icon: (
      <Icon path="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.56V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1-1.56 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.56-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.56-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34H9a1.7 1.7 0 001-1.56V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V9a1.7 1.7 0 001.56 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.56 1z" />
    ),
  },
];

interface Props {
  transparent?: boolean;
}

export function Sidebar({ transparent }: Props) {
  return (
    <aside
      className={`w-[220px] shrink-0 backdrop-blur-xl flex flex-col py-3 px-3 gap-0.5 ${
        transparent ? "bg-black/25 border-r border-white/5" : "bg-panel/60 border-r border-border"
      }`}
    >
      <div className="px-2 py-2 mb-2 flex items-center gap-2 select-none">
        <div className="w-6 h-6 rounded-xl bg-accent flex items-center justify-center text-xs font-bold">
          N
        </div>
        <span className="text-[13px] font-semibold text-text">Nexora Craft</span>
      </div>

      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-2.5 py-[7px] rounded-2xl text-[13px] transition-colors ${
              isActive
                ? "bg-accent/90 text-white font-medium"
                : "text-text-muted hover:bg-white/5 hover:text-text"
            }`
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </aside>
  );
}
