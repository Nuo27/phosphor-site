(function () {
  'use strict';

  // ============================================================
  // 1. GATE — fine pointer + motion only.
  //    Touch / reduced-motion keep the native cursor. The class
  //    is added eagerly so the inlined `cursor:none` rule hides
  //    the native cursor from frame 1.
  // ============================================================
  if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.documentElement.classList.add('custom-cursor');

  // cfg — every effect tunable / independently toggleable
  var cfg = {
    rate: 27,               // per-second position smoothing: k = 1 - exp(-rate·dt); critically damped, zero overshoot, identical at any refresh rate
    snap: 0.4,              // px dead-zone — gap below this locks render coords to the pointer, ending the asymptotic sub-pixel chase at rest
    velZero: 0.1,           // px/frame@60fps below which filtered velocity clamps to 0
    velRate: 9,             // per-second EMA on velocity (≈110ms τ) — heavy filter so the signal feeding every effect is stable
    dirLock: 2.0,           // px/frame@60fps (~120px/s) — direction vector refreshes only above this; frozen below so atan2 never reads a near-zero vector
    effLow: 1.0,            // px/frame@60fps (~60px/s) — effect blend is 0 below (calm + precise)
    effHigh: 3.0,           // px/frame@60fps (~180px/s) — effect blend is 1 above (fully expressive); smoothstep between effLow/effHigh
    effRate: 12,            // per-second EMA on the effect blend itself — fade is gradual, no abrupt on/off around the band
    maxTilt: 12,            // deg — how far the triangle leans into movement
    velScaleMax: 0.14,      // speed-based enlargement ceiling
    velScaleRef: 24,        // px/frame@60fps at which enlargement saturates
    tiltSnap: 0.05,         // deg — at true rest, snap tilt to exactly 0 (stable transform string)
    scaleSnap: 0.002,       // at true rest, snap velScale to rest (stable transform string)
    trail: { lerp: [0.5, 0.4, 0.32, 0.25], opacity: [0.22, 0.13, 0.07, 0.03] },
    enable: { trail: true, tilt: true }
  };

  // ============================================================
  // 2. STATE — in-memory only.
  //    assets/js/router.js keeps the document shell alive across
  //    in-app navigation, so this controller runs once and lives
  //    for the lifetime of the tab. No persistence layer, no
  //    navigation handoff — state survives because the runtime
  //    survives.
  // ============================================================
  var p = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  var seenMove = false;

  // ============================================================
  // 3. RENDERER — node tree + rAF loop. Pure state→transform;
  //    knows nothing about page content.
  // ============================================================
  var el = document.createElement('div');
  el.id = 'cursor-root';

  var body = document.createElement('div'); body.className = 'cursor-body';

  var glow = document.createElement('div'); glow.className = 'cursor-glow';
  body.appendChild(glow);

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cursor-vector');
  svg.setAttribute('viewBox', '0 0 40 40');
  function poly(cls, points, extras) {
    var n = document.createElementNS(NS, 'polygon');
    n.setAttribute('class', cls);
    n.setAttribute('points', points);
    if (extras) for (var k in extras) n.setAttribute(k, extras[k]);
    svg.appendChild(n);
    return n;
  }
  poly('cursor-aurora-outer-halo', '0,0 24,0 0,24', { pathLength: '1' });
  poly('cursor-outline', '0,0 24,0 0,24');
  poly('cursor-aurora-outer-core', '0,0 24,0 0,24', { pathLength: '1' });
  poly('cursor-core', '0,0 14,0 0,14');
  poly('cursor-aurora-inner', '2.5,2.5 9,2.5 2.5,9', { pathLength: '1' });
  body.appendChild(svg);

  var trails = [];
  if (cfg.enable.trail) {
    for (var i = 0; i < cfg.trail.lerp.length; i++) {
      var t = document.createElement('div'); t.className = 'cursor-trail';
      el.appendChild(t);
      trails.push({ el: t, x: p.x, y: p.y });
    }
  }
  el.appendChild(body);

  function lerp(a, b, k) { return a + (b - a) * k; }
  function smoothstep(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

  // Interaction flags. `zoom` and `down` are still read by render()
  // (per-frame stateMul + filter blur); they're synced to the
  // external resolver in §5 via the `setStates` API. Hover / pulse /
  // drag live entirely in the external resolver now — this module
  // is a renderer, not a hover detector.
  var zoom = false, down = false;

  // Render coords start at viewport centre; the cursor is invisible
  // (opacity:0) until the first mousemove, so this never paints.
  // Velocity (fvx/fvy) is derived from the smoothed render deltas
  // below, not from raw mousemove /dt, so tilt/scale/trail all read
  // a value that already inherits the position smoothing — a single
  // noisy mousemove can't jerk them.
  var rx = p.x, ry = p.y, tilt = 0, velScale = 1;
  var prevRx = rx, prevRy = ry, fvx = 0, fvy = 0, lastFrame = performance.now();
  var dir = { x: 1, y: 0 }, effectAmt = 0;   // frozen movement direction (unit vec) + continuous [0,1] effect blend

  function render() {
    var now = performance.now();
    var dt = Math.max(1, now - lastFrame); lastFrame = now;   // dt in ms (used for px/ms velocity below)
    var dts = dt / 1000;                                       // seconds — for the per-second exponential smoothers
    var k = down ? 1 : 1 - Math.exp(-cfg.rate * dts);   // framerate-independent critically-damped smoothing, zero overshoot

    // Dead-zone snap: once the gap is sub-perceptual, lock to pointer
    // instead of asymptotically chasing a sub-pixel difference that
    // never resolves — the original source of the low-speed tremor.
    var dx = p.x - rx, dy = p.y - ry;
    if (dx * dx + dy * dy < cfg.snap * cfg.snap) { rx = p.x; ry = p.y; }
    else { rx += dx * k; ry += dy * k; }

    // Filtered velocity: rx is already position-smoothed, then a framerate-independent
    // EMA on top (velRate) → one stable signal drives direction, tilt, scale, and trail.
    var ivx = (rx - prevRx) / dt, ivy = (ry - prevRy) / dt;
    prevRx = rx; prevRy = ry;
    var vk = 1 - Math.exp(-cfg.velRate * dts);
    fvx = lerp(fvx, ivx, vk); fvy = lerp(fvy, ivy, vk);
    var sp = Math.hypot(fvx, fvy) * 16;        // ≈ px/frame@60fps
    if (sp < cfg.velZero) { fvx = 0; fvy = 0; sp = 0; }

    // Frozen direction: refresh only above dirLock so atan2 never reads a near-zero
    // vector. Below it the previous heading is retained → tilt stays stable at low
    // speed and resumes instantly in the right direction when movement picks up.
    if (sp >= cfg.dirLock) {
      var dm = Math.hypot(fvx, fvy);
      if (dm > 1e-6) { dir.x = fvx / dm; dir.y = fvy / dm; }
    }

    // Continuous effect blend: smoothstep across [effLow, effHigh] then EMA-smoothed.
    // No hard gate anywhere → effects fade in/out imperceptibly; hovering in the band
    // settles effectAmt to an intermediate value instead of flickering 0↔1.
    effectAmt = lerp(effectAmt, smoothstep(cfg.effLow, cfg.effHigh, sp), 1 - Math.exp(-cfg.effRate * dts));

    // Tilt leans into the frozen direction; magnitude scales with effectAmt so it
    // fades to 0 at low speed. Stable target → monotonic ease, never oscillation.
    var tiltTarget = 0;
    if (cfg.enable.tilt) {
      var ang = Math.atan2(dir.y, dir.x) * 180 / Math.PI - 45;
      ang = ((ang + 180) % 360 + 360) % 360 - 180;
      tiltTarget = Math.max(-cfg.maxTilt, Math.min(cfg.maxTilt, ang)) * effectAmt;
    }
    tilt = lerp(tilt, tiltTarget, 0.18);
    if (Math.abs(tilt) < cfg.tiltSnap) tilt = 0;             // sub-perceptual → snap to 0, stable string

    // velScale: state multiplier × (1 + speed-enlargement × effectAmt). Fades cleanly to
    // the state's rest scale at low speed (no tilt/scale wobble), no double-application
    // of zoom/down (the multiplier lives in stateMul, applied once).
    var stateMul = down ? 0.86 : (zoom ? 1.12 : 1);
    var speedScale = Math.min(sp / cfg.velScaleRef, cfg.velScaleMax);
    var ts = stateMul * (1 + speedScale * effectAmt);
    velScale = lerp(velScale, ts, 0.2);
    if (Math.abs(velScale - stateMul) < cfg.scaleSnap) velScale = stateMul;

    // Translate stays sub-pixel (raw float) for buttery motion at every speed; at
    // rest the dead-zone snap drives rx/ry to integer p.x/p.y so the string is
    // byte-stable anyway. rot is quantized (2dp/3dp) and, once effectAmt fades
    // below 0.01, the snaps above force it to the exact rest string → the body
    // layer stops re-transforming and the cursor is perfectly still.
    var tx = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
    var rot = 'rotate(' + tilt.toFixed(2) + 'deg) scale(' + velScale.toFixed(3) + ')';
    el.style.transform = tx;
    body.style.transform = rot;
    spot.style.transform = tx + ' ' + rot;   // mirror body: translate + rotate + velScale → ring never drifts

    if (trails.length) {
      var px = rx, py = ry;
      for (var i = 0; i < trails.length; i++) {
        var tr = trails[i];
        tr.x = lerp(tr.x, px, cfg.trail.lerp[i]);
        tr.y = lerp(tr.y, py, cfg.trail.lerp[i]);
        tr.el.style.transform = 'translate3d(' + (tr.x - rx).toFixed(1) + 'px,' + (tr.y - ry).toFixed(1) + 'px,0)';
        tr.el.style.opacity = cfg.trail.opacity[i] * effectAmt;
        px = tr.x; py = tr.y;
      }
    }

    requestAnimationFrame(render);
  }

  // ============================================================
  // 4. LIFECYCLE — mount once, run forever.
  //    The cursor stays visible continuously; in-app navigation
  //    via the soft router never destroys this controller.
  // ============================================================
  function show() { el.style.opacity = '1'; spot.style.opacity = ''; }
  function hide() { el.style.opacity = '0'; spot.style.opacity = '0'; }

  document.documentElement.appendChild(el);

  // Invert ring — masked triangular ring, sibling of #cursor-root so
  // its fill's mix-blend-mode reaches the page. Outer triangle scales
  // with --cursor-outline-scale from the centroid (locked to
  // .cursor-outline); inner hole stays fixed at the .cursor-core
  // boundary so the cut-out always aligns with the tip.
  var spot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  spot.setAttribute('class', 'cursor-spot');
  spot.setAttribute('viewBox', '0 0 40 40');
  (function () {
    var NS = 'http://www.w3.org/2000/svg';
    var defs = document.createElementNS(NS, 'defs');
    var mask = document.createElementNS(NS, 'mask');
    mask.setAttribute('id', 'cursor-ring-mask');
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('x', '0'); mask.setAttribute('y', '0');
    mask.setAttribute('width', '40'); mask.setAttribute('height', '40');
    function mpoly(cls, points, fill) {
      var n = document.createElementNS(NS, 'polygon');
      if (cls) n.setAttribute('class', cls);
      n.setAttribute('points', points);
      n.setAttribute('fill', fill);
      mask.appendChild(n);
    }
    mpoly('cursor-ring-outer', '0,0 24,0 0,24', '#FFFFFF');   // scales with outline
    mpoly(null, '0,0 14,0 0,14', '#000000');                   // fixed hole = core boundary
    defs.appendChild(mask);
    spot.appendChild(defs);
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('class', 'cursor-spot-fill');
    rect.setAttribute('x', '0'); rect.setAttribute('y', '0');
    rect.setAttribute('width', '40'); rect.setAttribute('height', '40');
    rect.setAttribute('mask', 'url(#cursor-ring-mask)');
    spot.appendChild(rect);
  })();
  document.documentElement.appendChild(spot);

  requestAnimationFrame(render);

  var lastMouseMove = 0;
  window.addEventListener('mousemove', function (e) {
    // Velocity is render-derived (see fvx/fvy in render()), so this
    // handler only records position — no /dt noise enters the system.
    p.x = e.clientX; p.y = e.clientY;
    lastMouseMove = performance.now();
    if (!seenMove) {
      // First move after load: snap render coords (+ trails) to the
      // pointer so the cursor's first visible frame is exactly at the
      // pointer, instead of lerping in from the viewport centre it was
      // seeded at. prevRx/prevRx also snapped → no velocity burst.
      rx = p.x; ry = p.y; prevRx = rx; prevRy = ry;
      for (var i = 0; i < trails.length; i++) { trails[i].x = rx; trails[i].y = ry; }
    }
    seenMove = true;
    show();
  }, { passive: true });
  document.addEventListener('mouseleave', hide);
  document.addEventListener('mouseenter', function () { if (seenMove) show(); });

  // ============================================================
  // 4b. SCROLLBAR DRAG TRACKING — during native scrollbar thumb
  //     drag the OS captures the pointer, mousemove stops firing.
  //     Track the scroll delta and apply it proportionally to the
  //     cursor position so the custom cursor follows the thumb.
  //     Wheel scroll is excluded (mouse hasn't moved, position is
  //     correct). prevScrollY updates on every event to avoid
  //     stale deltas after wheel-scroll skips.
  // ============================================================
  var lastWheel = 0;
  window.addEventListener('wheel', function () { lastWheel = performance.now(); }, { passive: true });

  var prevScrollY = window.scrollY;
  window.addEventListener('scroll', function () {
    var dy = window.scrollY - prevScrollY;
    prevScrollY = window.scrollY;
    if (!seenMove) return;
    var now = performance.now();
    if (now - lastMouseMove < 80) return;
    if (now - lastWheel < 150) return;
    if (dy === 0) return;
    p.y += dy * window.innerHeight / document.documentElement.scrollHeight;
    show();
  }, { passive: true });

  // ============================================================
  // 5. INTERACTION LAYER — driven externally.
  //    Hover / zoom / pulse / drag / down states are owned by the
  //    centralized hover resolver in assets/js/main.js, which
  //    recomputes them on every mousemove, scroll, and smooth-
  //    scroll frame. That module calls `window.__cursor.setStates`
  //    below with the resolved state — this IIFE is now a pure
  //    renderer + cursor position tracker. render() still reads
  //    `zoom` and `down` directly (per-frame stateMul / filter
  //    blur), so setStates keeps those locals in sync.
  // ============================================================
  window.__cursor = {
    setStates: function (s) {
      var c = el.classList;
      c.toggle('is-hover', !!s.hover);
      c.toggle('is-zoom',  !!s.zoom);
      c.toggle('is-pulse', !!s.pulse);
      c.toggle('is-drag',  !!s.drag);
      c.toggle('is-down',  !!s.down);
      zoom = !!s.zoom;
      down = !!s.down;
    },
    bindScrollables: function (scope) {
      if (!scope || !scope.querySelectorAll) return;
      scope.querySelectorAll('pre, table').forEach(function (node) {
        if (node.__sbBound) return;
        node.__sbBound = true;
        var prevLeft = node.scrollLeft, prevTop = node.scrollTop;
        node.addEventListener('scroll', function () {
          var dx = node.scrollLeft - prevLeft;
          var dy = node.scrollTop - prevTop;
          prevLeft = node.scrollLeft;
          prevTop = node.scrollTop;
          if (!seenMove) return;
          var now = performance.now();
          if (now - lastMouseMove < 80) return;
          if (now - lastWheel < 150) return;
          if (dx !== 0) p.x += dx * node.clientWidth / node.scrollWidth;
          if (dy !== 0) p.y += dy * node.clientHeight / node.scrollHeight;
          if (dx !== 0 || dy !== 0) show();
        }, { passive: true });
      });
    }
  };
})();
