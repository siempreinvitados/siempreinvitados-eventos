# Siempre Invitados — sitio de invitaciones

Repo con varias invitaciones web (una por carpeta, ej. `mi-bautizo/miguel-sebastian/`,
`eventos/maestria/`) más un panel de administración en `admin/`. Es un
sitio 100% estático: `wrangler.toml` (`[assets] directory = "."`) le
dice a Cloudflare que sirva todo el repo tal cual, sin build. Cualquier
archivo que commiteas queda disponible en esa misma ruta en producción
— no hace falta configurar nada extra para que un archivo nuevo se
despliegue.

## Conector genérico de Firebase (`shared/firebase-connect.js`)

### En pocas palabras

Cada invitación puede llevar un contador de "cuántas personas abrieron
este link". Ese contador vive en Firebase. En vez de que cada
invitación nueva reinvente el mismo pedazo de código para conectarse a
Firebase, hay un solo archivo compartido (`shared/firebase-connect.js`)
que ya sabe conectarse y cuenta la visita con una sola función.

Si Firebase no está disponible por lo que sea (config no cargó, CDN
bloqueado, etc.), la invitación sigue funcionando normal — simplemente
no se cuenta esa visita.

### Cómo funciona (técnico)

Dos archivos separados, cada uno con un trabajo distinto:

1. **`shared/firebase-config.js`** — las credenciales reales del
   proyecto de Firebase ("siempre-invitados"). **No está en git** (ver
   `.gitignore`); en producción lo genera el *build command* configurado
   en el proyecto de Cloudflare (Workers & Pages → el proyecto
   `siempreinvitados-eventos` → Settings → Build), no un workflow de
   este repo. Ese comando interpola variables de entorno/secrets del
   propio proyecto de Cloudflare y escribe el archivo antes de cada
   deploy:

   ```bash
   mkdir -p shared && printf 'window.firebaseConfig = {\n  apiKey: "%s",\n  authDomain: "%s",\n  databaseURL: "%s",\n  projectId: "%s",\n  storageBucket: "%s",\n  messagingSenderId: "%s",\n  appId: "%s",\n  measurementId: "%s",\n};\n' "$FIREBASE_API_KEY" "$FIREBASE_AUTH_DOMAIN" "$FIREBASE_DATABASE_URL" "$FIREBASE_PROJECT_ID" "$FIREBASE_STORAGE_BUCKET" "$FIREBASE_MESSAGING_SENDER_ID" "$FIREBASE_APP_ID" "$FIREBASE_MEASUREMENT_ID" > shared/firebase-config.js
   ```

   (Antes vivía en `mi-bautizo/shared/firebase-config.js` — históricamente
   bautizo fue la primera invitación con Firebase. Se movió a la raíz al
   generalizar el conector, y el build command de Cloudflare se
   actualizó junto con esto. Antes de eso, un workflow de GitHub Actions
   —`​.github/workflows/deploy.yml`, borrado en el commit `0ada4bd`—
   hacía este mismo paso desde GitHub Secrets; se dejó de usar cuando se
   conectó Cloudflare directo al repo.)

   Define un solo global: `window.firebaseConfig = {...}`.

   ⚠️ **Checklist para que este cambio de ruta no rompa nada al
   desplegar:** (1) actualizar el build command en el dashboard de
   Cloudflare a la versión de arriba (escribe en `shared/`, ya no en
   `mi-bautizo/shared/`) — guardarlo ahí no dispara un deploy por sí
   solo; (2) recién después, hacer push a `main` con los cambios de este
   repo (que ya apuntan todos a `/shared/firebase-config.js`), para que
   el build actualizado y el código actualizado lleguen juntos en el
   mismo deploy. Si se hace al revés (push antes que el build command),
   bautizo y admin se quedan sin Firebase hasta que se actualice el
   build command.

2. **`shared/firebase-connect.js`** (el módulo genérico, nuevo, sí está
   en git) — toma ese `window.firebaseConfig`, inicializa Firebase una
   sola vez, y expone:

   ```js
   window.SIFirebase = {
     db,                    // instancia de Realtime Database (o null si no conectó)
     trackVisit(invitationId) // cuenta una visita, una vez por navegador
   }
   ```

   `trackVisit` escribe en `invitations/{invitationId}/contadores/visitas`
   — la misma estructura de datos que ya usa `mi-bautizo/miguel-sebastian`,
   así que el panel `admin/` la descubre automáticamente (lee el nodo
   `invitations/` completo, sin registro ni configuración por evento).

### Cómo conectar un proyecto nuevo

En el `<head>` de tu `index.html`, agrega esto (en este orden — el
config va sin `defer` y primero de todos, el resto sí lleva `defer`):

```html
<script src="/shared/firebase-config.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js" defer></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js" defer></script>
<script src="/shared/firebase-connect.js" defer></script>
```

Las rutas empiezan con `/` (absolutas) para que funcionen sin importar
qué tan anidada esté tu carpeta.

Si tu script principal va al final del `<body>`, asegúrate de que
también tenga `defer` (si no, puede ejecutarse *antes* de que
`shared/firebase-connect.js` termine de cargar):

```html
<script src="script.js" defer></script>
```

Y en tu JS, cuenta la visita con un id propio (corto, no adivinable,
que no choque con los que ya existen — ver lista abajo):

```js
const INVITATION_ID = 'tu-id-aqui';
window.SIFirebase && window.SIFirebase.trackVisit(INVITATION_ID);
```

Eso es todo — no hace falta tocar `wrangler.toml` ni ningún otro
archivo de configuración para que esto se despliegue.

### IDs de invitación en uso (no reutilizar)

| Id | Proyecto | Usa el conector genérico |
|---|---|---|
| `5vu4o` | `mi-bautizo/miguel-sebastian` | No — tiene su propio bloque en `app.js` (ver abajo) |
| `we6wn` | `eventos/maestria` | Sí |

### Por qué `mi-bautizo/miguel-sebastian` no usa este módulo

Esa invitación ya está en producción con visitantes reales. Su
`app.js` mezcla el contador de visitas con todo el flujo de RSVP
(confirmación de asistencia) usando el mismo `db` e `INVITATION_ID` en
varios lugares. Migrarla hoy a `shared/firebase-connect.js` significa
tocar una página viva sin ningún beneficio visible para quien la
recibe — así que su lógica (`app.js`) se dejó tal cual. Es un candidato
válido para migrar más adelante, como un cambio aislado y probado
aparte, no junto con otro trabajo.

Sí se actualizó, en cambio, la única línea de su `index.html` que carga
el config (`../shared/firebase-config.js` → `/shared/firebase-config.js`),
porque el archivo real se movió de sitio — sin ese cambio, bautizo se
hubiera quedado sin Firebase en cuanto el build command de Cloudflare
dejara de escribir en la ruta vieja. Lo mismo aplica a `admin/index.html`,
que también carga este config directo (además del legacy de
`bautizo-sofia`, que sigue viviendo en `mi-bautizo/shared/` sin cambios).

### Si más adelante un proyecto necesita RSVP completo (no solo contador)

`shared/firebase-connect.js` expone `window.SIFirebase.db` (la
instancia cruda de la base) además de `trackVisit`. La lógica de RSVP
completa (formulario, edición, contadores de confirmados/no
confirmados) no está en este módulo — vivía en
`mi-bautizo/miguel-sebastian/app.js` (líneas ~380-543) y es bastante
más grande (UI de stepper, validaciones, etc.). Si se necesita en otro
proyecto, se puede portar ese bloque reutilizando `SIFirebase.db` en
vez de reinicializar Firebase de cero.
