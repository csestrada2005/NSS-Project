/**
 * modalMotion — valores compartidos de framer-motion para que todos los
 * modales centrados del builder (SettingsModal, NewProjectModal,
 * ShareProjectModal, MigrationApplyModal, CommandModal) entren con el mismo
 * fundido/pop consistente en vez de aparecer de golpe. Bucket 5, ítem 3
 * (rediseño cosmético — "que se sienta como una experiencia", Samuel
 * 2026-09-19).
 *
 * Alcance deliberado: sólo animación de ENTRADA (`initial`/`animate`, sin
 * `exit`). Animar la salida necesitaría `AnimatePresence` en cada
 * componente PADRE que monta/desmonta estos modales condicionalmente
 * (`{show && <Modal .../>}`) — un cambio de estructura mucho más grande y
 * de mayor riesgo que no aporta lo mismo de "sensación de experiencia" que
 * la entrada. framer-motion ya es dependencia del proyecto (usada en
 * RoleSelectionPage, SetupPage, Login, etc.) — no se agrega nada nuevo.
 */
import type { Transition } from 'framer-motion';

const EASE: Transition['ease'] = [0.16, 1, 0.3, 1];

export const modalBackdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.15, ease: EASE },
};

export const modalPanelMotion = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { duration: 0.18, ease: EASE },
};
