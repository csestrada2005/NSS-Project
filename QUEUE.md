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

1. **PDFs fuera del almacén público — HECHO Y CONFIRMADO (check de Samuel 2026-10-08: subir privado, Ver, hacer público/privado y lectura de la IA con dirección temporal, todo OK).** Decisión de Samuel: privado por
   defecto, con opción de hacerlo público. Los PDFs nuevos van al almacén privado `project-documents` (el
   servidor lo crea solo la primera vez); un PDF privado tiene `public_url` vacío. La IA lo lee con una dirección
   que caduca en 10 minutos y nunca recibe un enlace para ponerlo en el sitio. En Archivos: "Privado · sólo la IA
   lo lee" con "Ver", y "Hacer público" / "Hacer privado" (mueve el archivo de almacén, con confirmación). No había
   PDFs viejos que mover (Samuel borró el único).
2. **Reusar archivos ya leídos — HECHO Y CONFIRMADO (check de Samuel 2026-10-08: PDF nuevo → "lectura guardada",
   elegido de Archivos → "Ya leído" y `reusados (sin costo): 1` sin lector de Haiku, foto vieja leída y guardada).
   Arreglo de paso: los menús de la barra (clip y Automático/Plan) no se veían desde el 2026-10-01 porque la
   columna de la barra recortaba; ya no recorta (confirmado).** Decisiones de Samuel: 1A elegir de
   Archivos al adjuntar + 2A copia guardada en el almacén privado + bonus (también fotos). El clip ofrece "Subir
   archivo nuevo" o "Elegir de Archivos". La primera vez que la IA lee un PDF o mira una foto, guarda lo que
   entendió en `project-documents/readings/<proyecto>/<archivo>.json` (siempre privado, aunque el archivo sea
   público; se borra junto con el archivo). Si eliges de Archivos algo ya leído, la ficha dice "Ya leído · no gasta
   créditos" y no se vuelve a leer. El almacén privado ahora acepta también esas copias (JSON).

## 2. Producto (lo que ve el usuario)

- **"Editar el plan"**: el botón de la tarjeta "Plan listo" sigue en "Próximamente". Samuel lo quiere
  funcional; sin prioridad fija. Cómo debe funcionar (Samuel, 2026-10-08): un botón "Revisar" abre el plan en
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
- **Modo "Chat" — HECHO Y CONFIRMADO (check de Samuel 2026-10-08: pedido de construir en Chat → sólo respuesta,
  una línea de Sonnet sin clasificador; sugerencia → Automático y construyó; el modo se recuerda).**
  Detalle visto en el check: en Chat la IA dijo "Dame un momento — voy a revisar el archivo…", una promesa que
  en ese modo no puede cumplir. Arreglado y CONFIRMADO: las respuestas ya no prometen acciones.
- **Respuestas que usan lo ya leído — HECHO Y CONFIRMADO (check de Samuel 2026-10-08: en Chat y en Automático
  dio los 9 precios reales del PDF sin adjuntarlo).** Detalle visto: dijo "para confirmar si src/data/pricing.ts
  tiene estos valores, dime si ves alguna diferencia": la respuesta sólo recibe los 2 archivos que parecen más
  relevantes y pricing.ts no entró, así que no pudo comparar sola. Movido a sección 3. Al contestar
  (Chat y preguntas en Automático), si la pregunta nombra un archivo o habla de "el PDF" / "la foto", la IA
  recibe la copia guardada de lo que ya leyó, sin adjuntarlo y sin volver a pagar la lectura
  (src/utils/savedReadings.js; tope 20.000 caracteres por archivo y 40.000 en total). Si nunca lo leyó, pide
  adjuntarlo con el clip. Siguiente paso posible: lo mismo cuando construye. Tercera opción del menú (Automático / Plan / Chat): la IA
  SÓLO responde. Ni se clasifica el pedido: va directo al carril de preguntas, que no escribe archivos (tampoco
  corren los atajos viejos "build a…", "plan:"). Los botones de arreglo siguen arreglando. Decisión B1 de Samuel:
  en modo Chat, el botón de la sugerencia de la IA cambia a Automático y la construye. El modo se recuerda en
  la pestaña (`forge_send_mode`; migra el viejo `forge_plan_mode`) y el historial marca "chat".
- **Barra que crece hacia abajo (Samuel, 2026-10-08):** si el texto es largo, la barra del chat crece (como en
  otras IAs) hasta un tope, para poder revisar y editar textos largos antes de enviarlos.
- **Botón "Chat" con cambios pendientes (Samuel, 2026-10-08):** desde Código o Ajustes, "Chat" vuelve al preview.
  Pero si hay algo a medias, no cambia y sale el aviso de abajo a la derecha según el caso: "aplica o descarta
  los cambios de código primero", "espera a que la publicación termine", "espera a que el chequeo de seguridad
  termine", etc. (revisar todos los casos).
- **Progreso más reactivo — HECHO, espera check (2026-10-08, P2 de Samuel).** La tarjeta sigue las etapas
  reales: "Leyendo menu.pdf…" → "Entendiendo tu pedido…" → la frase que escribe el clasificador en la misma
  llamada ("Analizando si la foto sirve para la página…", campo status_line) → título "Pensando la respuesta" si
  es pregunta / pasos del plan si es cambio → "Revisando que todo funcione…". Ya no aparece "Trabajando en tu
  pedido". Incluye el viejo pendiente "Planeando"/"Trabajando" mientras piensa una PREGUNTA.
  Check de Samuel 2026-10-08: frases y etapas OK en las 4 pruebas. Arreglado tras el check: (a) la IA copiaba
  literalmente los ejemplos de la instrucción ("Analizando si la foto sirve para la página"); ahora los ejemplos
  son de otros temas y debe nombrar lo concreto del pedido; (b) la tarjeta pequeña en reposo mostraba el markdown
  en crudo (**, tablas): ahora muestra texto limpio (src/utils/markdownPreview.js). Check 2026-10-08: el título pasa de
  "Trabajando" a "Pensando la respuesta" (CONFIRMADO) y la frase ya es propia ("Analizando la coherencia visual de
  la imagen del hero…", "Mostrando los precios del PDF en formato tabla…"). PENDIENTE: las TABLAS siguen en
  crudo en la tarjeta de respuesta y en el historial: MiniMarkdown no sabe dibujar tablas.
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
- **La IA dice que no puede ver archivos (2026-10-08) — HECHO Y CONFIRMADO (Samuel: responde "sí puedo ver tus fotos", nombra las de
  Archivos, ofrece clip y Unsplash):** las respuestas ahora reciben la
  lista de Archivos y la regla "sí ves las fotos y PDFs; si falta una, adjúntala con el clip o elígela de
  Archivos" (Unsplash sigue siendo opción válida). Antes: a "Sube la foto correcta…" respondió "No tengo acceso
  a archivos subidos… comparte un enlace de Google Drive o busco en Unsplash". Falso: Wyrd sí le da las fotos y
  PDFs del proyecto (Archivos y adjuntos). Debe saberlo y ofrecerlo ("adjúntala con el clip o elígela de Archivos").
- **Reparación que deja la sección rota (Vertigo, 2026-10-08) — HECHO (2A); sin check manual (no se puede provocar a
  voluntad): Samuel avisa si vuelve a ver una sección rota tras reparar:** este error ahora se
  arregla sin IA, con una línea al final del archivo (`src/utils/exportShapeFix.js`, consola
  `[Verifier] arreglo sin IA: …`). Los demás errores siguen yendo al modelo (2B "detector de destrozos" no se
  hizo). Antes: al cambiar la sección de precios, el Verifier
  dio `No matching export in PricingSection.tsx for import "PricingSection"` (exportación con otro nombre); la
  reparación de Haiku reescribió PricingSection y compiló, pero la sección quedó sin estilos y se ve rota. La
  reparación debe arreglar el nombre de la exportación, no reescribir el archivo.
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
- Quitar los botones "Próximamente" (Dictar, Editar el plan, Comprar créditos). Se quedan mientras Samuel sea
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
