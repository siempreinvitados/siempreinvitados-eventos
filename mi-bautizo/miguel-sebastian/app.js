/* ══════════════════════════════════════════════════════════════
   CONSTANTES DE CONTENIDO — EDITA AQUÍ
   El resto del texto (nombre, fecha, misa, recepción, dedicatoria)
   vive directamente en index.html — busca "EDITA" en ese archivo.
   ══════════════════════════════════════════════════════════════ */

/* Fecha y hora del evento (usada por la cuenta regresiva y el calendario) */
/* hora de llegada/recepción (1:30 pm) — es la que le importa al
   invitado para saber cuándo estar ahí; la misa (2:00 pm) es en el
   mismo lugar, media hora después */
const EVENT_DATE = new Date('2026-10-17T13:30:00');
const EVENT_TITLE = 'Bautizo de Miguel Sebastián';
const EVENT_LOCATION = 'Finca Santa Isabel, Tepotzotlán';

/* ══════════════════════════════════════════════════════════════
   FIREBASE — contador de visitas + registro de confirmaciones RSVP
   Mecánica igual a gali/app.js (SDK compat, transactions), estructura
   de datos nueva de README.md: invitations/{id}/contadores/...
   El config (proyecto "siempre-invitados") viene de
   shared/firebase-config.js — ver README.md para el porqué de
   window.firebaseConfig en vez de un objeto inline aquí.
   ══════════════════════════════════════════════════════════════ */
const INVITATION_ID = '5vu4o';
let db = null;
try {
    if (typeof firebase !== 'undefined' && typeof window.firebaseConfig !== 'undefined') {
        firebase.initializeApp(window.firebaseConfig);
        db = firebase.database();
    }
} catch (e) { /* sin Firebase (shared/firebase-config.js no cargó, CDN bloqueado, etc.) — el sitio sigue funcionando, solo sin persistencia */ }



/* Contador de visitas: una sola vez por navegador (bandera propia en
   localStorage, con prefijo del sitio — gali usa la clave 'visita' sin
   prefijo, y como todos los sitios comparten origen en GitHub Pages
   (siempreinvitados.github.io, solo cambia la subruta), localStorage se
   comparte entre ellos; sin el prefijo, alguien que ya visitó gali nunca
   contaría aquí) */
(function () {
    if (db && !localStorage.getItem('visita_5vu4o')) {
        localStorage.setItem('visita_5vu4o', '1');
        db.ref(`invitations/${INVITATION_ID}/contadores/visitas`).transaction(c => (c || 0) + 1);
    }
})();

/* Galería: foto1-5 son de muestra (bebés en exteriores, uso libre, para
   que el borrador se vea completo) — reemplázalas con las reales cuando
   las tengas, mismos nombres de archivo. Mientras un archivo no exista,
   se muestra el emoji de reemplazo. */
const galleryImages = [
    { url: './resources/gallery/foto1.jpg?v=1', emoji: '🧸' },
    { url: './resources/gallery/foto2.jpg?v=1', emoji: '🤍' },
    { url: './resources/gallery/foto3.jpg?v=1', emoji: '🩵' },
    { url: './resources/gallery/foto4.jpg?v=1', emoji: '⭐' },
    { url: './resources/gallery/foto5.jpg?v=1', emoji: '⭐' },
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══════════════════════════════════════════════════════════════
   GALERÍA — grid con reemplazo automático por emoji si falta la foto
   ══════════════════════════════════════════════════════════════ */
function buildGalleryGrid(containerId, images) {
    const grid = document.getElementById(containerId);
    images.forEach(img => {
        const cell = document.createElement('div');
        cell.className = 'gal-cell';
        const el = document.createElement('img');
        el.src = img.url;
        el.alt = 'Foto de la galería';
        el.loading = 'lazy';
        el.draggable = false;
        el.onerror = function () {
            cell.innerHTML = `<div class="gal-cell-placeholder">${img.emoji}</div>`;
        };
        cell.appendChild(el);
        grid.appendChild(cell);
    });
}
buildGalleryGrid('galleryGrid', galleryImages);

/* ══════════════════════════════════════════════════════════════
   TEXTO LETRA POR LETRA — separa en <span class="word"><span class="char">
   Los espacios entre palabras quedan como texto plano para que el
   navegador siga partiendo línea normalmente en pantallas angostas.
   ══════════════════════════════════════════════════════════════ */
function splitToChars(el) {
    const text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    const words = text.split(' ');
    words.forEach((word, i) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        [...word].forEach(ch => {
            const c = document.createElement('span');
            c.className = 'char';
            c.textContent = ch;
            wordSpan.appendChild(c);
        });
        el.appendChild(wordSpan);
        if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return el.querySelectorAll('.char');
}

/* ══════════════════════════════════════════════════════════════
   ANIMACIONES POR PANTALLA (GSAP, con respaldo si el CDN falla)
   ══════════════════════════════════════════════════════════════ */
let playScreen1, playScreen2, playScreen3, playScreenCD, playScreenRSVP, playScreen4, playScreen5;

try {
    if (typeof gsap === 'undefined') throw new Error('GSAP no disponible');

    /* marco_a/marco_b de portada: a diferencia de todo lo demás en esta
       pantalla (que se repite cada vez que se vuelve a ver), los marcos
       solo deben animar la PRIMERA vez que se muestra la portada */
    let portadaMarcoPlayed = false;
    /* referencia a la timeline de la galería, para poder matarla si el
       usuario vuelve a entrar a screen-galeria mientras aún corre */
    let galleryTl = null;

    playScreen1 = function (section) {
        if (reduceMotion) { gsap.set(section.querySelectorAll('*'), { opacity: 1, scale: 1 }); return; }
        const lines = ['.p1-eyebrow', '.p1-title', '.p1-subtitle']
            .map(sel => splitToChars(section.querySelector(sel)));
        const marco = section.querySelectorAll('.deco-marco');
        const bow = section.querySelector('.deco-bow');
        gsap.set([].concat(...lines.map(l => [...l])), { opacity: 0, scale: .3 });
        gsap.set(section.querySelector('.p1-name'), { opacity: 0, scale: .6 });
        gsap.set(bow, { opacity: 0, scale: .8 });
        gsap.set(section.querySelector('.p1-mascot'), { opacity: 0, scale: .7 });
        if (!portadaMarcoPlayed) gsap.set(marco, { opacity: 0, scale: .8 });

        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        if (!portadaMarcoPlayed) {
            tl.to(marco, { opacity: .85, scale: 1, duration: .9, stagger: .12 }, 0);
            portadaMarcoPlayed = true;
        }
        tl.to(bow, { opacity: .85, scale: 1, duration: .9 }, 0)
            .to(section.querySelector('.p1-mascot'),
                { opacity: 1, scale: 1, duration: .9 }, .15);

        /* el texto arranca mientras decos/oso aún terminan de aparecer (no
           espera a que acaben) y cada bloque usa una posición absoluta en
           vez de encadenarse "+=" al anterior, para que 4 bloques de texto
           letra-por-letra no se sumen a 5-6s de animación total */
        let cursor = .3;
        const lineDur = .34, lineStagger = .018, groupGap = .04;
        lines.forEach(chars => {
            tl.to(chars, { opacity: 1, scale: 1, duration: lineDur, stagger: lineStagger, ease: 'back.out(1.6)' }, cursor);
            cursor += lineDur + lineStagger * Math.max(chars.length - 1, 0) + groupGap;
        });
        tl.to(section.querySelector('.p1-name'),
            { opacity: 1, scale: 1, duration: .55, ease: 'back.out(1.4)' }, cursor + groupGap);
    };

    playScreen2 = function (section) {
        const lines = section.querySelectorAll('.ded-line');
        const decos = section.querySelectorAll('.deco-bow');
        const mascot = section.querySelector('.p2-mascot');
        if (reduceMotion) { gsap.set([...lines, ...decos, mascot], { opacity: 1, x: 0, scale: 1 }); return; }
        gsap.set(lines, { opacity: 0, x: -60 });
        gsap.set(decos, { opacity: 0, scale: .85 });
        gsap.set(mascot, { opacity: 0, scale: .8 });
        gsap.timeline({ defaults: { ease: 'power2.out' } })
            .to(decos, { opacity: .85, scale: 1, duration: 1, stagger: .15 }, 0)
            .to(lines, { opacity: 1, x: 0, duration: .85, stagger: .35 }, .3)
            .to(mascot, { opacity: 1, scale: 1, duration: .9 }, '-=0.3');
    };

    playScreen3 = function (section) {
        const items = section.querySelectorAll('.ev3-reveal');
        const lines = section.querySelectorAll('.silver-line');
        if (reduceMotion) { gsap.set([...items, ...lines], { opacity: 1, y: 0, scale: 1, scaleX: 1 }); return; }
        gsap.set(items, { opacity: 0, y: 40 });
        gsap.set(lines, { opacity: 0, scaleX: 0 });
        gsap.timeline({ defaults: { ease: 'power2.out' } })
            .to(lines, { opacity: 1, scaleX: 1, duration: 1 }, .1)
            .to(items, { opacity: 1, y: 0, duration: .8, stagger: .22 }, .2);
    };

    playScreenCD = function (section) {
        const items = section.querySelectorAll('.cd-reveal');
        if (reduceMotion) { gsap.set(items, { opacity: 1, y: 0, scale: 1 }); return; }
        gsap.set(items, { opacity: 0, y: 40 });
        gsap.timeline({ defaults: { ease: 'power2.out' } })
            .to(items, { opacity: 1, y: 0, duration: .8, stagger: .22 }, .2);
    };

    playScreenRSVP = function (section) {
        const items = section.querySelectorAll('.rsvp-reveal');
        if (reduceMotion) { gsap.set(items, { opacity: 1, y: 0, scale: 1 }); return; }
        gsap.set(items, { opacity: 0, y: 40 });
        gsap.timeline({ defaults: { ease: 'power2.out' } })
            .to(items, { opacity: 1, y: 0, duration: .8, stagger: .22 }, .2);
    };

    playScreen4 = function (section) {
        const heading = section.querySelector('.p4-heading');
        const cells = section.querySelectorAll('.gal-cell');
        const replayBtn = section.querySelector('.btn-replay');
        /* si la secuencia anterior (de una visita previa a esta pantalla)
           seguía corriendo, hay que matarla antes de resetear — si no,
           la timeline vieja sigue tocando .opacity/.scale de las mismas
           celdas al mismo tiempo que la nueva, y se pisan entre sí */
        if (galleryTl) galleryTl.kill();
        if (replayBtn) replayBtn.classList.remove('is-visible');
        /* la rotación/desplazamiento de reposo de cada foto vive en CSS
           (.gal-cell:nth-child), no aquí — así se preservan siempre,
           tanto con reduceMotion como durante la animación normal */
        if (reduceMotion) {
            gsap.set(heading, { opacity: 1, y: 0 });
            gsap.set(cells, { opacity: 1, scale: 1 });
            if (replayBtn) replayBtn.classList.add('is-visible');
            return;
        }
        gsap.set(heading, { opacity: 0, y: 30 });
        /* todas arrancan grandes, invisibles y en el centro (GSAP
           decompone el transform que ya puso el CSS la primera vez que
           toca el elemento, así que cada rotación/desplazamiento propio
           se mantiene intacto mientras solo animamos scale+opacity);
           el stagger hace que se vayan "apilando" una tras otra */
        gsap.set(cells, { opacity: 0, scale: 2.2 });
        /* el onComplete va en la timeline (no en el .to(cells,...) de
           adentro): un onComplete puesto directo en una tween con
           stagger se dispara una vez POR CADA elemento, no al final */
        galleryTl = gsap.timeline({
            defaults: { ease: 'power2.out' },
            onComplete: () => { if (replayBtn) replayBtn.classList.add('is-visible'); },
        })
            .to(heading, { opacity: 1, y: 0, duration: .8 }, 0)
            .to(cells, { opacity: 1, scale: 1, duration: 1.6, stagger: 2, ease: 'power3.out' }, .3);
    };

    playScreen5 = function (section) {
        const mascot = section.querySelector('.p5-mascot');
        const title = section.querySelector('.p5-title');
        const bow = section.querySelector('.bow-bottom');
        if (reduceMotion) { gsap.set([mascot, title, bow], { opacity: 1, scale: 1 }); return; }
        gsap.set(mascot, { opacity: 0, scale: .8 });
        gsap.set(title, { opacity: 0, scale: .7 });
        gsap.set(bow, { opacity: 0, scale: .8 });
        gsap.timeline({ defaults: { ease: 'power2.out' } })
            .to(mascot, { opacity: 1, scale: 1, duration: .9 }, .2)
            .to(title, { opacity: 1, scale: 1, duration: .9, ease: 'back.out(1.4)' }, .6)
            .to(bow, { opacity: 1, scale: 1, duration: .7 }, .9);
    };
} catch (e) {
    /* Respaldo: si GSAP no carga, deja todo el contenido visible sin animar */
    const fallback = fn => (section) => {
        section.querySelectorAll('.p1-eyebrow,.p1-title,.p1-subtitle,.p1-name,.ded-line,.ev3-reveal,.cd-reveal,.rsvp-reveal,.gal-cell,.p4-heading,.p5-title,.deco-marco,.deco-bow,.p1-mascot,.p2-mascot,.p5-mascot,.silver-line')
            .forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; });
    };
    playScreen1 = playScreen2 = playScreen3 = playScreenCD = playScreenRSVP = playScreen4 = playScreen5 = fallback();
}

/* ══════════════════════════════════════════════════════════════
   OBSERVADOR DE PANTALLAS — dispara cada animación cada vez que la
   pantalla vuelve a quedar visible (no solo la primera vez); como
   IntersectionObserver solo llama al callback al CRUZAR el umbral,
   esto ya alcanza para detectar cada "entrada" sin necesitar un
   Set de control ni unobserve()
   ══════════════════════════════════════════════════════════════ */
const screenPlayers = {
    'screen-portada': () => playScreen1(document.getElementById('screen-portada')),
    'screen-dedicatoria': () => playScreen2(document.getElementById('screen-dedicatoria')),
    'screen-evento': () => playScreen3(document.getElementById('screen-evento')),
    'screen-cuenta': () => playScreenCD(document.getElementById('screen-cuenta')),
    'screen-galeria': () => playScreen4(document.getElementById('screen-galeria')),
    'screen-rsvp': () => playScreenRSVP(document.getElementById('screen-rsvp')),
    'screen-despedida': () => playScreen5(document.getElementById('screen-despedida')),
};

const snapContainer = document.getElementById('snap-container');

/* si el navegador no tiene IntersectionObserver (Safari viejo, Android
   muy viejo/UC Browser/Opera Mini), no hay forma de detectar qué
   pantalla está visible — en vez de dejar tronar el resto del script,
   se revela todo de una vez sin animación */
if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                if (screenPlayers[entry.target.id]) screenPlayers[entry.target.id]();
            }
        });
    }, { root: snapContainer, threshold: 0.5 });

    document.querySelectorAll('.screen').forEach(el => io.observe(el));
} else {
    Object.keys(screenPlayers).forEach(id => screenPlayers[id]());
}

/* ══════════════════════════════════════════════════════════════
   PISTA "DESLIZA" — se oculta únicamente cuando el usuario desliza
   ══════════════════════════════════════════════════════════════ */
const scrollHint = document.getElementById('scrollHint');
let hintDismissed = false;
function dismissHint() {
    if (hintDismissed) return;
    hintDismissed = true;
    scrollHint.classList.add('is-hidden');
}
snapContainer.addEventListener('scroll', dismissHint, { once: true, passive: true });

/* ══════════════════════════════════════════════════════════════
   CUENTA REGRESIVA — corre siempre desde que carga la página, sin
   esperar a que la pantalla sea visible ni depender de GSAP
   ══════════════════════════════════════════════════════════════ */
function updateCd() {
    const now = new Date();
    let diff = Math.max(0, EVENT_DATE - now);
    const d = Math.floor(diff / 864e5); diff %= 864e5;
    const h = Math.floor(diff / 36e5); diff %= 36e5;
    const m = Math.floor(diff / 6e4); diff %= 6e4;
    const s = Math.floor(diff / 1e3);
    document.getElementById('cd-d').textContent = String(d).padStart(2, '0');
    document.getElementById('cd-h').textContent = String(h).padStart(2, '0');
    document.getElementById('cd-m').textContent = String(m).padStart(2, '0');
    document.getElementById('cd-s').textContent = String(s).padStart(2, '0');
}
updateCd();
setInterval(updateCd, 1000);

/* ══════════════════════════════════════════════════════════════
   GALERÍA — botón "ver otra vez": vuelve a correr playScreen4 desde
   cero, sin depender de scroll ni del observador
   ══════════════════════════════════════════════════════════════ */
function replayGallery() {
    playScreen4(document.getElementById('screen-galeria'));
}

/* ══════════════════════════════════════════════════════════════
   CALENDARIO (modal + ICS / Google Calendar) — DOM puro, no depende
   de GSAP
   ══════════════════════════════════════════════════════════════ */
function addToCalendar() { document.getElementById('calModal').classList.add('visible'); document.body.style.overflow = 'hidden'; }
function closeCalModal() { document.getElementById('calModal').classList.remove('visible'); document.body.style.overflow = ''; }
function handleCalOverlayClick(e) { if (e.target === document.getElementById('calModal')) closeCalModal(); }
function padN(n) { return String(n).padStart(2, '0'); }
function toICSLocal(d) { return `${d.getFullYear()}${padN(d.getMonth() + 1)}${padN(d.getDate())}T${padN(d.getHours())}${padN(d.getMinutes())}00`; }

function confirmCalendar() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const reminderDate = new Date(EVENT_DATE);
    reminderDate.setDate(reminderDate.getDate() - 7);
    reminderDate.setHours(9, 0, 0, 0);
    const endDate = new Date(reminderDate); endDate.setHours(endDate.getHours() + 1);

    if (isAndroid) {
        const googleUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(EVENT_TITLE) + '&dates=' + toICSLocal(reminderDate) + '/' + toICSLocal(endDate) + '&details=' + encodeURIComponent('Recordatorio: ' + EVENT_TITLE) + '&location=' + encodeURIComponent(EVENT_LOCATION);
        window.open(googleUrl, '_blank');
    } else {
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bautizo2//ES', 'BEGIN:VEVENT', `UID:recordatorio-bautizo-${Date.now()}`, `SUMMARY:Recordatorio: ${EVENT_TITLE}`, `DTSTART:${toICSLocal(reminderDate)}`, `DTEND:${toICSLocal(endDate)}`, `DESCRIPTION:Recordatorio del bautizo.`, `LOCATION:${EVENT_LOCATION}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bautizo.ics'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    closeCalModal();
}

/* ══════════════════════════════════════════════════════════════
   CONTACTO (modal, promociona el servicio de invitaciones — no tiene
   relación con el RSVP del bautizo) — DOM puro, no depende de GSAP
   ══════════════════════════════════════════════════════════════ */
function openContactModal() { document.getElementById('contactModal').classList.add('visible'); document.body.style.overflow = 'hidden'; }
function closeContactModal() { document.getElementById('contactModal').classList.remove('visible'); document.body.style.overflow = ''; }
function handleContactOverlayClick(e) { if (e.target === document.getElementById('contactModal')) closeContactModal(); }

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCalModal(); closeContactModal(); } });

/* ══════════════════════════════════════════════════════════════
   RSVP — se registra directo en Firebase (invitations/{id}/contadores),
   sin WhatsApp de por medio. Una sola respuesta por navegador: RSVP_KEY
   guarda el registro completo, y si ya existe al cargar la página se
   oculta el formulario y se muestra el detalle de esa confirmación.
   ══════════════════════════════════════════════════════════════ */
const RSVP_KEY = 'rsvp_5vu4o_data';
let rsvpChoice = null, guestCount = 1, currentStep = 0;

(function () {
    const raw = localStorage.getItem(RSVP_KEY);
    if (!raw) return;
    try {
        renderAlreadyConfirmed(JSON.parse(raw));
    } catch (e) { /* dato corrupto — se ignora, se deja ver el formulario de nuevo */ }
})();

function renderAlreadyConfirmed(data) {
    const stepper = document.getElementById('rsvpStepper');
    const already = document.getElementById('rsvpAlreadyConfirmed');
    if (stepper) stepper.style.display = 'none';
    if (!already) return;
    const asiste = Number(data.asiste) === 1;
    const detail = document.getElementById('rsvpAcDetail');
    if (detail) {
        detail.textContent = asiste
            ? `${data.nombre} confirmó el ${data.date} que sí asistirá, con ${data.personas} ${data.personas === 1 ? 'persona' : 'personas'}.`
            : `${data.nombre} confirmó el ${data.date} que no podrá asistir.`;
    }
    already.style.display = 'block';
}

function selectAttend(val) {
    rsvpChoice = val;
    document.getElementById('opt-si').classList.toggle('selected', val === 'si');
    document.getElementById('opt-no').classList.toggle('selected', val === 'no');
    document.getElementById('guestGroup').style.display = val === 'no' ? 'none' : '';
    document.getElementById('rsvpNextBtn').classList.add('is-visible');
}
function changeGuests(delta) { guestCount = Math.max(1, Math.min(20, guestCount + delta)); document.getElementById('guestNum').textContent = guestCount; }
function toggleAnon(cb) { const nameInput = document.getElementById('rsvpName'); if (cb.checked) { nameInput.value = ''; nameInput.disabled = true; } else { nameInput.disabled = false; nameInput.focus(); } }

function goStep(n) {
    if (n === 1 && currentStep === 0) { if (!rsvpChoice) { shake('step0'); return; } }
    if (n === 2 && currentStep === 1) { buildSummary(); }
    document.getElementById('step' + currentStep).classList.remove('active');
    document.getElementById('dot' + currentStep).classList.remove('active');
    document.getElementById('dot' + currentStep).classList.add('done');
    currentStep = n;
    document.getElementById('step' + currentStep).classList.add('active');
    for (let i = 0; i < 3; i++) { const dot = document.getElementById('dot' + i); dot.classList.remove('active', 'done'); if (i < currentStep) dot.classList.add('done'); else if (i === currentStep) dot.classList.add('active'); }
}

function buildSummary() {
    const isAnon = document.getElementById('rsvpAnon').checked;
    const name = isAnon ? 'Anónimo(a)' : (document.getElementById('rsvpName').value.trim() || 'Invitado(a)');
    const asiste = rsvpChoice === 'si';
    let html = `<div class="confirm-row"><span class="confirm-row-icon">${asiste ? '🧸' : '💙'}</span><div class="confirm-row-text"><div class="confirm-row-label">Asistencia</div><div class="confirm-row-val">${asiste ? 'Sí asistiré' : 'No podré ir'}</div></div></div><div class="confirm-row"><span class="confirm-row-icon">👤</span><div class="confirm-row-text"><div class="confirm-row-label">Nombre</div><div class="confirm-row-val">${name}</div></div></div>`;
    if (asiste) html += `<div class="confirm-row"><span class="confirm-row-icon">🎈</span><div class="confirm-row-text"><div class="confirm-row-label">Invitados</div><div class="confirm-row-val">${guestCount} ${guestCount === 1 ? 'persona' : 'personas'}</div></div></div>`;
    document.getElementById('confirmSummary').innerHTML = html;
}

function shake(id) {
    const el = document.getElementById(id); if (!el) return;
    el.style.animation = 'none'; el.offsetHeight; el.style.animation = 'stepIn .3s ease';
    if (typeof gsap !== 'undefined') gsap.fromTo(el, { x: -8 }, { x: 0, duration: .4, ease: 'elastic.out(1,0.3)' });
}

function submitRSVP() {
    const isAnon = document.getElementById('rsvpAnon').checked;
    const rawName = document.getElementById('rsvpName').value.trim();
    const name = isAnon || !rawName ? 'Anónimo(a)' : rawName;
    const asiste = rsvpChoice === 'si';

    /* Una sola respuesta por navegador: RSVP_KEY se guarda siempre (haya
       o no Firebase disponible) para bloquear reenvíos; el registro en
       Firebase (transactions, asiste 0/1, fecha DD/MM/YYYY HH:mm armada
       a mano — misma mecánica que gali/app.js) solo ocurre si db existe. */
    if (!localStorage.getItem(RSVP_KEY)) {
        const now = new Date();
        const formattedDate = `${padN(now.getDate())}/${padN(now.getMonth() + 1)}/${now.getFullYear()} ${padN(now.getHours())}:${padN(now.getMinutes())}`;
        const record = { nombre: name, personas: guestCount, date: formattedDate, asiste: asiste ? 1 : 0 };

        if (db) {
            const base = db.ref(`invitations/${INVITATION_ID}/contadores`);
            base.child('asistentes').transaction(c => {
                const arr = Array.isArray(c) ? c : [];
                arr.push(record);
                return arr;
            });
            if (asiste) {
                base.child('confirmados').transaction(c => (c || 0) + guestCount);
            } else {
                base.child('noConfirmados').transaction(c => (c || 0) + 1);
            }
        }

        try { localStorage.setItem(RSVP_KEY, JSON.stringify(record)); } catch (e) { /* localStorage lleno/bloqueado — el registro en Firebase ya se hizo, solo no persiste el aviso local */ }
    }

    document.getElementById('rsvpStepper').style.display = 'none';
    document.getElementById('successName').textContent = name;
    document.getElementById('successSub').innerHTML = asiste
        ? 'Tu confirmación fue registrada.<br>Mi familia y yo te esperamos para celebrar juntos este gran día.'
        : 'Lamentamos que no puedas acompañarnos.<br>Gracias por avisarnos, te extrañaremos.';
    document.getElementById('successMsg').style.display = 'block';
    if (typeof gsap !== 'undefined') gsap.fromTo('#successMsg', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .8, ease: 'power2.out' });
}
