/// Logo Nexora Craft : un bloc vu en perspective, marqué d'un N avec son ombre portée.
/// Dans l'app, il prend la couleur principale choisie par l'utilisateur ; l'icône de
/// l'installateur et de la barre des tâches (src/assets/logo.svg) reste dans le rouge d'origine.
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="Nexora Craft"
    >
      <polygon points="60,8 105,34 60,60 15,34" style={{ fill: "color-mix(in srgb, var(--color-accent) 58%, #ffe9d6)" }} />
      <polygon points="15,34 60,60 60,112 15,86" style={{ fill: "var(--color-accent)" }} />
      <polygon points="60,60 105,34 105,86 60,112" style={{ fill: "color-mix(in srgb, var(--color-accent) 72%, #000000)" }} />
      <path
        d="M39 40h13l17 27V40h12v48H68L51 61v27H39z"
        transform="translate(4 4)"
        style={{ fill: "color-mix(in srgb, var(--color-accent) 45%, #000000)" }}
      />
      <path d="M39 40h13l17 27V40h12v48H68L51 61v27H39z" fill="#ffffff" />
    </svg>
  );
}

/// Logo accompagné du nom, pour les écrans d'accueil.
export function Wordmark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Logo size={size} />
      <span style={{ fontFamily: "var(--font-display)", fontSize: size * 0.5, letterSpacing: "0.02em" }}>
        <span className="font-bold">NEXORA</span> <span className="font-light text-accent">CRAFT</span>
      </span>
    </div>
  );
}
