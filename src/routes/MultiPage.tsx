import { useState } from "react";
import { ServersPanel } from "../components/ServersPanel";
import { Icon, PageHeader } from "../components/ui";
import { HostPanel } from "./TogetherPage";

type Tab = "servers" | "host";

export function MultiPage() {
  const [tab, setTab] = useState<Tab>("servers");

  return (
    <div className="page">
      <PageHeader
        eyebrow="Multijoueur"
        title="Jouer ensemble"
        subtitle="Rejoins tes serveurs favoris en un clic, ou ouvre ton propre monde à tes amis."
      />

      <div className="flex gap-2">
        <button onClick={() => setTab("servers")} className={`chip ${tab === "servers" ? "chip-active" : ""}`}>
          <Icon name="globe" className="w-3.5 h-3.5" /> Serveurs
        </button>
        <button onClick={() => setTab("host")} className={`chip ${tab === "host" ? "chip-active" : ""}`}>
          <Icon name="link" className="w-3.5 h-3.5" /> Héberger mon monde
        </button>
      </div>

      <div key={tab} className="rise">
        {tab === "servers" ? <ServersPanel /> : <HostPanel />}
      </div>
    </div>
  );
}
