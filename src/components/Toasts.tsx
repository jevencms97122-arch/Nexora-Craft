import { useToastStore } from "../store/toastStore";
import { Icon } from "./ui";

/// Petites notifications en bas de l'écran : confirment qu'une action a bien eu lieu.
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="toast liquid liquid-strong pointer-events-auto flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-2xl text-sm font-medium max-w-[min(520px,calc(100vw-48px))] text-left"
        >
          <span
            className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center ${
              t.kind === "error" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"
            }`}
          >
            <Icon name={t.kind === "error" ? "alert" : t.kind === "info" ? "bulb" : "check"} className="w-3.5 h-3.5" />
          </span>
          <span className="min-w-0 break-words">{t.text}</span>
        </button>
      ))}
    </div>
  );
}
