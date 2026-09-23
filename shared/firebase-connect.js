/* ══════════════════════════════════════════════════════════════
   CONECTOR GENÉRICO DE FIREBASE — para cualquier invitación de este
   repo (proyecto "siempre-invitados", Realtime Database, SDK compat).

   Qué hace: conecta con Firebase una sola vez y expone un helper para
   contar visitas. Si Firebase no está disponible por lo que sea (CDN
   bloqueado, config no cargó, etc.) todo queda en no-op y el sitio
   sigue funcionando igual — mismo criterio de resiliencia que ya usaba
   mi-bautizo/miguel-sebastian/app.js.

   Cómo usarlo desde un proyecto nuevo: ver README.md en la raíz del
   repo (sección "Cómo conectar un proyecto nuevo").

   Requiere, cargados ANTES que este archivo, en este orden:
     1. <script src="/shared/firebase-config.js"></script>
        (sin defer, primero de todos — define window.firebaseConfig)
     2. firebase-app-compat.js y firebase-database-compat.js (defer)
   ══════════════════════════════════════════════════════════════ */
window.SIFirebase = (function () {
    let db = null;
    try {
        if (typeof firebase !== 'undefined' && typeof window.firebaseConfig !== 'undefined') {
            const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.firebaseConfig);
            db = firebase.database(app);
        }
    } catch (e) { /* sin Firebase — el sitio sigue funcionando, solo sin persistencia */ }

    /* Cuenta una visita para invitationId, una sola vez por navegador
       (flag propio en localStorage, con el id como prefijo para que no
       choque entre invitaciones distintas que comparten origen). */
    function trackVisit(invitationId) {
        if (!db || !invitationId) return;
        const key = 'visita_' + invitationId;
        try {
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, '1');
        } catch (e) { /* localStorage bloqueado (modo privado, etc.) */ }
        db.ref(`invitations/${invitationId}/contadores/visitas`).transaction(c => (c || 0) + 1);
    }

    return { db, trackVisit };
})();
