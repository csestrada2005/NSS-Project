/**
 * modalMotion — valores compartidos de framer-motion para que todos los
 * modales centrados del builder (SettingsModal, NewProjectModal,
 * ShareProjectModal, MigrationApplyModal, CommandModal) entren y SALGAN con
 * el mismo fundido/pop consistente en vez de aparecer/desaparecer de golpe.
 * Bucket 5, ítem 3 (rediseño cosmético — "que se sienta como una
 * experiencia", Samuel 2026-09-19; salida + ritmo más lento pedidos
 * explícitamente el 2026-09-20).
 *
 * `exit` requiere `AnimatePresence` en el componente PADRE que monta/
 * desmonta cada modal condicionalmente (`{show && <Modal .../>}`) — son 4
 * puntos de montaje (NewProjectModal en ForgeDashboard; SettingsModal y
 * ShareProjectModal en StudioEngine; MigrationApplyModal en
 * DDLApprovalButton), cada uno envuelto por separado. framer-motion ya es
 * dependencia del proyecto (usada en RoleSelectionPage, SetupPage, Login,
 * etc.) — no se agrega nada nuevo.
 */
import type { Transition } from 'framer-motion';

const EASE: Transition['ease'] = [0.16, 1, 0.3, 1];

export const modalBackdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.32, ease: EASE },
};

export const modalPanelMotion = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 8 },
  transition: { duration: 0.32, ease: EASE },
};

/**
 * CommandModal (Chat/Visual/Code/Navigate) — sale desde abajo, casi tan
 * grande como el preview, con salida animada (AnimatePresence, ya envuelto
 * en StudioEngine desde el bloque anterior). Además de deslizar en Y, nace
 * chico (`scale` bajo, origen abajo-centro) y crece hasta su tamaño final
 * en vez de sólo entrar de golpe a tamaño completo.
 */
export const bottomSheetMotion = {
  initial: { opacity: 0, y: '40%', scale: 0.55 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: '40%', scale: 0.55 },
  transition: { duration: 0.45, ease: EASE },
  style: { transformOrigin: 'bottom center' },
};
