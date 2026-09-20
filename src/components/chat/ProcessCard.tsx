import type { ProgressLine } from './progressSummary';

/**
 * ProcessCard — Bloque 2 del rediseño: la tarjeta de proceso, con la lista de
 * pasos EN VIVO y la barra de progreso de 1px.
 *
 * Reutiliza el `ProgressLine[]` que `sendMessage` (ChatInterface) ya
 * mantenía para el `BuildProgress` viejo — no es un modelo nuevo, sólo un
 * render nuevo sobre el mismo dato. `status` en los datos existentes sólo
 * distingue 'done'/'pending'/'error' (nunca cuál 'pending' es el que está
 * corriendo AHORA); el "activo" del mockup —el paso en curso, latiendo— se
 * deriva aquí como el PRIMER 'pending' de la lista: todo lo anterior ya se
 * marcó 'done' según avanza sendMessage, así que ese primer pendiente es,
 * por construcción, el único en curso.
 */
export function ProcessCard({
  title,
  promptEcho,
  lines,
}: {
  title: string;
  promptEcho: string;
  lines: ProgressLine[];
}) {
  const activeIndex = lines.findIndex((l) => l.status === 'pending');
  const doneCount = lines.filter((l) => l.status === 'done').length;
  const pct = lines.length > 0 ? Math.round((doneCount / lines.length) * 100) : 0;

  return (
    <div className="fc-pieza">
      <div className="fc-pieza-head">
        <span className="fc-pieza-titulo">{title}</span>
        <span className="fc-prompt-eco">{promptEcho}</span>
      </div>
      <ul className="fc-pasos">
        {lines.map((line, i) => {
          const cls =
            line.status === 'done' ? 'fc-listo' : i === activeIndex ? 'fc-activo' : '';
          return (
            <li key={i} className={`fc-paso ${cls}`}>
              <span className="fc-marca" />
              <span>{line.text}</span>
            </li>
          );
        })}
      </ul>
      <div className="fc-progreso">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
