/* Plantilla de mi-bautizo/shared/firebase-config.js (proyecto "siempre-invitados").
   Ese archivo NO se commitea (ver .gitignore) — en producción lo genera
   .github/workflows/deploy.yml a partir de GitHub Secrets, y lo sube junto
   con el resto del sitio a Cloudflare Pages. Para correr algún sitio de
   mi-bautizo/ en local, copia este archivo a mi-bautizo/shared/firebase-config.js
   y llena los valores reales. Si no lo creas, el sitio sigue funcionando
   igual (RSVP solo por WhatsApp, sin contador ni persistencia) gracias al
   try/catch de cada app.js. */
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
