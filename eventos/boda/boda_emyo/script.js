/* Contador de visitas + conexión Firebase, vía el conector genérico de
   shared/firebase-connect.js (ver README.md en la raíz del repo). Mismo
   patrón que eventos/maestria/script.js — id propio de esta invitación,
   no confundir con el de otras. */
const INVITATION_ID = '6y72u';
window.SIFirebase && window.SIFirebase.trackVisit(INVITATION_ID);

(function(){
  const scrollSection = document.getElementById('scrollSection');
  const envelope = document.getElementById('envelope');
  const envelopeBack = document.getElementById('envelopeBack');
  const envelopeLiner = document.getElementById('envelopeLiner');
  const flap = document.getElementById('flap');
  const seal = document.getElementById('seal');
  const sheet = document.getElementById('sheet');
  const sheetContent = document.getElementById('sheetContent');
  const scrollHint = document.getElementById('scrollHint');
  const heroText = document.getElementById('heroText');
  const confirmBtn = document.getElementById('confirmAttendanceBtn');
  const invSongContainer = document.getElementById('invSongContainer');
  const invSongEl = document.getElementById('invSong');
  const invSongStickySlot = document.getElementById('invSongStickySlot');
  const invSongAudio = document.getElementById('invSongAudio');
  const siteCreditFooter = document.getElementById('siteCreditFooter');

  let hintHidden = false;
  let cachedContentHeight = null;
  let songSticky = false; // tracks the last-applied sticky state so the
    // re-parent (see updateScene()) only happens on an actual transition,
    // not every single frame

  // Scene 2 (RSVP ending, appended at the end of this file) briefly
  // "hijacks" this same envelope for its own cutscene once the guest
  // reaches it — this flag is how it pauses Scene 1's scroll-driven
  // writes to envelope/flap/seal while it does, and __boda_emyoResyncEnvelope
  // is how it hands clean control back afterward. Defaults to false/unused
  // for every visitor who never reaches Scene 2 (already confirmed).
  window.__scene1Frozen = false;

  function clamp01(v){ return Math.min(1, Math.max(0, v)); }
  function lerp(a, b, t){ return a + (b - a) * t; }
  function smoothstep(t){
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
  }

  // Single source of truth for where the dwell band (content fully
  // scrolled into view, static) ends and the closing sequence may begin —
  // used both by updateScene() below (content fade / sheet exit / envelope
  // close timing, and the floating confirm button's visibility window) and
  // by onScroll() further down (the raw-scroll auto-trigger point).
  const READING_DONE = 0.60;
  const OUTRO_TRIGGER_THRESHOLD = 0.72;

  // Site credit bar's own opacity ramp — 70% at the very start, fades
  // down to a barely-there 25% almost immediately (so it stays out of the
  // way for the whole reading/dwell experience), then rises back to
  // fully opaque as the envelope closes back up, finishing before the
  // closing screen itself ever shows.
  const FOOTER_INTRO_END = 0.05;
  const FOOTER_OUTRO_START = 0.80;
  const FOOTER_OUTRO_END = 0.92;

  // ==================================================================
  // TIMELINE — every value below is a continuous function of the single
  // scroll `progress` (0 to 1). Phases overlap on purpose so nothing ever
  // fully stops before the next begins.
  //
  // 0.00 - 0.09  Envelope enters from below (70% peeking over the bottom
  //              edge at progress=0) and rises to screen-center, closed.
  // 0.06 - 0.21  At center, the flap opens (seal cracked slightly earlier,
  //              0.06-0.15).
  // 0.09 - 0.25  SIMULTANEOUSLY with opening (both start the instant the
  //              envelope reaches center), it sinks back down — much
  //              further this time — down to where only its top ~65%
  //              still shows above the bottom edge. It HOLDS there,
  //              unmoving, for the rest of the reveal — it never
  //              disappears.
  // 0.16 - 0.35  While the envelope is still sinking, a sheet emerges
  //              from inside it: grows from a small "tucked" size to its
  //              full reading size, its position blending from "centered
  //              on the envelope" to "anchored at the envelope's notch".
  //              (This whole entrance — 0 to 0.35 — plus a taller total
  //              .scroll-section height below is the SECOND widening
  //              pass: the first pass only stretched the fractions,
  //              which still felt too fast in absolute scroll distance
  //              because the section's total height had been shortened
  //              for the redone content. This time the total height
  //              itself also grows, so the content-reading band doesn't
  //              have to keep shrinking to make room.)
  //              The sheet stays PERMANENTLY at z-index 2 — behind the
  //              envelope's pocket/flap (z-index 10 as a whole) — for the
  //              entire animation, not just during emergence. This keeps
  //              a real sandwich alive throughout the long reading phase
  //              too: envelope-back always behind, the sheet's vast
  //              majority unobstructed in the middle (it grows far taller
  //              than the envelope's small fixed box), and a sliver of
  //              the envelope's own front (pocket edges + flap) always
  //              visible in front of the sheet's bottom.
  // 0.35 - 0.60  The sheet holds its size/position; its long content
  //              scrolls internally, top to bottom, inside the sheet's
  //              fixed window (this is the bulk of the scroll distance —
  //              the whole invitation is read here).
  // 0.60 - 0.72  DWELL (READING_DONE -> OUTRO_TRIGGER_THRESHOLD) — content
  //              is fully scrolled into view and fully opaque; nothing
  //              fades, moves, or auto-triggers here, so the last section
  //              (Mesa de regalos) can't be scrolled past in one tick, and
  //              there's real room to keep scrolling a bit before the
  //              closing sequence takes over. The floating "Confirmar
  //              asistencia" button (see confirmBtn below) is also only
  //              visible during this exact band — a second, deliberate
  //              way to move on besides continuing to scroll past it.
  // 0.72 - 0.80  Content fades out.
  // 0.74 - 0.90  The sheet accelerates upward and exits off the top of
  //              the screen.
  // 0.80 - 0.94  The envelope rises back to center, closing (flap swings
  //              shut, seal reforms) WHILE it rises, settling closed
  //              shortly before progress reaches 1.
  // ==================================================================

  function updateScene(progress){
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // envelope box's own real height in px (matches the CSS formula)
    const envW = Math.min(vw * 0.90, 640);
    const envH = Math.min(envW * 0.68, 640 * 0.68);

    // ---------------- ENVELOPE VERTICAL JOURNEY ----------------
    // Expressed as translateY offset from viewport-center (px), using
    // offset = vh/2 + envH*(hiddenFrac - 0.5), where hiddenFrac is the
    // fraction of the envelope's height hidden below the viewport's
    // bottom edge.
    //
    // Stop 1 (progress=0): 80% visible above the bottom edge -> hidden
    // fraction 0.20 -> offset = vh/2 + envH*(0.20-0.5) = vh/2 - envH*0.30.
    const yStart = (vh / 2) - (envH * 0.30);

    // Stop 2: centered on screen.
    const yCenter = 0;

    // Stop 3 (sunk): ~65% still shows above the bottom edge -> hidden
    // fraction 0.35 -> offset = vh/2 + envH*(0.35-0.5) = vh/2 - envH*0.15.
    // (The envelope-pocket's own top edge sits at local-y 38% of the
    // envelope's height and its V-notch's deepest point reaches to
    // local-y 60% — 65% visible puts that tip comfortably inside the
    // visible band, with a little margin, so the full V shows clearly
    // rather than just its shoulders/corners.)
    const ySunk = (vh / 2) - (envH * 0.15);

    // Stop 4 (exit): rises back to center, closed, final resting state.
    const yFinal = 0;

    const riseIn  = smoothstep(progress / 0.09);              // 0.00 -> 0.09
    const sealOpen= smoothstep((progress - 0.06) / 0.09);      // 0.06 -> 0.15
    const openT   = smoothstep((progress - 0.09) / 0.12);      // 0.09 -> 0.21
    const sinkT   = smoothstep((progress - 0.09) / 0.16);      // 0.09 -> 0.25
    const exitT   = smoothstep((progress - 0.80) / 0.14);      // 0.80 -> 0.94
    const closeT  = smoothstep((progress - 0.80) / 0.14);      // 0.80 -> 0.94

    let envelopeY;
    if (progress < 0.09){
      envelopeY = lerp(yStart, yCenter, riseIn);
    } else if (progress < 0.80){
      envelopeY = lerp(yCenter, ySunk, sinkT); // saturates at ySunk from 0.25 onward, holds through the whole reading+dwell band
    } else {
      envelopeY = lerp(ySunk, yFinal, exitT);
    }

    // Envelope never scales down — stays full size throughout. The back
    // panel rides along in perfect lockstep (it's a separate sibling
    // purely for z-index reasons — see the CSS notes on .envelope /
    // .envelope-back).
    const envelopeTransform = `translate(-50%, calc(-50% + ${envelopeY}px))`;
    envelope.style.transform = envelopeTransform;
    envelopeBack.style.transform = envelopeTransform;

    // ---------------- FLAP + SEAL ----------------
    const flapAngle = (openT * 115) * (1 - closeT);
    flap.style.transform = `rotateX(${flapAngle}deg)`;
    // Once swung past vertical, drop behind everything so its folded-back
    // underside never intercepts paint priority over the emerging sheet;
    // while still closed-ish it must stay above the tucked sheet.
    flap.style.zIndex = flapAngle > 95 ? 0 : 25;
    flap.style.opacity = String(1 - smoothstep((flapAngle - 95) / 20) * 0.85);

    const sealFinal = sealOpen * (1 - closeT);
    seal.style.opacity = String(1 - sealFinal);
    seal.style.transform = `translate(-50%,-50%) scale(${1 - sealFinal * 0.5})`;

    // The liner's job is only to hide the tucked sheet while the flap is
    // still closed — it must fade with the flap OPENING, not with the
    // sheet's own growth speed (those are different concerns; tying it to
    // growth would leave it opaque, hiding the sheet, through nearly the
    // whole emergence).
    envelopeLiner.style.opacity = String(1 - openT);

    // ---------------- SHEET: emerging from inside the envelope ----------------
    const smallW = envW * 0.82;
    const smallH = envH * 0.70;
    const bigW = Math.min(vw * 0.88, 620);
    // Nearly the full viewport height: top edge at 0 (see topAnchoredY
    // below), bottom edge ~10px above the viewport's own bottom edge.
    // This does overlap the envelope's resting visible band again (see
    // ySunk above) — that's intentional: the permanent z-index sandwich
    // below is what makes the pocket's V-shape show in front of the
    // sheet within that overlap, rather than trying to avoid it.
    const bigH = vh - 10;

    // Growth band overlaps the envelope's descent on purpose — the sheet
    // is visibly emerging WHILE the envelope sinks, not after.
    const growT = smoothstep((progress - 0.16) / 0.19); // 0.16 -> 0.35

    const sheetW = lerp(smallW, bigW, growT);
    const sheetH = lerp(smallH, bigH, growT);
    sheet.style.width = `${sheetW}px`;
    sheet.style.height = `${sheetH}px`;

    // Position blend: TUCKED (centered on the envelope's own center,
    // riding along with its motion) -> PINNED (top edge exactly at the
    // viewport's top, y=0 — see bigH above for why this leaves the
    // envelope's visible band clear underneath). Blended smoothly across
    // the WHOLE growT window so there's no late positional "pop".
    const tuckedCenterY = envelopeY;
    const topAnchoredY = sheetH / 2 - vh / 2; // sheet's absolute top edge = 0
    const anchoredY = lerp(tuckedCenterY, topAnchoredY, growT);

    // ---------------- LAYERING: the permanent sandwich ----------------
    // Always behind .envelope's own z-index (10, as a whole — see the CSS
    // notes on .envelope/.sheet being siblings, not parent/child) and
    // always in front of .envelope-back (z-index 1). This never flips:
    // during emergence it reads as "coming from inside the envelope,"
    // and it stays that way permanently through the whole reading phase
    // too — wherever the sheet's box overlaps the envelope's small fixed
    // box, the envelope's own front (pocket, flap) shows in front of it;
    // everywhere else (the sheet's vast majority, once grown) there's
    // simply nothing from the envelope painted at those pixels, so it's
    // fully unobstructed regardless of z-order.
    sheet.style.zIndex = 2;

    // ---------------- SHEET EXIT ----------------
    const exitRiseT = smoothstep((progress - 0.74) / 0.16); // 0.74 -> 0.90
    const yOffscreenTop = -vh * 0.9 - sheetH * 0.5;
    const sheetY = lerp(anchoredY, yOffscreenTop, exitRiseT);

    sheet.style.transform = `translate(-50%, calc(-50% + ${sheetY}px))`;

    // ---------------- CONTENT: long internal scroll ----------------
    // Once the sheet has finished growing, measure the content's real
    // rendered height ONCE and cache it — scrollHeight forces a layout
    // read, so doing this every rAF tick while scrolling would be a real
    // jank risk. Only invalidated on resize (see onResize below).
    if (cachedContentHeight === null && progress >= 0.35){
      cachedContentHeight = sheetContent.scrollHeight;
    }
    const maxScrollPx = cachedContentHeight ? Math.max(0, cachedContentHeight - sheetH) : 0;
    const contentScrollT = smoothstep((progress - 0.35) / 0.25); // 0.35 -> 0.60
    const contentOffsetY = -contentScrollT * maxScrollPx;
    sheetContent.style.transform = `translate(-50%, ${contentOffsetY}px)`;

    const contentIn = smoothstep((growT - 0.6) / 0.4); // fades in during the tail of growth, once legible
    const contentOut = 1 - smoothstep((progress - OUTRO_TRIGGER_THRESHOLD) / 0.08); // 0.72 -> 0.80,
      // fades AFTER the READING_DONE-to-OUTRO_TRIGGER_THRESHOLD dwell band
      // has fully elapsed — never while the last section is still becoming
      // visible or freshly readable

    // ---- Floating "Confirmar asistencia" button ----
    // Visible only during the dwell band itself: content is fully
    // scrolled into view and not yet fading/closing. A second, deliberate
    // way to move on besides continuing to scroll past it — clicking it
    // calls runOutroAutoplay() (defined below) directly, the exact same
    // tween continuing to scroll past OUTRO_TRIGGER_THRESHOLD triggers.
    if (confirmBtn){
      const confirmVisible = progress >= READING_DONE && progress < OUTRO_TRIGGER_THRESHOLD;
      confirmBtn.style.opacity = confirmVisible ? '1' : '0';
      confirmBtn.style.pointerEvents = confirmVisible ? 'auto' : 'none';
    }

    // ---- Site credit bar opacity (see FOOTER_* consts above) ----
    if (siteCreditFooter){
      let footerOpacity;
      if (progress < FOOTER_INTRO_END){
        footerOpacity = lerp(0.70, 0.25, smoothstep(progress / FOOTER_INTRO_END));
      } else if (progress < FOOTER_OUTRO_START){
        footerOpacity = 0.25;
      } else {
        footerOpacity = lerp(0.25, 1, smoothstep((progress - FOOTER_OUTRO_START) / (FOOTER_OUTRO_END - FOOTER_OUTRO_START)));
      }
      siteCreditFooter.style.opacity = String(footerOpacity);
    }

    // ---- Floating song player: docks near the top of the viewport once
    // its home position has scrolled up past it AND it's actually
    // playing, ported from eventos/gali's own sticky music player (its
    // app.js just checks this same rect.top<=15 off a plain window scroll
    // listener — here it's driven from this per-frame render loop
    // instead, since that's the only thing that reliably runs regardless
    // of what's advancing progress). Only `top<=14` matters here, exactly
    // like gali's own check — an earlier version of this also required
    // `rect.bottom>14`, meant to "un-stick once fully scrolled past," but
    // bottom is just top+(the player's own ~60-90px height), so that
    // extra clause flipped shouldStick back to false again within about
    // one element-height of scrolling — it looked like it "never stuck"
    // because it only ever stuck for a single flickering frame. Dropping
    // it (and relying on the reading-phase bound below to un-stick once
    // the whole reading phase ends) fixes that.
    //
    // Unlike #confirmAttendanceBtn (a plain always-fixed body-level
    // button), #invSong also needs to render INLINE, in normal flow, as
    // part of the readable content — so a CSS position:fixed rule alone
    // doesn't work here even from a body-level class: #invSong itself
    // still lives inside #sheetContent/.sheet, both of which get a fresh
    // inline `transform` every frame just above, and any `transform` on
    // an ancestor becomes the containing block for a position:fixed
    // descendant instead of the viewport (per spec) — so it would just
    // silently follow that transform around. The actual fix is
    // physically re-parenting the single real #invSong node between its
    // home (#invSongContainer) and the body-level #invSongStickySlot,
    // gated on songSticky so it only happens on a real transition, never
    // duplicating the element or its play/pause/lyrics state.
    if (invSongContainer && invSongEl && invSongStickySlot){
      const inReadingPhase = progress >= 0.35 && progress < READING_DONE;
      let shouldStick = false;
      if (inReadingPhase && invSongAudio && !invSongAudio.paused){
        const songRect = invSongContainer.getBoundingClientRect();
        shouldStick = songRect.top <= 14;
      }
      if (shouldStick !== songSticky){
        songSticky = shouldStick;
        if (songSticky){
          // Measured right before it leaves normal flow, while its width
          // still reflects the reading column (.sheet-content's own
          // min(560px,84%)) — stamped onto the slot in px so the docked
          // player keeps that exact width instead of shrinking to fit
          // its own content once re-parented.
          invSongStickySlot.style.width = invSongEl.getBoundingClientRect().width + 'px';
          invSongEl.classList.add('sticky');
          invSongStickySlot.appendChild(invSongEl);
        } else {
          invSongEl.classList.remove('sticky');
          invSongContainer.appendChild(invSongEl);
        }
      }
    }

    sheetContent.style.opacity = String(Math.min(contentIn, contentOut));

    // ---- Hero text fade ----
    // Gone well before the envelope reaches center (progress 0.09) so it
    // never visually collides with the rising envelope.
    heroText.style.opacity = String(1 - smoothstep(progress / 0.04));

    // ---- Scroll hint fade ----
    if (progress > 0.015 && !hintHidden){
      scrollHint.style.opacity = '0';
      hintHidden = true;
    } else if (progress <= 0.015 && hintHidden){
      scrollHint.style.opacity = '1';
      hintHidden = false;
    }

    // ---- Scene 2 hook: fires once this timeline has settled at its end ----
    // Harmless no-op for a visitor who's already confirmed (Scene 2 never
    // assigns this) or hasn't scrolled that far yet. Scene 2 guards its own
    // callback against firing more than once, so it's safe to check this
    // unconditionally on every call as progress eases up toward 1.
    if (progress >= 0.999 && typeof window.__boda_emyoOnScene1End === 'function'){
      window.__boda_emyoOnScene1End();
    }
  }

  // ---- Smoothing layer (rAF-based lerp toward raw scroll progress) ----
  let targetProgress = 0;
  let displayedProgress = 0;
  let rafId = null;

  function readRawProgress(){
    const rect = scrollSection.getBoundingClientRect();
    const sectionHeight = scrollSection.offsetHeight;
    const viewportHeight = window.innerHeight;
    const scrollable = sectionHeight - viewportHeight;
    const scrolled = -rect.top;
    return clamp01(scrolled / scrollable);
  }

  function tick(){
    const diff = targetProgress - displayedProgress;
    if (Math.abs(diff) < 0.0003){
      displayedProgress = targetProgress;
      updateScene(displayedProgress);
      rafId = null;
      return;
    }
    displayedProgress += diff * 0.18;
    updateScene(displayedProgress);
    rafId = requestAnimationFrame(tick);
  }

  // ---- Intro auto-play: collapses the entrance (envelope rise -> open/
  // sink -> sheet grows out) into one automatic motion on the visitor's
  // first scroll input, instead of requiring several manual scroll ticks
  // to drag progress through 0 -> 0.35. Nothing about the timeline itself
  // changes (same updateScene(), same keyframes) — only how progress
  // advances during this one segment. Local lockScroll/unlockScroll
  // mirrors the pair already used by Scene 2 further down this file (a
  // separate closure, no shared scope, so duplicated here rather than
  // restructuring module boundaries for 4 lines).
  const INTRO_AUTOPLAY_TARGET = 0.35;
  const INTRO_AUTOPLAY_MS = 2400;
  // How close back to the start counts as "back in the entrance zone" for
  // re-arming — a range, not literally progress 0, since scrolling back up
  // by hand rarely lands on exactly 0.
  const INTRO_REARM_THRESHOLD = 0.08;
  let introAutoPlaying = false;
  let introAutoPlayed = false;
  let introRearmed = false; // true once back in the entrance zone after
                             // having already played once — the next
                             // forward crossing past the threshold replays it

  // Same idea, mirrored at the other end: once the content has finished
  // scrolling AND the dwell band has fully elapsed (progress reaches
  // OUTRO_TRIGGER_THRESHOLD, declared up near updateScene() — see its
  // own contentScrollT/contentOut/dwell comments there), the last bit
  // (content fades, sheet exits, envelope rises back and closes)
  // auto-plays too. Deliberately NOT the same point where contentScrollT
  // saturates (READING_DONE) — that gap (the dwell band) is what gives
  // the guest a real pause on the fully-visible last section (e.g. Mesa
  // de regalos) before anything starts closing, and is also when the
  // floating confirm button offers a more direct way to trigger this
  // same sequence early.
  const OUTRO_AUTOPLAY_TARGET = 1;
  const OUTRO_AUTOPLAY_MS = 2400;
  let outroAutoPlaying = false;
  // Stays armed continuously for as long as progress sits below the
  // threshold (i.e. the whole reading phase, from a fresh pageview
  // onward) — so the very first time content finishes already fires it,
  // and scrolling back into the content and reaching the end again
  // re-fires it the same way, with no separate "first time" case needed.
  let outroRearmed = false;

  function lockScroll(){
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
  function unlockScroll(){
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  // Shared fixed-duration eased tween used by both the intro and outro
  // auto-plays: locks the real page scroll for the duration (so continued
  // input can't run the real scrollY ahead of the animated progress),
  // drives displayedProgress/targetProgress directly every frame via
  // updateScene(), then on completion unlocks and jumps the real scroll
  // position to match the target so normal scrolling resumes seamlessly.
  function playProgressTo(target, durationMs, onDone){
    lockScroll();
    if (rafId !== null){
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    const startProgress = displayedProgress;
    const startTime = performance.now();
    function step(now){
      const t = clamp01((now - startTime) / durationMs);
      const p = lerp(startProgress, target, smoothstep(t));
      displayedProgress = p;
      targetProgress = p;
      updateScene(p);
      if (t < 1){
        requestAnimationFrame(step);
      } else {
        // updateScene(p) just above may itself have triggered Scene 2's
        // end-of-timeline hook (progress>=0.999), which freezes Scene 1
        // and takes over scroll locking/positioning of its own (the
        // "already confirmed" ending, or the RSVP wizard's entrance). If
        // so, it — not this tween — now owns scroll: unlocking here and
        // jumping to the bottom-of-page scroll position would immediately
        // undo its lock and leave the real scroll sitting somewhere it
        // never asked for, right as it's trying to fade in a backdrop.
        if (!window.__scene1Frozen){
          unlockScroll();
          const sectionHeight = scrollSection.offsetHeight;
          const viewportHeight = window.innerHeight;
          const scrollable = sectionHeight - viewportHeight;
          window.scrollTo(0, target * scrollable);
        }
        if (typeof onDone === 'function') onDone();
      }
    }
    requestAnimationFrame(step);
  }

  function runIntroAutoplay(){
    if (introAutoPlaying || introAutoPlayed) return;
    introAutoPlaying = true;
    playProgressTo(INTRO_AUTOPLAY_TARGET, INTRO_AUTOPLAY_MS, function(){
      introAutoPlaying = false;
      introAutoPlayed = true;
    });
  }

  function runOutroAutoplay(){
    if (outroAutoPlaying) return;
    outroAutoPlaying = true;
    playProgressTo(OUTRO_AUTOPLAY_TARGET, OUTRO_AUTOPLAY_MS, function(){
      outroAutoPlaying = false;
    });
  }

  // Floating button's own trigger — a direct alternative to scrolling
  // past OUTRO_TRIGGER_THRESHOLD, calling the exact same tween. Hides
  // itself immediately on click (updateScene()'s own per-frame visibility
  // check will also converge on hidden within a few frames as progress
  // climbs past OUTRO_TRIGGER_THRESHOLD, but this avoids any chance of a
  // double-click re-entering while that first frame is still in flight).
  if (confirmBtn){
    confirmBtn.addEventListener('click', function(){
      if (outroAutoPlaying) return;
      confirmBtn.style.opacity = '0';
      confirmBtn.style.pointerEvents = 'none';
      runOutroAutoplay();
    });
  }

  function onScroll(){
    if (window.__scene1Frozen) return; // Scene 2 has taken the envelope over
    if (introAutoPlaying || outroAutoPlaying) return; // scroll is locked during either; ignore stray events
    if (!introAutoPlayed){
      runIntroAutoplay();
      return;
    }

    const raw = readRawProgress();

    if (raw <= INTRO_REARM_THRESHOLD){
      // Scrolled back up into the entrance zone — arm a replay, but don't
      // trigger it yet: still let this (probably backward) scroll move
      // normally below, so an upward gesture is never fought/interrupted.
      introRearmed = true;
    } else if (introRearmed){
      // Crossed back forward past the zone after having returned to it —
      // replay the automatic entrance from wherever it's currently sitting.
      introRearmed = false;
      introAutoPlayed = false;
      runIntroAutoplay();
      return;
    }

    if (raw < OUTRO_TRIGGER_THRESHOLD){
      outroRearmed = true;
    } else if (outroRearmed){
      // Reached (or came back to) the end of the content — auto-play the
      // exit from wherever it's currently sitting.
      outroRearmed = false;
      runOutroAutoplay();
      return;
    }

    targetProgress = raw;
    if (rafId === null){
      rafId = requestAnimationFrame(tick);
    }
  }

  function onResize(){
    cachedContentHeight = null; // clear before re-rendering, so this same
                                 // resize doesn't render one frame against
                                 // a stale cached height
    // A resize must never itself trigger the intro auto-play (onScroll()
    // would otherwise treat it exactly like a first scroll) — before the
    // intro has played, just re-render at the current (still 0) progress.
    if (!introAutoPlayed && !introAutoPlaying){
      updateScene(displayedProgress);
      return;
    }
    onScroll();
  }

  // Browsers restore the previous scroll position on reload by default
  // (history.scrollRestoration = 'auto'), which fires a 'scroll' event
  // before the visitor does anything — that phantom event would otherwise
  // silently consume the "first scroll" trigger above, completing the
  // intro auto-play instantly/invisibly and leaving every REAL scroll
  // after it looking like plain unmodified scrolling (exactly the "nada
  // especial, como scroll normal" symptom). Forcing manual restoration +
  // scrollTo(0,0) guarantees the first 'scroll' event is always a real,
  // deliberate one from the visitor.
  if ('scrollRestoration' in history){
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  updateScene(0);

  // Exposed so Scene 2 can hand the envelope back cleanly: after it
  // clears its own inline overrides and unfreezes onScroll, this forces
  // one correct re-render at progress 0 without waiting on a real scroll
  // event to happen to fire first.
  window.__boda_emyoResyncEnvelope = function(){
    targetProgress = 0;
    displayedProgress = 0;
    introAutoPlayed = false; // restarting from the top should replay the
                              // automatic entrance on the next scroll too
    introRearmed = false;
    outroRearmed = false;
    updateScene(0);
  };
})();

// ---- Countdown to the wedding (independent of the scroll animation) ----
(function(){
  const cdDays = document.getElementById('cdDays');
  const cdHours = document.getElementById('cdHours');
  const cdMinutes = document.getElementById('cdMinutes');
  const cdSeconds = document.getElementById('cdSeconds');
  if (!cdDays) return;

  // Explicit UTC offset (Mexico City) so the countdown is correct
  // regardless of the viewer's own timezone.
  const target = new Date('2026-11-14T14:00:00-06:00').getTime();

  function pad(n){ return String(n).padStart(2, '0'); }

  function updateCountdown(){
    const diff = Math.max(0, target - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    cdDays.textContent = pad(days);
    cdHours.textContent = pad(hours);
    cdMinutes.textContent = pad(minutes);
    cdSeconds.textContent = pad(seconds);
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
})();

// ---- Promo modal ("¿quieres una invitación así?") — fully independent
// of everything else on the page, same reason the lyrics player below
// gets its own IIFE. ----
(function(){
  const trigger = document.getElementById('contactModalTrigger');
  const modal = document.getElementById('contactModal');
  const closeBtn = document.getElementById('contactModalClose');
  if (!trigger || !modal || !closeBtn) return;

  function openModal(){
    modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(){
    modal.classList.remove('visible');
    document.body.style.overflow = '';
  }

  trigger.addEventListener('click', function(e){
    e.preventDefault();
    openModal();
  });
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') closeModal();
  });
})();

// ---- Song lyrics player (independent of the scroll-driven scene above)
// — ported from eventos/gali's own music player (app.js's showNextLyric/
// startLyrics/resumeLyrics/pauseLyrics/resetLyrics + its play button's
// click handler), same mechanism, just renamed to this page's own
// element ids. Only the sticky-positioning check lives in Scene 1's own
// updateScene() above (see invSongContainer/invSongEl there) since that's
// the only place with access to the scroll-driven progress value. ----
(function(){
  const audio = document.getElementById('invSongAudio');
  const playBtn = document.getElementById('invSongPlayBtn');
  const song = document.getElementById('invSong');
  if (!audio || !playBtn || !song) return;

  const bars = document.querySelectorAll('#invSongBars .inv-song-bar');
  const lyricsLines = document.querySelectorAll('.inv-song-lyric-line');
  const lyricCurrent = document.getElementById('invSongLyricCurrent');
  const totalLines = lyricsLines.length;

  let lyricsTimers = [];
  let currentLineIndex = -1;
  let lyricsFinished = false;
  let lyricStartTime = 0;
  let lyricRemainingTime = 0;

  function setBarsPlaying(playing){
    bars.forEach(function(b){ b.classList.toggle('playing', playing); });
  }

  function showNextLyric(){
    currentLineIndex++;
    if (currentLineIndex < totalLines){
      const el = lyricsLines[currentLineIndex];
      lyricCurrent.innerHTML = el.innerHTML; // not textContent — this
        // preserves the nested .inv-song-lyric-translation span (and its
        // own smaller/lighter styling) instead of flattening it into one
        // plain string
      lyricCurrent.classList.remove('visible');
      void lyricCurrent.offsetWidth;
      lyricCurrent.classList.add('visible');
      const duration = (parseFloat(el.getAttribute('data-duration')) || 3) * 1000;
      lyricRemainingTime = duration;
      lyricStartTime = Date.now();
      lyricsTimers.push(setTimeout(function(){
        lyricRemainingTime = 0;
        showNextLyric();
      }, duration));
    } else if (currentLineIndex === totalLines){
      lyricCurrent.classList.remove('visible');
      lyricsFinished = true;
      // Player shrinks back to its compact size once the lyrics are done
      // — the audio itself is untouched here, so it just keeps playing.
      lyricsTimers.push(setTimeout(function(){
        song.classList.remove('expanded');
      }, 1000));
    }
  }

  function startLyrics(){
    currentLineIndex = -1;
    lyricRemainingTime = 0;
    lyricCurrent.classList.remove('visible');
    lyricsTimers.push(setTimeout(showNextLyric, 600));
  }

  function resumeLyrics(){
    if (lyricsFinished) return;
    if (currentLineIndex >= 0 && currentLineIndex < totalLines && lyricRemainingTime > 0){
      lyricStartTime = Date.now();
      lyricsTimers.push(setTimeout(function(){
        lyricRemainingTime = 0;
        showNextLyric();
      }, lyricRemainingTime));
    } else {
      startLyrics();
    }
  }

  function pauseLyrics(){
    lyricsTimers.forEach(clearTimeout);
    lyricsTimers = [];
    if (currentLineIndex >= 0 && currentLineIndex < totalLines && lyricRemainingTime > 0){
      const elapsed = Date.now() - lyricStartTime;
      lyricRemainingTime = Math.max(0, lyricRemainingTime - elapsed);
    }
  }

  function resetLyrics(){
    pauseLyrics();
    currentLineIndex = -1;
    lyricRemainingTime = 0;
    lyricCurrent.classList.remove('visible');
    lyricsFinished = false;
  }

  function onPlayStart(){
    playBtn.classList.add('playing');
    setBarsPlaying(true);
    if (!lyricsFinished){
      song.classList.add('expanded');
      resumeLyrics();
    }
  }

  audio.addEventListener('ended', function(){
    playBtn.classList.remove('playing');
    setBarsPlaying(false);
    song.classList.remove('expanded');
    resetLyrics();
  });

  playBtn.addEventListener('click', function(){
    if (audio.paused){
      // Both branches converge on the same onPlayStart(): a browser that
      // blocks/rejects playback (missing file, autoplay policy, etc.)
      // still gets the visual bars/lyrics experience rather than a dead
      // button — same defensive pattern eventos/gali's own togglePlay()
      // uses.
      audio.play().then(onPlayStart).catch(onPlayStart);
    } else {
      audio.pause();
      playBtn.classList.remove('playing');
      setBarsPlaying(false);
      song.classList.remove('expanded');
      pauseLyrics();
    }
  });
})();

// ==================================================================
// SCENE 2 — Branching RSVP ending. No separate section, no extra scroll
// height — this is a fixed-position overlay that reveals itself once
// Scene 1's own timeline settles at progress=1 (window.__boda_emyoOnScene1End,
// called from updateScene() above). The envelope it plays out against is
// Scene 1's REAL #envelope/#envelopeBack/#flap/#seal, briefly "borrowed":
// frozen via window.__scene1Frozen so scrolling can't fight this
// sequence's own writes, then handed back via window.__boda_emyoResyncEnvelope.
// While the card is up, the envelope stays closed, just rotated; on
// confirm it straightens + opens, the card zooms into it, it closes again,
// then flies away. Every visual change is a direct inline-style write in
// a linear chain, not a CSS attribute-selector state machine — after two
// rounds where that pattern quietly reset a property when leaving a
// state, this round drops it for good.
// ==================================================================
(function(){
  const RSVP_FLAG_KEY = 'rsvp_boda_emyo_confirmado'; // rename per copy if this
    // page is ever duplicated into boda2/etc.

  // Guards window.__boda_emyoOnScene1End against firing more than once per
  // pass (updateScene() calls it unconditionally once progress>=0.999).
  // Shared across both branches/reassignments below — and reset by
  // closingAgainBtn's own click handler — so every repeat pass through
  // the invitation ("Ver de nuevo" and scroll through again) shows the
  // closing screen again, not just the first repeat.
  let endingShown = false;

  const card = document.getElementById('rsvpCard');
  if (!card) return;

  const backdrop = document.getElementById('rsvpBackdrop');
  const titleEl = document.getElementById('rsvpCutsceneTitle');
  // Closing screen — shown on top of the (opaque) backdrop at the very end
  // of EITHER branch below: Branch A (already confirmed, reaching the
  // natural end) and Branch B (just confirmed, finishing the cutscene)
  // converge on the exact same showClosingScreen()/button-click pair.
  const closingThanks = document.getElementById('closingThanks');
  const closingNames = document.getElementById('closingNames');
  const closingAgainBtn = document.getElementById('closingAgainBtn');
  // .scene-sticky (position:fixed) always creates its own stacking
  // context — elevating ITS z-index above the backdrop's, right as the
  // closing screen shows, is how the envelope (the only thing left inside
  // it that's actually visible at this point — the sheet has already
  // exited off-screen and hero-text/scroll-hint have already faded to 0)
  // shows through above the backdrop, per the user's request that it stay
  // visible/centered instead of being hidden behind it.
  const sceneSticky = document.querySelector('.scene-sticky');

  // 3-step wizard elements — structure/interaction adapted from
  // mi-bautizo/miguel-sebastian's own RSVP screen (see the plan notes).
  const steps = [
    document.getElementById('rsvpStep0'),
    document.getElementById('rsvpStep1'),
    document.getElementById('rsvpStep2')
  ];
  const dots = [
    document.getElementById('rsvpDot0'),
    document.getElementById('rsvpDot1'),
    document.getElementById('rsvpDot2')
  ];
  const optSi = document.getElementById('rsvpOptSi');
  const optNo = document.getElementById('rsvpOptNo');
  const sideNovio = document.getElementById('rsvpSideNovio');
  const sideNovia = document.getElementById('rsvpSideNovia');
  const nextBtn0 = document.getElementById('rsvpNextBtn0');
  const backBtn1 = document.getElementById('rsvpBackBtn1');
  const nextBtn1 = document.getElementById('rsvpNextBtn1');
  const backBtn2 = document.getElementById('rsvpBackBtn2');
  const guestGroup = document.getElementById('rsvpGuestGroup');
  const guestMinus = document.getElementById('rsvpGuestMinus');
  const guestPlus = document.getElementById('rsvpGuestPlus');
  const guestNumEl = document.getElementById('rsvpGuestNum');
  const nameInput = document.getElementById('rsvpNameInput');
  const errorEl = document.getElementById('rsvpError');
  const summaryEl = document.getElementById('rsvpSummary');
  const submitBtn = document.getElementById('rsvpSubmitBtn');
  const confirmLaterBtn = document.getElementById('rsvpConfirmLaterBtn');

  // Scene 1's real envelope pieces — reused, never cloned. The envelope
  // now opens/closes as part of the confirm sequence (see the submit
  // handler below), so #flap/#seal are referenced here too.
  const envelope = document.getElementById('envelope');
  const envelopeBack = document.getElementById('envelopeBack');
  const flap = document.getElementById('flap');
  const seal = document.getElementById('seal');
  // Wraps #envelope/#envelopeBack (see styles.css) so the whole assembly
  // can be rotated/scaled/flown as one rigid unit. Scene 2 exclusively
  // manipulates THIS element's transform/opacity from here on — it never
  // touches envelope/envelopeBack's own inline transform, which stays
  // exactly as Scene 1 left it (closed, centered) for the whole RSVP phase.
  const envelopeWrapper = document.getElementById('envelop-wrapper');

  function readFlag(){
    try { return !!localStorage.getItem(RSVP_FLAG_KEY); }
    catch (e) { return false; } // localStorage blocked -> fail open to
      // Branch B every visit in that browser; harmless, no crash.
  }

  function persistConfirmation(nombre, personas, lado, asiste){
    try {
      if (!localStorage.getItem(RSVP_FLAG_KEY)){
        localStorage.setItem(RSVP_FLAG_KEY, JSON.stringify({ nombre, personas, lado, ts: Date.now() }));
        if (window.SIFirebase && window.SIFirebase.db){
          const pad = function(n){ return String(n).padStart(2, '0'); };
          const now = new Date();
          const record = {
            nombre: nombre || 'Anónimo(a)',
            personas: personas,
            lado: lado,
            date: pad(now.getDate()) + '/' + pad(now.getMonth() + 1) + '/' + now.getFullYear() + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
            asiste: asiste ? 1 : 0
          };
          const recordId = Date.now().toString(36).slice(-5).padStart(5, '0');
          const base = window.SIFirebase.db.ref('invitations/' + INVITATION_ID + '/contadores');
          base.child('asistentes').child(recordId).set(record);
          if (asiste){
            base.child('confirmados').transaction(function(c){ return (c || 0) + personas; });
          } else {
            base.child('noConfirmados').transaction(function(c){ return (c || 0) + 1; });
          }
        }
      }
    } catch (e) { /* localStorage bloqueado/lleno, o error de Firebase: la sesión sigue funcionando */ }
  }

  // ---- Shared by both branches (hoisted above the readFlag() split) ----
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = reduceMotion
    ? { rotate: 20, cardIn: 20, cardOut: 20, straighten: 20, envelopeOpen: 20, envelopeClose: 20, holdBeforeFly: 150, flyOff: 20, holdAfterSent: 250, backdropFade: 20, backdropFadeOut: 20 }
    : { rotate: 500, cardIn: 650, cardOut: 550, straighten: 450, envelopeOpen: 450, envelopeClose: 450, holdBeforeFly: 900, flyOff: 750, holdAfterSent: 1400, backdropFade: 600, backdropFadeOut: 1400 };

  // Locked for the entire time the card + cutscene (or, for Branch A, the
  // closing screen) are up, so the guest can't scroll away mid-interaction.
  function lockScroll(){
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
  function unlockScroll(){
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  function afterTransition(el, propName, durationMs, cb){
    let done = false;
    function finish(){
      if (done) return;
      done = true;
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
      cb();
    }
    function onEnd(ev){ if (ev.target === el && ev.propertyName === propName) finish(); }
    el.addEventListener('transitionend', onEnd);
    const timer = setTimeout(finish, durationMs + 250);
  }

  // Fades in the closing message + "Ver de nuevo" button on top of the
  // now-opaque backdrop. Called by both branches once their own setup
  // (Branch A: just freezing Scene 1; Branch B: the whole confirm cutscene)
  // has finished and the backdrop has fully covered the screen.
  function showClosingScreen(){
    sceneSticky.style.zIndex = '1000';
    closingThanks.style.opacity = '1';
    closingNames.style.opacity = '1';
    closingAgainBtn.style.opacity = '1';
    closingAgainBtn.style.pointerEvents = 'auto';
  }

  // The simple "already confirmed" ending: freeze Scene 1, cover with the
  // backdrop, reset scroll (safe once hidden behind it), then the shared
  // closing screen. Used both for Branch A (confirmed on a previous visit)
  // and for any pass after the FIRST one in Branch B's own pageview, once
  // a live confirmation has actually been submitted — see the reassignment
  // of window.__boda_emyoOnScene1End at the end of runBackdropSequence() below.
  function showAlreadyConfirmedEnding(){
    window.__scene1Frozen = true;
    lockScroll();
    backdrop.style.transition = 'opacity ' + T.backdropFade + 'ms ease';
    backdrop.style.opacity = '1';
    backdrop.style.pointerEvents = 'auto';
    afterTransition(backdrop, 'opacity', T.backdropFade, function(){
      window.scrollTo(0, 0);
      showClosingScreen();
    });
  }

  // The one and only way either branch's closing screen ever goes away.
  // Resetting envelopeWrapper/flap/seal is a harmless no-op for Branch A
  // (it never touches them) — same reset Branch B's old auto-hide cleanup
  // already did.
  closingAgainBtn.addEventListener('click', function(){
    sceneSticky.style.zIndex = '';
    closingThanks.style.opacity = '0';
    closingNames.style.opacity = '0';
    closingAgainBtn.style.opacity = '0';
    closingAgainBtn.style.pointerEvents = 'none';
    envelopeWrapper.style.transition = '';
    envelopeWrapper.style.transform = '';
    envelopeWrapper.style.opacity = '';
    [flap, seal].forEach(function(el){
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
    });
    window.__scene1Frozen = false;
    endingShown = false;
    if (typeof window.__boda_emyoResyncEnvelope === 'function'){
      window.__boda_emyoResyncEnvelope();
    }
    unlockScroll();
    backdrop.style.transition = 'opacity ' + T.backdropFadeOut + 'ms ease';
    backdrop.style.opacity = '0';
    afterTransition(backdrop, 'opacity', T.backdropFadeOut, function(){
      backdrop.style.pointerEvents = 'none';
    });
  });

  if (readFlag()){
    // Branch A: guest already confirmed on a previous visit. None of the
    // RSVP wizard code below this point ever runs — the envelope is never
    // touched here at all, just: freeze Scene 1, cover with the backdrop,
    // reset scroll (safe now, hidden behind the opaque backdrop), then the
    // same shared closing screen Branch B also ends on.
    window.__boda_emyoOnScene1End = function(){
      if (endingShown) return;
      endingShown = true;
      showAlreadyConfirmedEnding();
    };
    return;
  }

  let triggered = false;
  function onScene1End(){
    if (triggered) return;
    triggered = true;
    window.__scene1Frozen = true;
    lockScroll();

    // Envelope rotates a bit left, still closed, still exactly where it
    // was already resting — no position/teleport needed at all, since
    // .scene-sticky stays stuck here (nothing left below .scroll-section
    // to scroll into), so #envelope's ordinary position:absolute already
    // behaves like position:fixed would for as long as this plays out.
    // Rotated (and scaled up a bit for extra margin) via the WRAPPER, as
    // one rigid unit, so its silhouette stays reliably bigger than the
    // RSVP card in BOTH dimensions at every viewport — the card's height
    // (varies per wizard step, ~270-300px) actually exceeds the envelope's
    // own unscaled height (~239px on a 390px phone), which is what was
    // really hiding it, not just its width.
    envelopeWrapper.style.transition = 'transform ' + T.rotate + 'ms ease';
    envelopeWrapper.style.transform = 'rotate(-30deg)';

    afterTransition(envelopeWrapper, 'transform', T.rotate, function(){
      // Card zooms in, landing on top of the now-rotated envelope (card's
      // z-index sits above .envelope's) — same mechanic as the reference
      // gallery effect: starts oversized+transparent (base CSS, scale(2.2))
      // and shrinks to scale(1) while fading in. No vertical travel at all.
      card.style.transition = 'transform ' + T.cardIn + 'ms cubic-bezier(0.16,1,0.3,1), opacity ' + Math.round(T.cardIn * 0.6) + 'ms ease';
      card.style.transform = 'translate(-50%, -50%) scale(1)';
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
    });
  }

  window.__boda_emyoOnScene1End = onScene1End;

  function runBackdropSequence(){
    backdrop.style.transition = 'opacity ' + T.backdropFade + 'ms ease';
    backdrop.style.opacity = '1';
    backdrop.style.pointerEvents = 'auto';

    // Note: the scroll reset itself already happened earlier, once the
    // envelope had closed again (see the submit handler below) — not here.
    // envelopeWrapper/flap/seal's own reset, unfreezing Scene 1, and
    // unlockScroll() all now happen together in the shared
    // closingAgainBtn click handler above instead of automatically here —
    // scroll stays locked and the envelope stays released-but-hidden
    // behind the backdrop until the guest actually clicks "Ver de nuevo".

    card.style.transition = 'none';
    card.style.transform = 'translate(-50%, -50%) scale(2.2)';
    card.style.opacity = '0';
    card.style.pointerEvents = 'none';
    titleEl.style.opacity = '0';

    afterTransition(backdrop, 'opacity', T.backdropFade, function(){
      // Undo the fly-away — safe now, hidden behind the fully opaque
      // backdrop — so the envelope is back in its normal centered look
      // the instant showClosingScreen() raises .scene-sticky above the
      // backdrop, per the user's request that it stay visible/centered
      // for the closing message rather than staying flown-off and gone.
      envelopeWrapper.style.transition = 'none';
      envelopeWrapper.style.transform = '';
      envelopeWrapper.style.opacity = '';
      showClosingScreen();

      // The confirmation is now persisted — any later pass through the
      // invitation in this same pageview (e.g. after "Ver de nuevo" and
      // scrolling all the way through again) should land on the simple
      // already-confirmed ending instead of re-running (or silently no-
      // op'ing on, per onScene1End's own one-shot guard) the RSVP wizard.
      window.__boda_emyoOnScene1End = function(){
        if (endingShown) return;
        endingShown = true;
        showAlreadyConfirmedEnding();
      };
    });
  }

  let submitting = false;
  let lastName = '';
  let lastGuests = 1;
  let lastSide = 'novio';
  let attendChoice = null; // 'si' | 'no'
  let guestCount = 1;
  let rsvpSide = 'novio'; // 'novio' | 'novia'

  function retriggerShake(el){
    el.classList.remove('rsvp-shake');
    void el.offsetWidth;
    el.classList.add('rsvp-shake');
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function selectAttend(val){
    attendChoice = val;
    optSi.classList.toggle('selected', val === 'si');
    optNo.classList.toggle('selected', val === 'no');
    nextBtn0.classList.add('rsvp-visible');
  }

  function changeGuests(delta){
    guestCount = Math.max(1, Math.min(20, guestCount + delta));
    guestNumEl.textContent = String(guestCount);
  }

  function selectSide(val){
    rsvpSide = val;
    sideNovio.classList.toggle('selected', val === 'novio');
    sideNovia.classList.toggle('selected', val === 'novia');
  }

  function buildSummary(){
    const rows = [
      '<div class="rsvp-summary-row"><span>Asistencia</span><strong>' +
        (attendChoice === 'si' ? 'Sí asistiré' : 'No podré ir') + '</strong></div>',
      '<div class="rsvp-summary-row"><span>Nombre</span><strong>' +
        (escapeHtml(nameInput.value.trim()) || '—') + '</strong></div>',
      '<div class="rsvp-summary-row"><span>De parte de</span><strong>' +
        (rsvpSide === 'novia' ? 'Novia' : 'Novio') + '</strong></div>'
    ];
    if (attendChoice === 'si'){
      rows.push('<div class="rsvp-summary-row"><span>Invitados</span><strong>' + guestCount + '</strong></div>');
    }
    summaryEl.innerHTML = rows.join('');
  }

  function goStep(n){
    if (n === 1 && !attendChoice){
      retriggerShake(steps[0]);
      return;
    }
    if (n === 1){
      guestGroup.style.display = attendChoice === 'no' ? 'none' : '';
    }
    if (n === 2){
      const name = nameInput.value.trim();
      if (!name){
        errorEl.textContent = 'Por favor escribe tu nombre para continuar.';
        retriggerShake(steps[1]);
        nameInput.focus();
        return;
      }
      errorEl.textContent = '';
      buildSummary();
    }
    steps.forEach(function(el, i){ el.classList.toggle('active', i === n); });
    dots.forEach(function(el, i){
      el.classList.toggle('active', i === n);
      el.classList.toggle('done', i < n);
    });
  }

  // Used by confirmLaterBtn's handler below to leave the wizard in a
  // clean state for next time, instead of resuming on whatever step/data
  // a guest abandoned it on.
  function resetWizard(){
    attendChoice = null;
    guestCount = 1;
    guestNumEl.textContent = '1';
    rsvpSide = 'novio';
    sideNovio.classList.add('selected');
    sideNovia.classList.remove('selected');
    nameInput.value = '';
    optSi.classList.remove('selected');
    optNo.classList.remove('selected');
    nextBtn0.classList.remove('rsvp-visible');
    errorEl.textContent = '';
    goStep(0);
  }

  optSi.addEventListener('click', function(){ selectAttend('si'); });
  optNo.addEventListener('click', function(){ selectAttend('no'); });
  sideNovio.addEventListener('click', function(){ selectSide('novio'); });
  sideNovia.addEventListener('click', function(){ selectSide('novia'); });
  guestMinus.addEventListener('click', function(){ changeGuests(-1); });
  guestPlus.addEventListener('click', function(){ changeGuests(1); });
  nextBtn0.addEventListener('click', function(){ goStep(1); });
  backBtn1.addEventListener('click', function(){ goStep(0); });
  nextBtn1.addEventListener('click', function(){ goStep(2); });
  backBtn2.addEventListener('click', function(){ goStep(1); });

  // Escape hatch — backs all the way out of the cutscene without
  // confirming anything. Mirrors closingAgainBtn's own reset below for
  // the envelope/flap/seal (clearing their inline styles falls back to
  // resting CSS, same as that handler), plus parks the card the same
  // way and resets the one-shot `triggered` guard so onScene1End() can
  // run again if the guest scrolls to the end a second time later —
  // directly, not via a window.__boda_emyo* bridge, since `triggered`
  // is declared in this very closure.
  if (confirmLaterBtn){
    confirmLaterBtn.addEventListener('click', function(){
      card.style.transition = '';
      card.style.transform = '';
      card.style.opacity = '';
      card.style.pointerEvents = '';
      envelopeWrapper.style.transition = '';
      envelopeWrapper.style.transform = '';
      envelopeWrapper.style.opacity = '';
      [flap, seal].forEach(function(el){
        el.style.transition = '';
        el.style.transform = '';
        el.style.opacity = '';
      });

      window.__scene1Frozen = false;
      triggered = false;
      unlockScroll();
      window.scrollTo(0, 0);
      if (typeof window.__boda_emyoResyncEnvelope === 'function'){
        window.__boda_emyoResyncEnvelope();
      }
      resetWizard();
    });
  }

  submitBtn.addEventListener('click', function(){
    if (submitting) return;

    const name = nameInput.value.trim();
    submitting = true;
    lastName = name;
    lastGuests = attendChoice === 'si' ? guestCount : 0;
    lastSide = rsvpSide;
    submitBtn.disabled = true;
    persistConfirmation(lastName, lastGuests, lastSide, attendChoice === 'si');

    // Stage 1: envelope straightens AND opens, at the same time — flap
    // swings open / seal fades, same technique Scene 1 itself uses for
    // its own opening, just via a one-shot transition instead of a
    // per-frame write.
    envelopeWrapper.style.transition = 'transform ' + T.straighten + 'ms ease';
    envelopeWrapper.style.transform = 'rotate(0deg)';
    flap.style.transition = 'transform ' + T.envelopeOpen + 'ms ease-in-out, opacity ' + T.envelopeOpen + 'ms ease-in-out';
    flap.style.transform = 'rotateX(100deg)';
    flap.style.opacity = '0';
    seal.style.transition = 'transform ' + T.envelopeOpen + 'ms ease, opacity ' + T.envelopeOpen + 'ms ease';
    seal.style.transform = 'translate(-50%,-50%) scale(0.4)';
    seal.style.opacity = '0';

    afterTransition(envelopeWrapper, 'transform', T.straighten, function(){
      // Stage 2: card zooms "into" the now-open envelope — shrink+fade in
      // place, same mechanic as its entrance in reverse.
      card.style.transition = 'transform ' + T.cardOut + 'ms ease-in, opacity ' + T.cardOut + 'ms ease-in';
      card.style.transform = 'translate(-50%, -50%) scale(0.08)';
      card.style.opacity = '0';
      card.style.pointerEvents = 'none';

      afterTransition(card, 'transform', T.cardOut, function(){
        // Stage 3: envelope closes again. The main scroll is forced to 0
        // right here, not later — it's safe this early because
        // .scene-sticky stays visually "stuck" (rendering identically)
        // for any scroll position within .scroll-section's own range, and
        // Scene 1 stays frozen the whole time regardless, so this has zero
        // visible effect now — it just guarantees the real scroll position
        // already matches progress 0 by the time the envelope is actually
        // released back to Scene 1 at the end of this sequence, so that
        // resync renders correctly immediately with no lag.
        window.scrollTo(0, 0);
        persistConfirmation(lastName, lastGuests, lastSide, attendChoice === 'si'); // idempotent re-write
        flap.style.transition = 'transform ' + T.envelopeClose + 'ms ease-in-out, opacity ' + T.envelopeClose + 'ms ease-in-out';
        flap.style.transform = 'rotateX(0deg)';
        flap.style.opacity = '1';
        seal.style.transition = 'transform ' + T.envelopeClose + 'ms ease, opacity ' + T.envelopeClose + 'ms ease';
        seal.style.transform = 'translate(-50%,-50%) scale(1)';
        seal.style.opacity = '1';
        titleEl.textContent = 'Enviando tu confirmación…';
        titleEl.style.opacity = '1';

        afterTransition(flap, 'transform', T.envelopeClose, function(){
          setTimeout(function(){
            // Stage 4: fly away.
            titleEl.textContent = '¡Confirmación enviada!';
            // No "-50%" in the translate here (unlike the old per-element
            // version) — the wrapper has no size of its own, so a
            // percentage would resolve to 0; 130vw alone is the correct
            // "fly right" distance.
            envelopeWrapper.style.transition = 'transform ' + T.flyOff + 'ms cubic-bezier(.5,0,.85,.35), opacity ' + Math.round(T.flyOff * 0.7) + 'ms ease-in ' + Math.round(T.flyOff * 0.3) + 'ms';
            envelopeWrapper.style.transform = 'translate(130vw, 0) rotate(10deg)';
            envelopeWrapper.style.opacity = '0';
            afterTransition(envelopeWrapper, 'opacity', T.flyOff, function(){
              setTimeout(runBackdropSequence, T.holdAfterSent);
            });
          }, T.holdBeforeFly);
        });
      });
    });
  });
})();
