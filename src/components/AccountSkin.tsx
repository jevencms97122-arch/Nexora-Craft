import { useEffect, useRef } from "react";
import type { Account } from "../lib/types";
import { useAccountStore } from "../store/accountStore";
import { Skin3D } from "./Skin3D";

/// Skin par défaut (Steve), utilisé pour un compte local sans skin personnalisé.
const DEFAULT_SKIN =
  "https://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb";

type Mode = "body" | "head";

// Zones [sx, sy, w, h, dx, dy] de la vue de face d'un skin 64x64 (calque de base puis calque externe).
const BODY_64: number[][] = [
  [8, 8, 8, 8, 4, 0],
  [20, 20, 8, 12, 4, 8],
  [44, 20, 4, 12, 0, 8],
  [36, 52, 4, 12, 12, 8],
  [4, 20, 4, 12, 4, 20],
  [20, 52, 4, 12, 8, 20],
  [40, 8, 8, 8, 4, 0],
  [20, 36, 8, 12, 4, 8],
  [44, 36, 4, 12, 0, 8],
  [52, 52, 4, 12, 12, 8],
  [4, 36, 4, 12, 4, 20],
  [4, 52, 4, 12, 8, 20],
];

// Skin 64x32: pas de calque de bras/jambe gauche, on réutilise (en miroir) ceux de droite.
const BODY_32: number[][] = [
  [8, 8, 8, 8, 4, 0],
  [20, 20, 8, 12, 4, 8],
  [44, 20, 4, 12, 0, 8],
  [4, 20, 4, 12, 4, 20],
  [40, 8, 8, 8, 4, 0],
];

function drawSkin(canvas: HTMLCanvasElement, img: HTMLImageElement, mode: Mode) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mode === "head") {
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
    return;
  }

  const zones = img.height >= 64 ? BODY_64 : BODY_32;
  for (const [sx, sy, w, h, dx, dy] of zones) ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);

  if (img.height < 64) {
    // Membres gauches = membres droits retournés horizontalement.
    for (const [sx, dx, dy] of [[44, 12, 8], [4, 8, 20]]) {
      ctx.save();
      ctx.translate(dx + 4, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, 20, 4, 12, 0, dy, 4, 12);
      ctx.restore();
    }
  }
}

interface CanvasProps {
  src: string;
  mode: Mode;
  className?: string;
}

/// Rendu de face d'un skin (URL ou data URI).
export function SkinCanvas({ src, mode, className }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => drawSkin(canvas, img, mode);
    img.src = src;
  }, [src, mode]);

  return (
    <canvas
      ref={canvasRef}
      width={mode === "head" ? 8 : 16}
      height={mode === "head" ? 8 : 32}
      className={className}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

interface Props {
  account: Account;
  mode: Mode;
  className?: string;
}

/// Affiche le skin d'un compte: via mc-heads pour les comptes Microsoft, ou en rendu local
/// pour un compte hors-ligne ayant un skin perso.
export function AccountSkin({ account, mode, className }: Props) {
  const localSkin = useAccountStore((s) => s.localSkins[account.uuid]);
  const loadLocalSkin = useAccountStore((s) => s.loadLocalSkin);

  useEffect(() => {
    if (account.is_offline) loadLocalSkin(account.uuid);
  }, [account.uuid, account.is_offline, loadLocalSkin]);

  // Compte local : son skin perso, ou Steve par défaut (le même que dans l'aperçu 3D).
  if (account.is_offline) {
    if (localSkin === undefined) return <div className={className} />;
    return <SkinCanvas src={localSkin ?? DEFAULT_SKIN} mode={mode} className={className} />;
  }

  const url =
    mode === "head"
      ? `https://mc-heads.net/avatar/${account.uuid}/64`
      : `https://mc-heads.net/body/${account.uuid}/160`;
  return <img src={url} alt="" className={className} />;
}

/// Fichier de skin d'un compte, pour le rendu 3D : skin local, skin en ligne, ou Steve par défaut.
/// `undefined` pendant le chargement, `null` si le skin en ligne est introuvable.
function useSkinTexture(account: Account): { src: string; slim: boolean } | null | undefined {
  const localSkin = useAccountStore((s) => s.localSkins[account.uuid]);
  const remoteSkin = useAccountStore((s) => s.remoteSkins[account.uuid]);
  const loadLocalSkin = useAccountStore((s) => s.loadLocalSkin);
  const loadRemoteSkin = useAccountStore((s) => s.loadRemoteSkin);

  useEffect(() => {
    if (account.is_offline) loadLocalSkin(account.uuid);
    else loadRemoteSkin(account);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.uuid, account.is_offline]);

  if (account.is_offline) {
    if (localSkin === undefined) return undefined;
    return { src: localSkin ?? DEFAULT_SKIN, slim: false };
  }
  if (remoteSkin === undefined) return undefined;
  return remoteSkin ? { src: remoteSkin.url, slim: remoteSkin.variant === "slim" } : null;
}

/// Skin du compte en 3D, qu'on fait tourner à la souris. Retombe sur l'image de face si le
/// fichier de skin n'est pas disponible.
export function AccountSkin3D({ account, height, className }: { account: Account; height: number; className?: string }) {
  const texture = useSkinTexture(account);
  if (texture === undefined) return <div className={className} style={{ height, width: height * 0.62 }} />;
  if (texture === null) {
    return (
      <div className={className} style={{ height }}>
        <AccountSkin account={account} mode="body" className="h-full" />
      </div>
    );
  }
  return <Skin3D src={texture.src} slim={texture.slim} height={height} className={className} />;
}
