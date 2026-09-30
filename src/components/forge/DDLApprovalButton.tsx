/**
 * DDLApprovalButton — la aprobación humana que faltaba, dentro del mensaje que
 * la pide.
 *
 * DÓNDE VIVE Y POR QUÉ AHÍ
 * ------------------------
 * El botón se pinta INLINE, en el mensaje del asistente que anunció la
 * migración. No en un panel aparte, no en una pestaña: el contexto de la
 * decisión es lo que el asistente acaba de decir que hizo, y separarlo de ahí
 * obliga al usuario a reconstruir a qué se refiere lo que va a ejecutar.
 *
 * EL ESTADO NO SE GUARDA: SE RE-DERIVA, Y DOS VECES
 * ------------------------------------------------
 * Una vez al pintar y otra AL PULSAR. La segunda no es paranoia: entre el
 * render y el click cabe un pipeline entero (el chat sigue vivo mientras se
 * genera), y una propuesta posterior deja obsoleta a ésta. El estado con el que
 * se pintó el botón puede estar muerto para cuando el dedo baja, así que la
 * pregunta "¿sigues siendo TÚ la ejecutable?" se vuelve a hacer contra el
 * historial de ese instante. Si la respuesta es no, se aborta con un aviso y no
 * se ejecuta NADA — la alternativa es aplicar un plan viejo sobre una base que
 * la propuesta nueva ya da por hecha.
 *
 * ANTES DE EJECUTAR, SE MIRA EL SQL
 * ---------------------------------
 * El SQL se lee de forge_files (la fuente de verdad, no el mapa en memoria) y
 * pasa por ddlGuard. Si destruye datos, la confirmación no es un "¿seguro?":
 * es el modal que enseña las sentencias marcadas y exige teclear el nombre del
 * objeto afectado. Cancelar en cualquiera de los dos casos deja la base, el
 * archivo y el estado de la propuesta exactamente como estaban.
 *
 * LO QUE ESTE COMPONENTE NO DECIDE
 *  - Si la propuesta es ejecutable: eso es ddlProposalState (puro, con tests).
 *  - Si el SQL destruye datos: eso es ddlGuard (puro, con tests).
 *  - Si la migración acabó aplicada: eso es MigrationRunner, y su criterio es
 *    el diff del schema. Aquí sólo se PINTA lo que esos tres dicen.
 */

import { useState, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  History,
  XCircle,
} from 'lucide-react';
import { MigrationRunner } from '@/services/MigrationRunner';
import { destructiveTargets, findDestructiveDDL } from '@/utils/ddlGuard.js';
import {
  APPLIED,
  EXECUTABLE,
  FAILED,
  OUTCOME_APPLIED,
  OUTCOME_UNVERIFIED,
  stopsBatch,
  SKIPPED,
  SUPERSEDED,
  DISMISSED,
  buildOutcomeMessage,
  isStillExecutable,
  type DdlProposal,
  type ProposalSourceMessage,
} from '@/utils/ddlProposalState.js';
import { MigrationApplyModal, type FlaggedStatement } from './MigrationApplyModal';
import LoadingSquares from '../brand/LoadingSquares';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

interface Props {
  /** La propuesta que este mensaje anunció, ya resuelta a un estado. */
  proposal: DdlProposal;
  /** Proyecto contra cuya base se aplicaría. Sin él no se ofrece ejecutar. */
  projectId?: string | null;
  /**
   * El historial VIVO, leído en el momento del click. No es un prop de datos:
   * es la re-verificación. Un array congelado en el render valdría lo mismo que
   * no comprobar nada.
   */
  getMessages: () => ProposalSourceMessage[];
  /** Escribe (y persiste) el mensaje del veredicto en el chat. */
  onOutcome: (content: string) => void;
  /** Modo lectura, o generación en curso: se enseña el estado, sin acción. */
  disabled?: boolean;
}

/** Nombre de archivo, sin el `supabase/migrations/` que llevan todos. */
function fileName(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? path : path.slice(cut + 1);
}

/** Fila de estado: lo que ve una propuesta que ya no admite acción. */
function StatusRow({
  icon,
  text,
  tone,
}: {
  icon: ReactNode;
  text: string;
  tone: string;
}) {
  return (
    <div className={`flex items-start gap-2 text-xs ${tone}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

export function DDLApprovalButton({
  proposal,
  projectId,
  getMessages,
  onOutcome,
  disabled = false,
}: Props) {
  const [phase, setPhase] = useState<'idle' | 'reading' | 'confirming' | 'applying'>('idle');
  const { lang, t } = useForgeLang();
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    flagged: FlaggedStatement[];
    targets: string[];
    sqlByPath: Map<string, string>;
  } | null>(null);

  const names = proposal.paths.map(fileName).join(', ');

  // --- Estados sin acción ---------------------------------------------------

  if (proposal.state === SUPERSEDED) {
    return (
      <div className="mt-2 pt-2 border-t border-border/50">
        <StatusRow
          icon={<History className="w-3.5 h-3.5" />}
          tone="text-muted-foreground"
          text={t('ddl.superseded', { names })}
        />
      </div>
    );
  }

  if (proposal.state === APPLIED) {
    return (
      <div className="mt-2 pt-2 border-t border-border/50">
        <StatusRow
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          tone="text-emerald-400"
          text={t('ddl.applied', { names })}
        />
      </div>
    );
  }

  if (proposal.state === FAILED) {
    // 'failed' y 'unverified' comparten estado —ninguno se reintenta— y NO
    // comparten consejo: uno manda a arreglar el SQL, el otro a mirar la base.
    const unverified = proposal.outcome === OUTCOME_UNVERIFIED;
    return (
      <div className="mt-2 pt-2 border-t border-border/50">
        <StatusRow
          icon={
            unverified ? <Eye className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />
          }
          tone={unverified ? 'text-amber-400' : 'text-red-400'}
          text={
            unverified
              ? t('ddl.unverified', { names })
              : t('ddl.failed', { names })
          }
        />
      </div>
    );
  }

  if (proposal.state === SKIPPED) {
    return (
      <div className="mt-2 pt-2 border-t border-border/50">
        <StatusRow
          icon={<Database className="w-3.5 h-3.5" />}
          tone="text-muted-foreground"
          text={t('ddl.skipped', { names })}
        />
      </div>
    );
  }

  if (proposal.state === DISMISSED) {
    return (
      <div className="mt-2 pt-2 border-t border-border/50">
        <StatusRow
          icon={<History className="w-3.5 h-3.5" />}
          tone="text-muted-foreground"
          text={t('ddl.dismissed', { names })}
        />
      </div>
    );
  }

  if (proposal.state !== EXECUTABLE) return null;

  // --- La propuesta ejecutable ---------------------------------------------

  const busy = phase === 'reading' || phase === 'applying';

  /**
   * Aborta el click dejando dicho por qué. No ejecuta, no escribe en el chat y
   * no cambia el estado de la propuesta: sigue donde estaba.
   */
  const abort = (message: string) => {
    setNotice(message);
    setPending(null);
    setPhase('idle');
  };

  const handleClick = async () => {
    setNotice(null);

    if (!projectId) {
      abort(t('ddl.abort.noProject'));
      return;
    }

    // RE-VERIFICACIÓN. Con el historial de AHORA, no con el del render.
    if (!isStillExecutable(getMessages(), proposal)) {
      abort(t('ddl.abort.stale'));
      return;
    }

    setPhase('reading');

    // El SQL de VERDAD, el mismo que va a ejecutarse. Si no se puede leer, no
    // se ejecuta: enseñar un modal sobre un SQL que no tenemos sería enseñar
    // una suposición.
    const sqlByPath = new Map<string, string>();
    for (const path of proposal.paths) {
      const { sql, error } = await MigrationRunner.readMigrationSql(projectId, path);
      if (error) {
        abort(t('ddl.abort.readFailed', { file: fileName(path), error: String(error) }));
        return;
      }
      sqlByPath.set(path, sql);
    }

    const flagged: FlaggedStatement[] = [];
    for (const [path, sql] of sqlByPath) {
      for (const finding of findDestructiveDDL(sql)) flagged.push({ path, finding });
    }

    setPending({
      flagged,
      targets: destructiveTargets(flagged.map(f => f.finding)),
      sqlByPath,
    });
    setPhase('confirming');
  };

  const handleConfirm = async () => {
    if (!projectId || !pending) return;

    // Segunda re-verificación, ya con el modal abierto: leer el SQL y
    // confirmar toma tiempo real del usuario, y en ese tiempo cabe otra
    // propuesta igual que antes del modal.
    if (!isStillExecutable(getMessages(), proposal)) {
      abort(t('ddl.abort.newerWhileConfirming'));
      return;
    }

    // El SQL que se revisó tiene que ser el SQL que se ejecuta.
    //
    // Entre pasar ddlGuard y confirmar hay tiempo humano —leer las sentencias
    // marcadas, teclear el nombre de la tabla— y el runner NO reutiliza lo que
    // se leyó aquí: vuelve a leer forge_files. Si el archivo cambió en medio
    // (una regeneración en otra pestaña), se ejecutaría un SQL que nadie ha
    // revisado, con la aprobación dada para otro. La comprobación va ENTERA
    // antes de aplicar nada: detectarlo a mitad de un lote dejaría migraciones
    // aplicadas sin veredicto escrito, y la propuesta seguiría ofreciéndose.
    for (const path of proposal.paths) {
      const current = await MigrationRunner.readMigrationSql(projectId, path);
      if (current.error || current.sql !== pending.sqlByPath.get(path)) {
        abort(t('ddl.abort.changed', { file: fileName(path) }));
        return;
      }
    }

    setPhase('applying');

    const appliedPaths: string[] = [];
    const tables: string[] = [];
    let outcome: string = OUTCOME_APPLIED;
    let reason: string | undefined;
    let failedPath: string | null = null;

    try {
      // En serie, en el orden del lote (que es el de sus prefijos temporales),
      // y deteniéndose donde diga stopsBatch — la regla vive en el módulo puro
      // porque decide cuánto DDL irreversible corre de una tacada. Los archivos
      // posteriores al que detiene el lote NO se intentan.
      for (const path of proposal.paths) {
        const result = await MigrationRunner.applyMigration(projectId, path);
        if (!stopsBatch(result.outcome)) {
          appliedPaths.push(path);
          for (const table of result.tables) {
            if (!tables.includes(table)) tables.push(table);
          }
          continue;
        }
        outcome = result.outcome;
        // Un apply correcto sólo trae reason cuando hay algo que decir (la
        // marca de telemetría perdida); aquí es el motivo del veredicto.
        reason = result.reason;
        failedPath = path;
        break;
      }
    } catch (e) {
      // El runner cierra sus propios fallos y devuelve veredicto; llegar aquí
      // significa que se rompió algo por debajo (el cliente de Supabase, la
      // red) y NO sabemos si el DDL llegó a correr.
      //
      // Se cierra como 'unverified', no como 'failed': "no se aplicó, arregla
      // el SQL" sería una afirmación que no podemos sostener, y decirla manda a
      // reintentar un DDL que puede haber corrido ya. 'unverified' dice lo
      // único cierto —míralo en tu base— y, sobre todo, CIERRA la propuesta:
      // dejarla ejecutable tras una ejecución de resultado desconocido es
      // exactamente lo que no se puede ofrecer.
      outcome = OUTCOME_UNVERIFIED;
      reason = e instanceof Error ? e.message : String(e);
      console.error('[DDLApprovalButton] la ejecución se rompió:', e);
    }

    if (outcome === OUTCOME_APPLIED && !reason) reason = undefined;

    const content = buildOutcomeMessage({
      outcome,
      paths: proposal.paths,
      appliedPaths,
      tables,
      reason: reason ?? null,
      failedPath,
    }, lang);

    setPending(null);
    setPhase('idle');
    if (content) {
      onOutcome(content);
    } else {
      // Inalcanzable con un veredicto del runner y paths ya validados, pero un
      // veredicto que no se escribe es una propuesta que sigue viva tras haber
      // ejecutado: se dice, en vez de dejarlo en silencio.
      setNotice(t('ddl.notRecorded'));
    }
  };

  // display:contents — este componente vive como UN ítem más dentro de la fila
  // de botones de DDLCard (.fc-accion-fila, un flex row); "contents" deja que
  // el botón se comporte como hijo directo de esa fila (mismo alto/alineación
  // que "Ver el SQL"/"Ver historial completo") mientras que el texto de ayuda,
  // el aviso y el modal — que SÍ necesitan su propia línea — se lo piden al
  // flex-wrap de la fila con flexBasis:'100%', en vez de forzar un contenedor
  // en bloque que rompería la fila.
  return (
    <div style={{ display: 'contents' }}>
      <button
        onClick={handleClick}
        disabled={disabled || busy || !projectId}
        title={t('ddl.button.title', { names })}
        className="fc-accion-btn"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
      >
        {busy ? (
          <LoadingSquares size={16} />
        ) : (
          <Database className="w-4 h-4 shrink-0" />
        )}
        <span className="line-clamp-2">
          {phase === 'reading'
            ? t('ddl.button.reviewing')
            : phase === 'applying'
            ? t('ddl.button.applying')
            : proposal.paths.length === 1
            ? t('ddl.button.applyOne', { names })
            : t('ddl.button.applyMany', { count: proposal.paths.length })}
        </span>
      </button>

      <p className="fc-accion-cuerpo" style={{ flexBasis: '100%', fontSize: 11, margin: '6px 0 0' }}>
        {t('ddl.nothingYet')}
      </p>

      {notice && (
        <div className="fc-accion-cuerpo" style={{ flexBasis: '100%', display: 'flex', alignItems: 'flex-start', gap: 8, color: '#fbbf24', fontSize: 12, margin: '6px 0 0' }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      <AnimatePresence>
        {phase !== 'idle' && phase !== 'reading' && pending && (
          <MigrationApplyModal
            paths={proposal.paths}
            flagged={pending.flagged}
            targets={pending.targets}
            isApplying={phase === 'applying'}
            onCancel={() => {
              // Cancelar no deja rastro: ni base, ni chat, ni estado. La
              // propuesta sigue siendo la ejecutable.
              if (phase === 'applying') return;
              setPending(null);
              setPhase('idle');
            }}
            onConfirm={handleConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
