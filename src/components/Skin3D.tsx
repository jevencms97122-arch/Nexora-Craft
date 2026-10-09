import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/*
 * Aperçu 3D d'un skin Minecraft, en CSS 3D : chaque partie du corps est une boîte dont les six
 * faces sont des <div> texturés avec la bonne zone du fichier de skin. On le fait tourner en le
 * glissant à la souris ; au repos, il tourne lentement sur lui-même.
 */

type Vec3 = [number, number, number];

interface Part {
  /// Coin haut-gauche de la zone de texture (calque de base).
  uv: [number, number];
  /// Zone du calque externe (chapeau, veste, manches...), absente des skins 64x32 hors tête.
  overlay?: [number, number];
  size: Vec3;
  center: Vec3;
  /// Point de rotation du membre (épaule, hanche) pour l'animation de marche.
  pivot: Vec3;
  swing?: "a" | "b";
  /// Skins 64x32 : le membre gauche réutilise la texture du droit, en miroir.
  mirror?: boolean;
}

function buildParts(slim: boolean, legacy: boolean): Part[] {
  const armW = slim ? 3 : 4;
  const armX = slim ? 5.5 : 6;
  return [
    { uv: [0, 0], overlay: [32, 0], size: [8, 8, 8], center: [0, -12, 0], pivot: [0, -8, 0] },
    { uv: [16, 16], overlay: legacy ? undefined : [16, 32], size: [8, 12, 4], center: [0, -2, 0], pivot: [0, -2, 0] },
    {
      uv: [40, 16],
      overlay: legacy ? undefined : [40, 32],
      size: [armW, 12, 4],
      center: [-armX, -2, 0],
      pivot: [-armX, -6, 0],
      swing: "a",
    },
    {
      uv: legacy ? [40, 16] : [32, 48],
      overlay: legacy ? undefined : [48, 48],
      size: [armW, 12, 4],
      center: [armX, -2, 0],
      pivot: [armX, -6, 0],
      swing: "b",
      mirror: legacy,
    },
    {
      uv: [0, 16],
      overlay: legacy ? undefined : [0, 32],
      size: [4, 12, 4],
      center: [-2, 10, 0],
      pivot: [-2, 4, 0],
      swing: "b",
    },
    {
      uv: legacy ? [0, 16] : [16, 48],
      overlay: legacy ? undefined : [0, 48],
      size: [4, 12, 4],
      center: [2, 10, 0],
      pivot: [2, 4, 0],
      swing: "a",
      mirror: legacy,
    },
  ];
}

/// Six faces d'une boîte : zone de texture [u, v, largeur, hauteur] et transformation 3D.
function boxFaces(
  part: Part,
  uv: [number, number],
  scale: number,
  inflate: number,
  texture: { src: string; height: number },
): CSSProperties[] {
  const [u, v] = uv;
  const [w, h, d] = part.size;
  const s = scale * inflate;
  // Position du centre de la boîte par rapport au pivot du membre.
  const rx = (part.center[0] - part.pivot[0]) * scale;
  const ry = (part.center[1] - part.pivot[1]) * scale;
  const rz = (part.center[2] - part.pivot[2]) * scale;
  const hw = (w * s) / 2;
  const hh = (h * s) / 2;
  const hd = (d * s) / 2;

  let right: [number, number] = [u, v + d];
  let left: [number, number] = [u + d + w, v + d];
  if (part.mirror) [right, left] = [left, right];
  const flip = part.mirror ? " scaleX(-1)" : "";

  const faces: { uv: [number, number]; size: [number, number]; transform: string }[] = [
    { uv: [u + d, v + d], size: [w, h], transform: `translate3d(${rx}px,${ry}px,${rz + hd}px)` },
    { uv: [u + d + w + d, v + d], size: [w, h], transform: `translate3d(${rx}px,${ry}px,${rz - hd}px) rotateY(180deg)` },
    { uv: right, size: [d, h], transform: `translate3d(${rx - hw}px,${ry}px,${rz}px) rotateY(-90deg)` },
    { uv: left, size: [d, h], transform: `translate3d(${rx + hw}px,${ry}px,${rz}px) rotateY(90deg)` },
    { uv: [u + d, v], size: [w, d], transform: `translate3d(${rx}px,${ry - hh}px,${rz}px) rotateX(90deg)` },
    { uv: [u + d + w, v], size: [w, d], transform: `translate3d(${rx}px,${ry + hh}px,${rz}px) rotateX(-90deg)` },
  ];

  return faces.map((face) => ({
    position: "absolute",
    width: face.size[0] * s,
    height: face.size[1] * s,
    left: (-face.size[0] * s) / 2,
    top: (-face.size[1] * s) / 2,
    backgroundImage: `url("${texture.src}")`,
    backgroundSize: `${64 * s}px ${texture.height * s}px`,
    backgroundPosition: `${-face.uv[0] * s}px ${-face.uv[1] * s}px`,
    imageRendering: "pixelated",
    transform: face.transform + flip,
  }));
}

interface Props {
  /// URL ou data URI du fichier de skin (64x64, ou 64x32 pour l'ancien format).
  src: string;
  slim?: boolean;
  /// Hauteur d'affichage, en pixels.
  height: number;
  /// Animation de marche (balancement des bras et des jambes).
  walk?: boolean;
  className?: string;
}

export function Skin3D({ src, slim = false, height, walk = true, className }: Props) {
  const modelRef = useRef<HTMLDivElement>(null);
  const [textureHeight, setTextureHeight] = useState<number | null>(null);

  // La hauteur du fichier distingue les skins modernes (64x64) des anciens (64x32).
  useEffect(() => {
    setTextureHeight(null);
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setTextureHeight(img.naturalHeight >= 64 ? 64 : 32);
    img.onerror = () => !cancelled && setTextureHeight(64);
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Rotation : glisser pour tourner, rotation lente automatique au repos.
  useEffect(() => {
    const model = modelRef.current;
    const stage = model?.parentElement;
    if (!model || !stage) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let yaw = -28;
    let pitch = -8;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let resumeAt = 0;
    let lastTime = 0;
    let raf = 0;

    const apply = () => {
      model.style.transform = `rotateX(${pitch}deg) rotateY(${yaw}deg)`;
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      stage.setPointerCapture(e.pointerId);
      stage.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.7;
      pitch = Math.max(-35, Math.min(35, pitch - (e.clientY - lastY) * 0.4));
      lastX = e.clientX;
      lastY = e.clientY;
      apply();
    };
    const onUp = () => {
      dragging = false;
      resumeAt = performance.now() + 2500;
      stage.style.cursor = "grab";
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        lastTime = 0;
        return;
      }
      const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0;
      lastTime = now;
      if (!dragging && now > resumeAt && !reduced) {
        yaw += 14 * dt;
        apply();
      }
    };

    apply();
    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const scale = height / 36;
  const parts = useMemo(() => {
    if (textureHeight === null) return [];
    const legacy = textureHeight === 32;
    const texture = { src, height: textureHeight };
    return buildParts(slim, legacy).map((part) => ({
      part,
      faces: [
        ...boxFaces(part, part.uv, scale, 1, texture),
        ...(part.overlay ? boxFaces(part, part.overlay, scale, 1.1, texture) : []),
      ],
    }));
  }, [src, slim, scale, textureHeight]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        height,
        width: height * 0.62,
        perspective: height * 5,
        cursor: "grab",
        touchAction: "none",
      }}
      title="Glisse pour faire tourner"
    >
      <div
        ref={modelRef}
        style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transformStyle: "preserve-3d" }}
      >
        {parts.map(({ part, faces }, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 0,
              height: 0,
              transformStyle: "preserve-3d",
              transform: `translate3d(${part.pivot[0] * scale}px,${part.pivot[1] * scale}px,${part.pivot[2] * scale}px)`,
            }}
          >
            <div
              className={walk && part.swing ? `limb-swing limb-${part.swing}` : undefined}
              style={{ position: "absolute", width: 0, height: 0, transformStyle: "preserve-3d" }}
            >
              {faces.map((style, f) => (
                <div key={f} style={style} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
