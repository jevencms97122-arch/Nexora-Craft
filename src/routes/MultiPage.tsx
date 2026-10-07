import { useState } from "react";
import { FriendsPanel } from "../components/FriendsPanel";
import { ServersPanel } from "../components/ServersPanel";
import { Icon, PageHeader } from "../components/ui";
import { useCloudStore } from "../store/cloudStore";
import { HostPanel } from "./TogetherPage";

type Tab = "servers" | "friends" | "host";

export function MultiPage() {
  const [tab, setTab] = useState<Tab>("servers");
  const requests = useCloudStore((s) => s.friends.filter((f) => f.state === "incoming").length);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Multijoueur"
        title="Jouer ensemble"
        subtitle="Rejoins tes serveurs favoris ou tes amis en un clic, ou ouvre ton propre monde."
      />

      <div className="flex gap-2">
        <button onClick={() => setTab("servers")} className={`chip ${tab === "servers" ? "chip-active" : ""}`}>
          <Icon name="globe" className="w-3.5 h-3.5" /> Serveurs
        </button>
        <button onClick={() => setTab("friends")} className={`chip ${tab === "friends" ? "chip-active" : ""}`}>
          <Icon name="users" className="w-3.5 h-3.5" /> Amis
          {requests > 0 && <span className="badge badge-accent ml-1">{requests}</span>}
        </button>
        <button onClick={() => setTab("host")} className={`chip ${tab === "host" ? "chip-active" : ""}`}>
          <Icon name="link" className="w-3.5 h-3.5" /> Héberger mon monde
        </button>
      </div>

      <div key={tab} className="rise">
        {tab === "servers" ? <ServersPanel /> : tab === "friends" ? <FriendsPanel /> : <HostPanel />}
      </div>
    </div>
  );
}
