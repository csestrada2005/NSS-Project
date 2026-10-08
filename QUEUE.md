# QUEUE.md — Cola de Wyrd Forge

Lo que falta por hacer, en palabras simples. Claude la lee al empezar cada sesión y la actualiza al cerrar.
Regla: las sesiones existen para ACHICAR esta cola. Un hallazgo nuevo se mete en una sección que ya exista
siempre que se pueda.

- Versión corta desde el 2026-10-08. La versión larga, con todo el historial y la evidencia de cada bloque,
  sigue en git: `git show c1c83b3:QUEUE.md`.
- Último estado conocido: `main` desplegado en Render (2026-10-08). Revisar con `git log` antes de confiar
  en un hash de este archivo.

---

## 1. AHORA

Nada en curso. Elegir lo siguiente de las secciones 2–4.

## 2. Producto (lo que ve el usuario)

- **"Modal que corre detrás" (Samuel, 2026-10-09):** si se cierra el modal mientras trabaja, al volver ya no
  muestra todo lo que decía y el botón rojo animado se mueve de lugar. Debe seguir mostrando el progreso tal
  cual (el trabajo corre detrás). Pendiente de diseño.
- **Modo Plan: pedir un plan da plan — HECHO, espera check (2026-10-09, P2 + L1 de Samuel).** "Proponme un
  plan…" caía en el carril de preguntas (consola: question lane). Ahora el clasificador sabe que es modo Plan,
  y un seguro sin IA (src/utils/planModeIntent.js) nunca trata como pregunta un mensaje que pide plan/propuesta.
  Se quitaron los atajos viejos ("plan:", "build a…", "execute next step") que escribían PLAN.md o código
  saltándose créditos, plan y aprobación.
- **"Revisar" el plan — HECHO Y CONFIRMADO (2026-10-09, R1 de Samuel; texto de la ventana acortado).** El botón (antes "Editar el plan")
  abre el plan como texto editable; al enviar, la IA vuelve a planear con la versión del usuario y construye
  directo (src/utils/planEdit.js, marca [PLAN_EDITED] en el pedido). Sólo pregunta otra vez si el plan nuevo
  borra algo que el anterior no borraba. Cómo debía funcionar (Samuel, 2026-10-08): un botón "Revisar" abre el plan en
  grande y **editable con el teclado**. Ejemplo: el plan dice "propongo 3 formas de hacerlo", Samuel escribe
  "de las 3 opciones aplica A" y da enviar; la IA vuelve a leer el plan con esa edición y construye según eso.
- **Aprobación de Unsplash para producción — CÓDIGO HECHO (2026-10-08); check manual en la corrida completa
  del Plan de evaluación (sección 3).** Hoy en demo (50 pedidos por hora). Victor (Unsplash) pide dos pruebas,
  subidas al formulario de la aplicación, no por correo:
  1. **Crédito con enlace UTM:** ya estaba en las reglas de la IA: el footer lleva "Photos via Unsplash" con
     `?utm_source=wyrd_forge&utm_medium=referral` y el nombre de cada fotógrafo usado enlazado a su perfil con
     los mismos UTM (server/unsplash.js). Prueba para Victor: captura con el cursor encima mostrando la URL abajo
     a la izquierda, o captura del código, o video haciendo clic.
  2. **"Download" sólo por las fotos usadas — HECHO:** antes se disparaba para TODO el grupo al buscar. Ahora, al
     terminar la primera generación, el servidor mira en los archivos guardados qué fotos del grupo quedaron y
     avisa sólo por ésas (`POST /api/projects/:id/images/downloads`, log `[images/downloads] … usadas N ·
     triggered=…`). Límite conocido: fotos del grupo añadidas en pedidos POSTERIORES no se avisan. Prueba para
     Victor: el contador de Downloads de la app en Unsplash mayor que 0.
  Pendientes viejos del mismo tema: reserva de imagen del hero, guard anti-duplicado y créditos en el footer
  (rama `claude/keen-mccarthy-oknmc8`), y precisión al atribuir las imágenes (sección 10).
- **Dictado por micrófono** en el chat (hoy "Próximamente").
- **Plan más claro:** mostrar el plan también en la primera generación, que el bloque del plan no se pierda al
  recargar la página, y que muestre el nombre final de la migración (no el que dijo el modelo).
- **Aviso del guard de código en lenguaje simple:** hoy dice "mueve esto a una función de servidor", algo que un
  usuario no técnico no sabe hacer. Decidir también si sus límites se quedan así: no recuerda pedidos
  anteriores, no detecta imports con otro nombre (`supabase as sb`), y en los cambios rápidos sólo deja registro,
  sin aviso en el chat.
- **Tutorial para desarrolladores** (en lenguaje llano, con mockup). Dos cosas obligatorias:
  - Decir claramente que el login y el panel de admin sólo se prueban en el sitio PUBLICADO, nunca en el editor.
  - Todo lo demás del panel debe poder recorrerse en el editor. Nunca dejar una sección en blanco por el login
    (esto también es regla para la IA).
- Catálogo de componentes, revisando la licencia de cada uno.
- Mejora de velocidad aparcada: que el preview reuse lo que ya compiló el Verifier (~2–3 s menos).

## 3. Calidad de la IA

- **Plan de evaluación** (diseño en frío propio): (1) Samuel trae proyectos REALES de Nebu y se revisa si la IA
  cumpliría las reglas y la arquitectura de Nebu; (2) una corrida completa con un proyecto nuevo y un pedido
  grande y exigente, para comparar con el proyecto real.
  - **Check manual pendiente de Unsplash en esa corrida (2026-10-08):** (a) en el log de Render,
    `[images/downloads] … usadas N · triggered=N failed=0` con N igual a las fotos de Unsplash del sitio, y
    ninguna línea `download triggers` al buscar; (b) en el footer, "Photos via Unsplash" y cada fotógrafo
    enlazan con `utm_source=wyrd_forge&utm_medium=referral` (hacer la captura/video para Victor); (c) el
    contador de Downloads de la app en Unsplash sube. Luego responder a Victor.
- **Tipo de negocio decidido UNA vez:** decidirlo al crear el proyecto, guardarlo en la base y que el contexto
  de diseño lo lea de ahí en vez de adivinarlo en cada pedido. Junto con esto: la búsqueda de patrones de diseño
  siempre trae "1 directo + 4 parecidos" aunque la base es grande (¿tope fijo en el código?), y los pedidos en
  español contra una base en inglés.
- **Respuestas que comparan con los archivos de datos (Samuel, 2026-10-08):** a "¿están bien los precios con el
  PDF?" la respuesta dio los precios del PDF pero pidió a Samuel comparar con src/data/pricing.ts: la respuesta
  sólo recibe los 2 archivos que parecen más relevantes y pricing.ts no entró. Cuando la pregunta compara con
  datos del sitio, incluir ese archivo para que conteste sí/no sola.
- **Copias guardadas también al construir:** hoy las respuestas usan sola la copia de un PDF/foto ya leído
  (savedReadings.js); al construir todavía hay que adjuntarlo.
- **Reparación sin IA del nombre de exportación (2026-10-08), en observación:** no se puede provocar a voluntad.
  Si Samuel vuelve a ver una sección rota tras una reparación, revisar la consola (`[Verifier] arreglo sin IA`).
  Los demás errores siguen yendo al modelo (el "detector de destrozos" 2B no se hizo).
- **Apóstrofo sin escapar (Vertigo, 2026-10-09):** `[compile] ERROR: Expected "}" but found "s"` en
  src/data/expeditions.ts (casi seguro un texto con ' sin escapar). La reparación con Haiku lo arregló
  reescribiendo el archivo (1699 tokens). Candidato a arreglo sin IA, como el nombre de exportación.
- La IA rompe reglas: tocó `package.json` pese a la prohibición y añadió cosas que nadie pidió.
- Detectar cuando lo pedido YA EXISTE y decirlo. Ojo: rompe las pruebas sobre fixtures ya construidos; necesita
  fixtures vírgenes.
- Recomendaciones de Vertigo: el formulario publicado falla siempre, y además inserta con `status: approved`
  desde el navegador (se salta la moderación). La IA respondió dos veces "no encuentro errores".
- Precisión al atribuir las imágenes (créditos de Unsplash).
- Textos de las tablas en inglés dentro de un sitio en español.
- Huecos de la revisión de tipos: los cambios rápidos no pasan por ella, y `vite.config.ts` no se revisa.

## 4. Seguridad

- **Deep scan (S4):** botón opcional con IA en Ajustes → Seguridad. Avisa que gasta créditos y sólo sugiere,
  no bloquea. Las reglas fijas (S1), "Arreglar" (S2), el bloqueo al publicar (S3) y la prevención (S5) ya están
  hechos.
- Políticas duplicadas en `profiles` (DB principal): dos UPDATE y dos SELECT iguales. Borrarlas es DDL
  destructivo: exige la frase tecleada.
- `DatabaseOverview` muestra, dentro de un proyecto, la URL y el conteo de `profiles` de la DB PRINCIPAL.

## 5. Agentes de revisión (sin empezar, diseño en frío propio)

- **Protección contra regresiones:** comprobar que lo que funcionaba siga funcionando después de un cambio de la
  IA (hoy sólo se comprueba que compile).
- Agente de SEO del sitio publicado.
- Agente de velocidad (ya hay base en Ajustes → Analíticas).

## 6. Ideas sin diseño

- **Correos con la marca del sitio:** cuando alguien se registra o inicia sesión en un sitio generado, que le
  llegue un correo (confirmación, bienvenida, recuperar contraseña) con los colores, fuentes y logo de la página.
  Hoy salen con la plantilla genérica de Supabase. Ya existe: Wyrd configura el dominio en Supabase Auth al
  publicar, y la plataforma tiene servicio de correo.
- **"Prompt refiner":** hoy el equipo le da el PDF del cliente a Claude externo para sacar los prompts. Hacerlo
  dentro de Wyrd, como "skills", ANTES de crear el proyecto (pantalla propia o el modal sin proyecto). Para
  diseñarlo hace falta un PDF de ejemplo sin datos sensibles y el mensaje que hoy se usa.
- **Plugins a considerar (no instalar aún):** Taste Skill (probar con A/B dentro de la evaluación de la IA), Web
  design guidelines de Vercel (como revisión antes de publicar; cubre accesibilidad), Awesome Design (catálogo
  de puntos de partida, baja prioridad).

## 7. Cuando Wyrd sea público

- **Dominios, todo por Vercel** (el usuario nunca ve Vercel):
  - Fase 1, conectar un dominio propio: Wyrd lo agrega, muestra los registros DNS y avisa cuando queda activo.
  - Fase 2, comprar dominios: dejar listo el set up (método de pago en Vercel, cobrar al usuario antes de comprar,
    buscador con precio).
  - Al empezar: quitar el código viejo de Cloudflare (`/api/domains`, `DomainsPanel.tsx`).
- Quitar los botones "Próximamente" (Dictar, Comprar créditos). Se quedan mientras Samuel sea
  el único usuario: le sirven de recordatorio.

## 8. Al final de la cola

**Calidad de los sitios generados: diseño a medida + cumplimiento legal** (Samuel unió las dos).
- **Que no parezcan hechos con IA ni plantilla:** nada del aspecto shadcn "de siempre" (tarjetas, botones,
  bordes grises). Cada sitio debe verse hecho a medida para su marca. Es una queja real de la gente.
- **Cumplimiento legal** (quitar las causas comunes de demanda; ninguna lista hace un sitio "imposible" de
  demandar; las plantillas legales las revisa un abogado una vez):
  - Aviso de privacidad, incluido el mexicano con derechos ARCO, y términos y condiciones.
  - Aviso de cookies.
  - Declarar qué datos se recogen, qué terceros los recogen (analytics, pixels, Stripe…) y si el sitio usa IA.
  - Que el usuario pueda borrar lo que subió y su cuenta completa.
  - Datos de usuarios en almacenes privados.
  - Nada de testimonios falsos.
  - Cancelar no más difícil que suscribirse, y nada de renovación automática sin aviso.
  - Darse de baja en cada correo.
  - Precios finales con IVA e identidad del negocio (PROFECO).
  - Accesibilidad WCAG 2.1 AA.
  - Menores de 13 años si aplica.
  - Licencias de fotos y fuentes.
  - Avisos por giro (salud, finanzas).
  - IA del sitio con respuesta ante autolesiones.

  Falta decidir qué se genera solo, qué revisa el agente de seguridad y qué bloquea publicar.

## 9. Aparcado hasta después de lanzar

- Quitar el botón de aprobación cuando el guard RLS no pudo leer el SQL (`unparseable`; sin causa conocida).
- Auditoría del pipeline de publicación.
- **D-2:** aplicar SQL automático cuando sólo añade, y con frase tecleada cuando borra. ABSOLUTO ÚLTIMO.
- Análisis de Dyad, en un clon y con tiempo limitado. `src/pro` NO SE LEE.
- Rotar secretos: `ADMIN_BOOTSTRAP_SECRET`; ubicar la clave `sb_secret_` (equivale a service_role);
  `SUPABASE_MANAGEMENT_TOKEN` es un token con acceso total a la cuenta.
- Auditoría técnica externa de pago (un proveedor, no una sesión).

## 10. Sin confirmar (revisar si sigue vivo)

- Ruta `/api/admin/bootstrap-db` con comentario "TEMPORAL": se decidió conservarla y quitar el comentario.
- `graphify-out/`: ¿se commitean el caché y los `.sig`, o van a `.gitignore`? Hoy quedan sin commit en cada sesión.
- `graphifyy` en `dependencies` de `package.json`: ¿moverlo a devDependencies o quitarlo?
- Render: confirmar en el log de build `Using Node.js version 22.12.0`, sin la advertencia de Vite.
- Pantallas que se veían oscuras dentro de modales claros (contenido de varias pestañas de Ajustes y las 4 de
  inicio de sesión). Probablemente ya resuelto con el sistema visual minimalista (5.5); confirmar a ojo.
- G-3: el pase de contenido por la ruta de origen en renombrados no tiene prueba automática.

---

## Decisiones permanentes (no volver a discutir)

- **Preview:** el destino final son sandboxes en el servidor (estilo Lovable), cuando el software esté casi
  completo. Hoy: librerías curadas dentro del navegador.
- **Preview = publicado:** el sitio publicado se construye con el mismo motor de estilos que el preview, con las
  fuentes del DESIGN.md.
- **El sandbox del editor no se toca:** el login real sólo funciona en el sitio publicado.
- **Arquitectura de Nebu:** cada proyecto = sitio público + panel de admin con sesión SIEMPRE + a veces panel de
  cliente. "Con sesión" incluye clientes, así que leer los datos de todos sólo con tener sesión es una fuga.
- **Seguridad:** sólo lo GRAVE bloquea publicar. Los arreglos van como migraciones nuevas.
- **Llaves de servicios:** viven sólo en el servidor del proyecto. Wyrd no guarda copia ni vuelve a mostrar el
  valor. Las `SUPABASE_*` no se muestran.
- **Archivos y fotos:** en el almacén de Wyrd, no en el de cada proyecto. JPG/PNG se convierten a WebP.
- **Favicon:** se aplica al publicar; el código del proyecto no se toca.
- **Fotos adjuntas:** las lee una vez un lector (Haiku). NO se hará que todo el proceso vea la imagen: el lector
  quedó fiel.
- **Revisión de tipos al publicar:** la hace Vercel. Sin Render Starter: se queda el cómputo ya pagado.
- **Sin marcas de infraestructura:** sólo se nombra al proveedor cuando el usuario conecta SU cuenta (GitHub,
  Stripe).
- **Ventanas propias de Wyrd**, nunca los avisos del navegador (hay una prueba que lo vigila).
- **Avisos (toasts) de Wyrd** en blanco con rojo, separados de los del CRM.
- **Wyrd y Nebu Studio (CRM)** siguen separados.

## Hecho recientemente (una línea cada uno; el detalle está en git)

- 2026-10-08: nada corta un proceso a medias: todos los botones que cambian de pantalla avisan (busyRegistry),
  el navegador pregunta al cerrar, y botón "Descartar cambios" en Código.
- 2026-10-08: barra del chat de varias líneas (Enter envía, Shift+Enter salto); "Chat" desde Código/Ajustes
  vuelve al preview.
- 2026-10-08: tarjeta de progreso por etapas reales con frase propia del pedido; tablas de verdad, texto limpio en
  la tarjeta pequeña y respuestas sin emojis.
- 2026-10-08: modo Chat (sólo responde); las respuestas usan las copias guardadas y no prometen acciones.
- 2026-10-08: la IA sabe que ve las fotos y PDFs del proyecto; Unsplash "download" sólo por fotos usadas.
- 2026-10-08: reusar archivos ya leídos (Elegir de Archivos, sin volver a pagar); menús de la barra visibles.
- 2026-10-08: PDFs privados por defecto (la IA los lee con dirección temporal).
- 2026-10-08: ventanas de confirmación propias en vez de los avisos del navegador.
- 2026-10-08: llaves "como Lovable" (tarjeta en el chat + Ajustes → Secretos rehecho; el panel viejo nunca
  mandaba las llaves al proyecto).
- 2026-10-07: adjuntos en el chat (la IA mira las fotos y copia los PDFs, una vez por mensaje).
- 2026-10-06: favicon propio desde Publicar.
- 2026-10-05: archivos del proyecto (subir fotos y documentos; la IA los conoce).
- 2026-10-05: preview igual al publicado; sin marcas de infraestructura en Ajustes.
- 2026-10-01 a 05: agente de seguridad S1, S2, S3 y S5 (chequeo, "Arreglar", bloqueo al publicar, guardias de
  datos personales y regla 9).
- 2026-09-29 a 10-01: publicar en Vercel funciona, con la revisión de tipos y "Arreglar ahora".
- Septiembre: guards RLS / DDL / borrados / código de cliente (G-3 a G-6), rediseño del chat y del navbar,
  sistema visual minimalista, velocidad del carril simple y búsqueda de archivos (la IA ya encuentra los
  archivos que existen).
