const cap = document.getElementById('cap');
const capSpin = cap.querySelector('.cap-spin');
const card = document.getElementById('card');
const speedField = document.getElementById('speedField');
const skyBg = document.getElementById('skyBg');
const flightThought = document.getElementById('flightThought');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function rand(min, max) { return Math.random() * (max - min) + min; }

// Small flat cloud puff, built from 2-3 overlapping ellipses like the
// clouds in the sky backdrop, so it reads as "more sky" rushing by.
function cloudSVG() {
  const w = 60, h = 26;
  return `<svg viewBox="0 0 ${w} ${h}">
    <ellipse class="puff" cx="${w*0.35}" cy="${h*0.6}" rx="${w*0.32}" ry="${h*0.42}" />
    <ellipse class="puff" cx="${w*0.62}" cy="${h*0.5}" rx="${w*0.26}" ry="${h*0.36}" />
    <ellipse class="puff" cx="${w*0.2}" cy="${h*0.65}" rx="${w*0.2}" ry="${h*0.3}" />
  </svg>`;
}

// Fixed, hand-picked set of clouds (position, size, opacity, timing) —
// no randomness, so the flight looks identical every time the page
// loads, instead of a different scatter on each run. Fewer clouds than
// before, spread across the width, each still falling the full length.
const RUSH_CLOUD_PLAN = [
  { left: -4,  size: 150, opacity: 0.92, duration: 3200, delay: 0    },
  { left: 58,  size: 110, opacity: 0.8,  duration: 2900, delay: 180  },
  { left: 20,  size: 90,  opacity: 1,    duration: 3500, delay: 420  },
  { left: 78,  size: 140, opacity: 0.85, duration: 3000, delay: 640  },
  { left: 4,   size: 100, opacity: 0.78, duration: 3300, delay: 900  },
  { left: 46,  size: 160, opacity: 0.9,  duration: 2800, delay: 1150 },
];

let spawning = false;
const cloudSpawnTimers = [];
function spawnPlannedClouds() {
  RUSH_CLOUD_PLAN.forEach(plan => {
    const timer = setTimeout(() => {
      if (!spawning) return;
      const el = document.createElement('div');
      el.className = 'rush-cloud';
      el.style.left = plan.left + 'vw';
      el.style.width = plan.size + 'px';
      el.style.height = (plan.size / 2.3) + 'px';
      el.style.setProperty('--puff-opacity', plan.opacity);
      el.style.animationDuration = plan.duration + 'ms';
      el.innerHTML = cloudSVG();
      speedField.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }, plan.delay);
    cloudSpawnTimers.push(timer);
  });
}

// Compute exactly how far the cap must travel (in real pixels) so it
// ends up resting in the bottom-right corner with ~70% of its final,
// scaled size visible on screen — measured against the real viewport,
// not guessed vw/svh percentages.
function setCornerTarget() {
  const rect = cap.getBoundingClientRect(); // cap's box at rest, scale(1)
  const finalScale = 2.3; // keep in sync with the scale(2.3) in fallMove/settleWobble in style.css
  const displayedW = rect.width * finalScale;
  const displayedH = rect.height * finalScale;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visibleFraction = 0.70;

  // Cap's un-transformed box is centered horizontally, sitting below
  // the fold vertically (bottom: -160px). We want its final displayed
  // box to have 70% of its width visible from the right edge, and 70%
  // of its height visible from the bottom edge.
  const boxCenterX = rect.left + rect.width / 2;
  const boxCenterY = rect.top + rect.height / 2;

  // Target: right edge of displayed box sits (visibleFraction * width)
  // past the viewport's right edge is wrong direction — we want the
  // LEFT part hidden off-screen is also wrong for bottom-RIGHT corner.
  // Correct: box pokes out past the right AND bottom edges, so:
  //   visible width  = displayedW * visibleFraction  (from the left side of the box)
  //   hidden width   = displayedW * (1 - visibleFraction) (pokes past right edge)
  const hiddenW = displayedW * (1 - visibleFraction);
  const hiddenH = displayedH * (1 - visibleFraction);

  const targetRight = vw + hiddenW;      // displayed box's right edge
  const targetLeft = targetRight - displayedW;
  const targetBottom = vh + hiddenH;     // displayed box's bottom edge
  const targetTop = targetBottom - displayedH;

  const targetCenterX = targetLeft + displayedW / 2;
  const targetCenterY = targetTop + displayedH / 2;

  const fallX = targetCenterX - boxCenterX;
  const fallY = targetCenterY - boxCenterY;

  cap.style.setProperty('--fall-x', fallX + 'px');
  cap.style.setProperty('--fall-y', fallY + 'px');
}

function playSequence() {
  if (reduceMotion) {
    card.classList.add('revealed');
    showNextSceneButton();
    return;
  }
  setCornerTarget();
  window.addEventListener('resize', setCornerTarget);

  // Small pause on empty stage before launch
  setTimeout(() => {
    cap.classList.add('launch');
    skyBg.classList.add('visible');
    spawning = true;
    spawnPlannedClouds();
  }, 350);

  // Flight thought: shows roughly a third of the way into the 3.4s
  // launch, and hides again well before it ends, so it's never still
  // fading out right as the fall/reveal begins.
  setTimeout(() => flightThought.classList.add('visible'), 350 + 1100);
  setTimeout(() => flightThought.classList.remove('visible'), 350 + 2500);

  cap.addEventListener('animationend', function onLaunch(e) {
    if (e.animationName !== 'launchMove') return;
    cap.removeEventListener('animationend', onLaunch);
    cap.classList.remove('launch');
    cap.classList.add('fall');
    spawning = false;
    // Cancel any planned cloud spawns that haven't fired yet (in case
    // launch ends earlier than the plan's last delay).
    cloudSpawnTimers.forEach(t => clearTimeout(t));
    cloudSpawnTimers.length = 0;
    // The cap is now falling toward its corner, large, in front of the
    // screen — the invitation text reveals right away, appearing to
    // emerge from behind it as it drops. The sky fades back to the
    // navy backdrop at the same moment, and any clouds still mid-fall
    // are dismissed immediately (fast fade) instead of finishing out
    // their full multi-second animation — otherwise stray clouds would
    // still be visible after the invitation text has already appeared.
    card.classList.add('revealed');
    skyBg.classList.remove('visible');
    flightThought.classList.remove('visible');
    speedField.querySelectorAll('.rush-cloud').forEach(el => {
      el.style.animation = 'none';
      el.style.transition = 'opacity 0.35s ease';
      el.style.opacity = '0';
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    });
    showNextSceneButton();
  });

  cap.addEventListener('animationend', function onFall(e) {
    if (e.animationName !== 'fallMove') return;
    cap.removeEventListener('animationend', onFall);
    // Pin the spin at its exact final angle BEFORE removing "fall" —
    // otherwise the .cap-wrap.fall .cap-spin rule stops applying the
    // instant the class is removed and the spin snaps back to 0deg.
    // This is the point where the cap finally stops spinning, right
    // as it settles into its corner.
    capSpin.classList.add('spin-done');
    cap.classList.remove('fall');
    cap.classList.add('settle');
  });
}

if (document.readyState === 'complete') {
  playSequence();
} else {
  window.addEventListener('load', playSequence);
}

// ---------- Scene 1 → 2 handoff: ripple reveal ----------
const sceneTrack = document.getElementById('sceneTrack');
const scene2 = document.querySelector('.scene-2');
const nextSceneWrap = document.getElementById('nextSceneWrap');
const nextSceneHint = document.getElementById('nextSceneHint');
const nextSceneBtn = document.getElementById('nextSceneBtn');
const prevSceneBtn = document.getElementById('prevSceneBtn');
const confettiField = document.getElementById('confettiField');
const confettiColors = ['#E63E9C', '#F5C518', '#FCE9F5', '#9B4FCB', '#FFFFFF'];
let confettiFired = false;

function showNextSceneButton() {
  setRevealOrigin();
  scene2.classList.add('armed');
  nextSceneWrap.classList.add('shown');
  window.addEventListener('resize', setRevealOrigin);
  // A few seconds after the button appears, nudge with a blinking
  // "tap me" hint plus a grow/shrink pulse — only if the person
  // hasn't already moved on.
  setTimeout(() => {
    if (nextSceneWrap.classList.contains('shown')) {
      nextSceneHint.classList.add('shown');
      nextSceneWrap.classList.add('attention');
    }
  }, 3200);
}

// Reads the button's real on-screen center and writes it as the
// circle's origin point, so the ripple always grows from exactly
// where the person tapped, regardless of screen size.
function setRevealOrigin() {
  const rect = nextSceneBtn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  scene2.style.setProperty('--reveal-x', cx + 'px');
  scene2.style.setProperty('--reveal-y', cy + 'px');
}

function balloonSVG(color) {
  return `<svg viewBox="0 0 46 58" fill="none">
    <ellipse cx="23" cy="22" rx="20" ry="22" fill="${color}"/>
    <path d="M23 44 Q19 48 23 52 Q27 48 23 44Z" fill="${color}"/>
    <line x1="23" y1="52" x2="23" y2="58" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>
  </svg>`;
}

function burstConfetti() {
  if (confettiFired || reduceMotion) return;
  confettiFired = true;

  const count = 46;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = rand(0, 100) + 'vw';
    el.style.background = confettiColors[Math.floor(rand(0, confettiColors.length))];
    el.style.animationDuration = rand(2200, 3800) + 'ms';
    el.style.animationDelay = rand(0, 500) + 'ms';
    confettiField.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  const balloonColors = ['#E63E9C', '#F5C518', '#9B4FCB', '#6A1B8C'];
  const balloonCount = 7;
  for (let i = 0; i < balloonCount; i++) {
    const el = document.createElement('div');
    el.className = 'balloon-piece';
    const size = rand(38, 58);
    el.style.left = rand(4, 86) + 'vw';
    el.style.width = size + 'px';
    el.style.height = (size * 58 / 46) + 'px';
    el.style.setProperty('--drift', rand(-24, 24) + 'px');
    el.style.animationDuration = rand(3400, 5200) + 'ms';
    el.style.animationDelay = rand(100, 900) + 'ms';
    el.innerHTML = balloonSVG(balloonColors[Math.floor(rand(0, balloonColors.length))]);
    confettiField.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

nextSceneBtn.addEventListener('click', () => {
  setRevealOrigin();
  sceneTrack.classList.add('on-scene-2');
  nextSceneWrap.classList.remove('shown', 'attention');
  nextSceneHint.classList.remove('shown');
  setTimeout(burstConfetti, reduceMotion ? 0 : 550);
});

prevSceneBtn.addEventListener('click', () => {
  sceneTrack.classList.remove('on-scene-2');
  nextSceneWrap.classList.add('shown');
  confettiFired = false;
  confettiField.querySelectorAll('.confetti-piece, .balloon-piece').forEach(el => el.remove());
  // Give the "tap me" hint (and the grow/shrink pulse) another chance
  // to nudge, a few seconds after coming back to scene 1.
  nextSceneWrap.classList.remove('attention');
  nextSceneHint.classList.remove('shown');
  setTimeout(() => {
    if (nextSceneWrap.classList.contains('shown')) {
      nextSceneHint.classList.add('shown');
      nextSceneWrap.classList.add('attention');
    }
  }, 3200);
});
