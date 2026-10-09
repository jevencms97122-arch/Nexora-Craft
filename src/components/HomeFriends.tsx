import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useCloudStore, type Friend } from "../store/cloudStore";
import { SkinCanvas } from "./AccountSkin";
import { Icon } from "./ui";

const MAX_SHOWN = 4;

function statusOf(friend: Friend): { label: string; dot: string } {
  if (!friend.online) return { label: "Hors ligne", dot: "bg-text-faint" };
  if (friend.status === "playing") return { label: "En jeu", dot: "bg-accent" };
  return { label: "Launcher", dot: "bg-cyan" };
}

/// Présence des amis, en petit dans le coin de l'accueil : en jeu, dans le launcher ou hors ligne.
export function HomeFriends() {
  const profile = useCloudStore((s) => s.profile);
  const friends = useCloudStore((s) => s.friends);
  const refreshFriends = useCloudStore((s) => s.refreshFriends);

  useEffect(() => {
    if (!profile) return;
    refreshFriends();
    const timer = setInterval(refreshFriends, 30_000);
    return () => clearInterval(timer);
  }, [profile, refreshFriends]);

  const accepted = friends.filter((f) => f.state === "friend");
  if (!profile || accepted.length === 0) return null;

  return (
    <Link
      to="/together"
      title="Voir mes amis"
      className="liquid rounded-2xl px-3 py-2 flex flex-col gap-1.5 w-[168px] hover:border-accent/40 transition-colors"
    >
      <ul className="flex flex-col gap-1.5">
        {accepted.slice(0, MAX_SHOWN).map((friend) => {
          const status = statusOf(friend);
          return (
            <li key={friend.userId} className="flex items-center gap-2 min-w-0">
              <div className="w-5 h-5 rounded-md overflow-hidden bg-panel-3 flex items-center justify-center text-text-faint shrink-0">
                {friend.skin ? (
                  <SkinCanvas src={friend.skin} mode="head" className="w-full h-full" />
                ) : (
                  <Icon name="user" className="w-3 h-3" />
                )}
              </div>
              <span className={`text-xs truncate flex-1 ${friend.online ? "font-semibold" : "text-text-muted"}`}>
                {friend.username}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-text-faint shrink-0" title={status.label}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </li>
          );
        })}
      </ul>
      {accepted.length > MAX_SHOWN && (
        <div className="text-[10px] text-text-faint">+ {accepted.length - MAX_SHOWN} autres</div>
      )}
    </Link>
  );
}
