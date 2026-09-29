import { useEffect, type CSSProperties } from "react";

/**
 * LoadingSquares: tres cuadritos blancos que se encienden en secuencia.
 * Indicador de carga chico (botones, KPIs, estados inline) y de las cargas de
 * Nebu Studio; el búho (NebuLoader) queda para Wyrd Forge.
 *
 *  size   ancho total en px (default 16). Cada cuadrito mide size/4.
 *  color  default blanco de marca #E8E8E8.
 */

const CSS =
  "@keyframes nebu-sq{0%,28%{opacity:1}36%,92%{opacity:.2}100%{opacity:1}}" +
  ".nebu-squares>span{animation:nebu-sq 1s ease-in-out infinite}" +
  ".nebu-squares>span:nth-child(2){animation-delay:-.667s}" +
  ".nebu-squares>span:nth-child(3){animation-delay:-.333s}" +
  "@media (prefers-reduced-motion:reduce){.nebu-squares>span{animation:none;opacity:.7}}";

let cssInjected = false;
function useSquaresStyles() {
  useEffect(() => {
    if (cssInjected || typeof document === "undefined") return;
    const el = document.createElement("style");
    el.setAttribute("data-nebu-squares", "");
    el.textContent = CSS;
    document.head.appendChild(el);
    cssInjected = true;
  }, []);
}

export default function LoadingSquares({
  size = 16,
  color = "#E8E8E8",
  label = "Cargando",
  className = "",
  style,
}: {
  size?: number;
  color?: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  useSquaresStyles();
  const sq = size / 4;
  return (
    <span
      role="status"
      aria-label={label}
      className={`nebu-squares inline-flex items-center shrink-0 ${className}`}
      style={{ gap: size / 8, height: sq, ...style }}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: sq, height: sq, background: color, display: "block" }} />
      ))}
    </span>
  );
}
