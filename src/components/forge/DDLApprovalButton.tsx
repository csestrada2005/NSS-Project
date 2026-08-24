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
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  History,
  Loader2,
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
  SKIPPED,
  SUPERSEDED,
  buildOutcomeMessage,
  isStillExecutable,
  type DdlProposal,
  type ProposalSourceMessage,
} from '@/utils/ddlProposalState.js';
import { MigrationApplyModal, type FlaggedStatement } from './MigrationApplyModal';

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
          text={`${names} quedó reemplazada por una propuesta más reciente. Aplica la última.`}
        />
      </div>
    );
  }

  if (proposal.state === APPLIED) {
    return (
      <div className="mt-2 pt-2 border-t border-border/50">
        <StatusRow
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          tone="text-green-400"
          text={`${names} está aplicada: el schema del proyecto lo confirma.`}
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
              ? `${names} se ejecutó sin poder confirmarse. Revísala en tu base antes de pedir nada más sobre ella.`
              : `${names} no se aplicó. Pídeme aquí la corrección y generaré una propuesta nueva.`
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
          text={`${names} no se ejecutó: el proyecto no tiene base de datos. Conecta una y vuelve a pedírmelo.`}
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
      abort('No sé contra qué proyecto aplicarla. Vuelve a abrir el proyecto e inténtalo de nuevo.');
      return;
    }

    // RE-VERIFICACIÓN. Con el historial de AHORA, no con el del render.
    if (!isStillExecutable(getMessages(), proposal)) {
      abort(
        'Esta propuesta ya no es la vigente: llegó otra más reciente, o ya se ejecutó. No he ' +
        'aplicado nada. Usa la última propuesta del chat.'
      );
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
        abort(`No pude leer ${fileName(path)} del proyecto (${error}). No he aplicado nada.`);
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
      abort(
        'Mientras confirmabas llegó una propuesta más reciente. No he aplicado nada: revisa la ' +
        'última del chat.'
      );
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
        abort(
          `${fileName(path)} cambió desde que revisé su SQL, así que no he aplicado nada. ` +
          'Vuelve a pulsar para revisar la versión actual.'
        );
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
      // En serie y CORTANDO al primer veredicto que no sea 'applied': las
      // migraciones de un lote se ordenan por su prefijo temporal porque
      // dependen unas de otras, así que seguir tras un fallo es correr DDL
      // sobre un schema que no es el que esa migración espera.
      for (const path of proposal.paths) {
        const result = await MigrationRunner.applyMigration(projectId, path);
        if (result.outcome === 'applied') {
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
    });

    setPending(null);
    setPhase('idle');
    if (content) {
      onOutcome(content);
    } else {
      // Inalcanzable con un veredicto del runner y paths ya validados, pero un
      // veredicto que no se escribe es una propuesta que sigue viva tras haber
      // ejecutado: se dice, en vez de dejarlo en silencio.
      setNotice(
        'La migración se ejecutó pero no pude registrar el resultado en el chat. Revisa el estado ' +
        'de tu base de datos antes de volver a pulsar.'
      );
    }
  };

  return (
    <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
      <button
        onClick={handleClick}
        disabled={disabled || busy || !projectId}
        title={`Aplicar ${names} contra la base de datos del proyecto`}
        className="w-full text-left flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-md px-3 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
        ) : (
          <Database className="w-4 h-4 shrink-0" />
        )}
        <span className="line-clamp-2">
          {phase === 'reading'
            ? 'Revisando el SQL…'
            : phase === 'applying'
            ? 'Aplicando…'
            : proposal.paths.length === 1
            ? `Aplicar ${names} a la base de datos`
            : `Aplicar ${proposal.paths.length} migraciones a la base de datos`}
        </span>
      </button>

      <p className="text-[10px] text-muted-foreground">
        Todavía no se ha ejecutado nada contra tu base de datos.
      </p>

      {notice && (
        <div className="flex items-start gap-2 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

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
    </div>
  );
}
