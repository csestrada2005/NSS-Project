import { useEffect, useState } from "react";
import NebuLoader from "./NebuLoader";

/**
 * Tarjeta centrada con el búho + texto, sobre un velo semitransparente que
 * deja ver lo que hay detrás (pensada para el "Compiling…" del preview).
 *
 * `delay` aplica a TODA la tarjeta (velo incluido), no sólo al búho: las
 * recompilaciones tras una edición chica suelen durar menos de 300 ms y no
 * deben hacer parpadear nada. El velo es pointer-events-none para no atrapar
 * clicks si el estado se queda puesto (p. ej. "Compiling preview..." con un
 * preview inválido).
 */
export default function NebuLoadingCard({
  label,
  delay = 300,
}: {
  label: string;
  delay?: number;
}) {
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (delay <= 0) return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 pointer-events-none">
      <div className="flex flex-col items-center gap-5 bg-[#0D0D0D]/90 border border-[#2A2A2A] px-14 py-10">
        <NebuLoader size={160} delay={0} label={label} />
        <div className="text-sm font-medium text-[#E8E8E8]">{label}</div>
      </div>
    </div>
  );
}
