import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatRam, ramAdvice } from "../lib/format";
import { Icon } from "./ui";

// La mémoire du PC ne change pas : elle n'est demandée qu'une fois.
let totalMemory: Promise<number | null> | null = null;
function systemMemory() {
  totalMemory ??= api.systemMemoryMb().catch(() => null);
  return totalMemory;
}

/// Conseil sous les réglages de mémoire : prévient d'une valeur trop haute pour le PC ou trop
/// basse pour le nombre de mods, et propose la valeur conseillée en un clic.
export function RamAdvice({ maxMb, minMb, modCount, onApply }: {
  maxMb: number;
  minMb: number;
  modCount: number;
  onApply: (maxMb: number) => void;
}) {
  const [total, setTotal] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    systemMemory().then((mb) => !cancelled && setTotal(mb));
    return () => {
      cancelled = true;
    };
  }, []);

  const advice = ramAdvice(total, maxMb, minMb, modCount);
  if (!advice) {
    return total ? (
      <p className="text-[11px] text-text-faint">Ton PC a {formatRam(total)} de mémoire.</p>
    ) : null;
  }

  const danger = advice.level === "danger";
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 text-[11px] leading-relaxed ${
        danger ? "border-danger/40 bg-danger/10 text-danger" : "border-amber-500/40 bg-amber-500/10 text-amber-500"
      }`}
    >
      <Icon name="alert" className="w-4 h-4 shrink-0 mt-px" />
      <div className="flex-1 min-w-0">
        {advice.message}
        {advice.suggestedMb !== maxMb && (
          <button onClick={() => onApply(advice.suggestedMb)} className="ml-1.5 font-semibold underline underline-offset-2">
            Mettre {formatRam(advice.suggestedMb)}
          </button>
        )}
      </div>
    </div>
  );
}
