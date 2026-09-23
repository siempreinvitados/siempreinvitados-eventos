/* Plantilla de shared/firebase-config.js (proyecto "siempre-invitados").
   Ese archivo NO se commitea (ver .gitignore) — en producción lo genera el
   build command del proyecto en Cloudflare (Workers & Pages → Settings →
   Build), interpolando variables de entorno/secrets configuradas ahí
   mismo. Ver README.md, sección "Conector genérico de Firebase", para el
   detalle completo.

   Para correr algún sitio de este repo en local, copia este archivo a
   shared/firebase-config.js y llena los valores reales. Si no lo creas,
   el sitio sigue funcionando igual (sin contador de visitas ni RSVP con
   persistencia — el RSVP por WhatsApp, donde aplique, sigue andando)
   gracias al try/catch de cada app.js / de shared/firebase-connect.js. */
window.firebaseConfig = {
    apiKey: "EDITA-ME",
    authDomain: "EDITA-ME",
    databaseURL: "EDITA-ME",
    projectId: "EDITA-ME",
    storageBucket: "EDITA-ME",
    messagingSenderId: "EDITA-ME",
    appId: "EDITA-ME",
    measurementId: "EDITA-ME",
};
