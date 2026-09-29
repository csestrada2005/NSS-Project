/**
 * LiveNode — el nodo vivo de la typebar (1.2 del rediseño).
 *
 * Sin props de estado: toda la animación (respiración en reposo, latido +
 * líneas corriendo en pensando, reposo de nuevo en listo) la maneja el CSS de
 * forgeChat.css contra el atributo `data-estado` del wrapper `.forge-chat`
 * (mismo mecanismo que el mockup usaba con `body[data-estado]`). Es el ÚNICO
 * elemento con animación ambiental de todo el modal — nada más aquí debe
 * ganar una animación en bucle.
 */
export function LiveNode() {
  return (
    <span className="fc-nodo" aria-hidden="true">
      <svg viewBox="0 0 60 60">
        <path d="M30 30 C 7 21, 3 39, -15 33" />
        <path d="M30 30 C 53 39, 57 19, 75 27" />
        <path d="M30 30 C 33 51, 17 57, 21 75" />
      </svg>
      <i />
    </span>
  );
}
