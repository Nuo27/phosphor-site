/**
 * main.js — Nuo.Dev frontend
 * Vanilla JS. Pairs with assets/js/router.js for client-side navigation.
 * Respects prefers-reduced-motion.
 *
 * Architecture:
 *   · Run-once initializers (atmosphere, scroll bar, lightbox, …) bind
 *     to persistent shell DOM and execute exactly once for the tab.
 *   · Per-navigation initializers (reveal, galleries, search, …) accept
 *     a `scope` (the new <main id="app">) and re-run after every router
 *     swap. IntersectionObservers are tracked on the scope so the router
 *     can disconnect them before replacing the node.
 */

(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;

  // ============================================================
  // Scope-aware observer tracker — router disconnects these
  // before swapping the scope out, so IOs don't leak.
  // ============================================================
  function trackObserver(scope, observer) {
    if (!scope.__observers) scope.__observers = [];
    scope.__observers.push(observer);
    return observer;
  }

  // ============================================================
  // Run-once guard
  // ============================================================
  var ran = {};
  function runOnce(key, fn) {
    if (ran[key]) return;
    ran[key] = true;
    fn();
  }

  // ============================================================
  // CURSOR + TRACE INTERACTION LAYER
  //
  // Architecture (one source of truth per concept):
  //   · Cursor visual state: CSS `:has(:hover)` in _includes/head.html
  //     (browser-native; zero JS).
  //   · Card hover visual: JS-only `.is-hover` (no CSS `:hover` on cards).
  //     updateScrollHover on scroll + pointermove tracks the element
  //     under the cursor. Chromium 149+ doesn't re-evaluate CSS :hover
  //     during scroll, so cards rely entirely on JS-driven .is-hover.
  //   · Card trace (.is-traced + WAAPI --trace-spread): direct
  //     `pointerenter`/`pointerleave` on each card. Gated behind
  //     `(hover: hover) and (pointer: fine)` and
  //     `prefers-reduced-motion: reduce`. Bound once at init; rebound
  //     by router swap (no MutationObserver).
  //   · Cursor renderer's internal `zoom`/`down` locals: JS pointer
  //     events + a single `elementFromPoint` per scroll frame.
  //   · `is-down` / `is-drag` on cursor: pointerdown/up (input state).
  // ============================================================

  var ZOOM_SEL  = '.gallery-slide,[data-lightbox],.featured-item--project img,[data-cursor="zoom"]';
  var DRAG_SEL  = '.gallery-stage,[data-cursor="drag"]';
  var TRACE_SEL = '.project.card, .featured-item';

  // ---- cursor viewport coords (trace angle + scroll refresh) ----
  var cursorX = -1, cursorY = -1;
  window.addEventListener('mousemove', function (e) {
    cursorX = e.clientX; cursorY = e.clientY;
  }, { passive: true });
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse') { cursorX = e.clientX; cursorY = e.clientY; }
  }, { passive: true });

  // ---- JS-tracked state ----
  var zoomTarget = null;
  var isDown = false, isDrag = false;
  var curTraceCard = null;

  function syncCursorState() {
    if (!window.__cursor || typeof window.__cursor.setStates !== 'function') return;
    window.__cursor.setStates({
      hover: false,
      zoom:  !!zoomTarget,
      pulse: false,
      drag:  isDrag,
      down:  isDown,
    });
  }

  // ============================================================
  // WAAPI BORDER-TRACE — entry-angle animation on cards.
  // ============================================================

  function cancelTrace(card) {
    if (!card) return;
    // Animation is interruptible: when the user leaves mid-flight,
    // cancel() removes the WAAPI effect cleanly. If the animation
    // already finished, onfinish wrote the final --trace-spread as
    // an inline style via commitStyles(); removeProperty clears it
    // so the @property initial-value (0deg) takes over.
    if (card.__traceAnim) {
      try { card.__traceAnim.cancel(); } catch (e) {}
      card.__traceAnim = null;
    }
    card.style.removeProperty('--trace-spread');
    card.style.removeProperty('--trace-entry');
  }

  function fireTrace(card, angleDeg) {
    if (!card) return;
    // Touch devices and reduced-motion users don't get the WAAPI
    // animation. CSS @media already hides the trace pseudo; we
    // just persist the final state so it stays visually complete.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      card.style.setProperty('--trace-entry', angleDeg + 'deg');
      card.style.setProperty('--trace-spread', '180deg');
      return;
    }
    card.style.setProperty('--trace-entry', angleDeg + 'deg');
    card.style.setProperty('--trace-spread', '0deg');
    var anim;
    try {
      anim = card.animate(
        [
          { '--trace-spread': '0deg' },
          { '--trace-spread': '180deg' }
        ],
        { duration: 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'none' }
      );
    } catch (e) {
      card.style.setProperty('--trace-spread', '180deg');
      return;
    }
    card.__traceAnim = anim;
    anim.onfinish = function () {
      // === guard so a stale onfinish from a cancelled-and-replaced
      // animation doesn't null the new reference. commitStyles() writes
      // the final animation value (180deg) as inline style; cancelTrace
      // removes it reliably via removeProperty.
      if (card.__traceAnim === anim) {
        try { anim.commitStyles(); } catch (e) {}
        card.__traceAnim = null;
      }
    };
  }

  function computeEntryAngle(card, x, y) {
    var r = card.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var ang = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    if (ang < 0) ang += 360;
    return ang;
  }

  function setTraceCard(card) {
    if (card === curTraceCard) return;
    if (curTraceCard) {
      curTraceCard.classList.remove('is-traced');
      cancelTrace(curTraceCard);
    }
    curTraceCard = card;
    if (card) {
      card.classList.add('is-traced');
      fireTrace(card, computeEntryAngle(card, cursorX, cursorY));
    }
  }

  // ============================================================
  // EVENT WIRING
  // ============================================================

  // Delegated pointerover: tracks the cursor renderer's `zoom` local
  // (head.html reads it for per-frame stateMul). Card trace and body
  // hover are handled by direct card events + CSS `:hover` respectively.
  document.addEventListener('pointerover', function (e) {
    if (!e.target || !e.target.closest) return;
    var zoom = e.target.closest(ZOOM_SEL);
    if (zoom !== zoomTarget) { zoomTarget = zoom; syncCursorState(); }
  }, { passive: true });

  // pointerdown/up → down + drag state (input state, pure JS)
  function onPressStart(e) {
    isDown = true;
    if (e.target && e.target.closest && e.target.closest(DRAG_SEL)) isDrag = true;
    syncCursorState();
  }
  function onPressEnd() {
    if (!isDown) return;
    isDown = false;
    isDrag = false;
    syncCursorState();
  }
  window.addEventListener('pointerdown', onPressStart);
  window.addEventListener('pointerup', onPressEnd);
  window.addEventListener('pointercancel', onPressEnd);

  // ============================================================
  // Direct pointerenter/pointerleave on cards (sameerasw pattern).
  // pointerenter doesn't bubble, so we bind each card. Rebinding
  // happens at the router swap boundary (initPageFeatures calls
  // bindCards()), not via a DOM-wide MutationObserver — that would
  // re-fire on every CSS animation tick during scroll.
  // ============================================================
  function onCardEnter(e) { setTraceCard(e.currentTarget); }
  function onCardLeave(e) {
    var related = e.relatedTarget;
    if (!related || !e.currentTarget.contains(related)) setTraceCard(null);
  }
  function bindCards() {
    cardEls.forEach(function (card) {
      card.removeEventListener('pointerenter', onCardEnter);
      card.removeEventListener('pointerleave', onCardLeave);
    });
    cardEls = Array.prototype.slice.call(document.querySelectorAll(TRACE_SEL));
    cardEls.forEach(function (card) {
      card.addEventListener('pointerenter', onCardEnter);
      card.addEventListener('pointerleave', onCardLeave);
    });
  }
  var cardEls = [];

  // ============================================================
  // SCROLL REFRESH — one elementFromPoint per scroll frame (rAF-coalesced).
  // pointerenter doesn't fire when content scrolls under a stationary
  // pointer. We refresh:
  //   · WAAPI trace target (in case cursor is over a card that
  //     pointerenter didn't fire on)
  //   · cursor renderer's zoom local
  // Body hover is CSS-native and not refreshed here.
  // ============================================================
  var scrollRefRaf = 0;
  function refreshFromScroll() {
    scrollRefRaf = 0;
    if (cursorX < 0) return;
    var el = document.elementFromPoint(cursorX, cursorY);
    if (!el || !el.closest) return;
    setTraceCard(el.closest(TRACE_SEL));
    var z = el.closest(ZOOM_SEL);
    if (z !== zoomTarget) { zoomTarget = z; syncCursorState(); }
  }
  window.addEventListener('scroll', function () {
    if (scrollRefRaf) return;
    scrollRefRaf = requestAnimationFrame(refreshFromScroll);
  }, { passive: true });
  window.addEventListener('resize', function () {
    if (scrollRefRaf) return;
    scrollRefRaf = requestAnimationFrame(refreshFromScroll);
  }, { passive: true });


  // ============================================================
  // RUN-ONCE INITIALIZERS — bind to the persistent shell
  // ============================================================

  // rAF-coalesced scroll position — one native scroll listener feeds
  // every scroll-coupled feature. Each consumer is seeded with the
  // current scrollY on register, then re-fired on scroll (rAF-throttled)
  // and resize (docHeight may have changed).
  var scrollRaf = 0;
  var scrollConsumers = [];
  function fireScrollConsumers(pos) {
    for (var i = 0; i < scrollConsumers.length; i++) {
      try { scrollConsumers[i](pos); } catch (e) {}
    }
  }
  function addScrollConsumer(fn) {
    scrollConsumers.push(fn);
    fn(window.scrollY);
  }
  window.addEventListener('scroll', function () {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(function () {
      scrollRaf = 0;
      fireScrollConsumers(window.scrollY);
    });
  }, { passive: true });
  window.addEventListener('resize', function () { fireScrollConsumers(window.scrollY); }, { passive: true });

  // Chromium 149+: CSS :hover doesn't re-evaluate during scroll when the
  // mouse is stationary. Card hover is JS-only (.is-hover) — driven by
  // updateScrollHover on both scroll and pointermove — so no stale
  // CSS :hover can stick. See SCSS: &:hover removed from card selectors.
  var curScrollHover = null;
  function updateScrollHover() {
    if (cursorX < 0) return;
    var el = document.elementFromPoint(cursorX, cursorY);
    var target = el;
    while (target && !target.matches(TRACE_SEL)) {
      target = target.parentElement;
    }
    if (target !== curScrollHover) {
      if (curScrollHover) curScrollHover.classList.remove('is-hover');
      if (target) target.classList.add('is-hover');
      curScrollHover = target;
    }
  }
  if (!isTouch) {
    window.addEventListener('scroll', updateScrollHover, { passive: true });
    window.addEventListener('pointermove', updateScrollHover, { passive: true });
  }

  function injectAtmosphere() {
    var frag = document.createDocumentFragment();
    ['crt-grain', 'crt-vignette', 'crt-overlay'].forEach(function (cls) {
      var d = document.createElement('div');
      d.className = cls;
      frag.appendChild(d);
    });
    var hud = document.createElement('div');
    hud.className = 'hud-frame';
    ['tl', 'tr', 'bl', 'br'].forEach(function (pos) {
      var c = document.createElement('span');
      c.className = 'hud-corner ' + pos;
      hud.appendChild(c);
    });
    frag.appendChild(hud);
    document.body.appendChild(frag);
  }

  function initScrollProgress() {
    var progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    document.body.prepend(progressBar);
    addScrollConsumer(function (pos) {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var progress = docHeight > 0 ? (pos / docHeight) * 100 : 0;
      progressBar.style.transform = 'scaleX(' + (progress / 100) + ')';
    });
  }

  function initBackToTop() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;
    addScrollConsumer(function (pos) {
      btn.classList.toggle('visible', pos > 500);
    });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  function initNavbarScroll() {
    var navbar = document.querySelector('.navbar-themed');
    if (!navbar) return;
    // .navbar-themed lives on the persistent shell — never swapped by the
    // router — so no isConnected guard needed.
    addScrollConsumer(function (pos) {
      navbar.classList.toggle('scrolled', pos > 50);
    });
  }

  // ============================================================
  // Mobile nav toggle — vanilla collapse (was Bootstrap JS).
  // Navbar lives on the persistent shell, so bind once.
  // ============================================================
  function initNavToggle() {
    var nav = document.getElementById('site-navbar');
    var toggle = document.getElementById('nav-toggle');
    if (!nav || !toggle) return;
    var collapse = document.getElementById('navbarNavAltMarkup');

    function setOpen(open) {
      nav.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!nav.classList.contains('nav-open'));
    });
    if (collapse) {
      collapse.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
    }
    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  // ============================================================
  // Lightbox — overlay mounted once, content discovered via
  // delegation so it picks up images swapped in by the router.
  // ============================================================
  var lightboxApi = null;
  function initLightbox() {
    if (lightboxApi || document.querySelector('.lightbox')) return;

    var overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Image viewer');
    overlay.innerHTML =
      '<span class="lightbox-counter mono"></span>' +
      '<button class="lightbox-btn lightbox-prev" type="button" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>' +
      '<img class="lightbox-img" alt="" />' +
      '<button class="lightbox-btn lightbox-next" type="button" aria-label="Next"><i class="fas fa-chevron-right"></i></button>' +
      '<button class="lightbox-btn lightbox-close" type="button" aria-label="Close"><i class="fas fa-times"></i></button>';
    document.body.appendChild(overlay);

    var imgEl = overlay.querySelector('.lightbox-img');
    var counterEl = overlay.querySelector('.lightbox-counter');
    var prevBtn = overlay.querySelector('.lightbox-prev');
    var nextBtn = overlay.querySelector('.lightbox-next');
    var closeBtn = overlay.querySelector('.lightbox-close');
    var items = [], index = 0, lastFocused = null;

    function srcOf(el) {
      var s = el.getAttribute('data-lightbox-src');
      if (s) return s;
      var inner = el.querySelector && el.querySelector('img');
      return inner ? inner.src : el.src;
    }
    function groupOf(el) {
      var g = el.getAttribute('data-lightbox-group');
      if (g) return g;
      var parent = el.closest('[data-lightbox-group]');
      return parent ? parent.getAttribute('data-lightbox-group') : 'default';
    }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function show(i) {
      index = (i + items.length) % items.length;
      imgEl.src = items[index];
      counterEl.textContent = pad(index + 1) + ' / ' + pad(items.length);
    }
    function open(triggerEl) {
      var group = groupOf(triggerEl);
      var nodes = Array.prototype.slice.call(
        document.querySelectorAll('[data-lightbox-group="' + group + '"] [data-lightbox], [data-lightbox][data-lightbox-group="' + group + '"]')
      );
      var seen = {}; items = [];
      nodes.forEach(function (n) { var s = srcOf(n); if (!seen[s]) { seen[s] = 1; items.push(s); } });
      if (!items.length) items = [srcOf(triggerEl)];
      var start = nodes.indexOf(triggerEl);
      lastFocused = document.activeElement;
      overlay.classList.add('open');
      document.documentElement.style.overflow = 'hidden';
      show(start < 0 ? 0 : start);
      closeBtn.focus();
    }
    function close() {
      overlay.classList.remove('open');
      document.documentElement.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target === closeBtn) close();
    });
    prevBtn.addEventListener('click', function (e) { e.stopPropagation(); show(index - 1); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); show(index + 1); });
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(index - 1);
      else if (e.key === 'ArrowRight') show(index + 1);
    });
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-lightbox]');
      if (!el || el.closest('.gallery')) return;
      e.preventDefault();
      open(el);
    });
    lightboxApi = {
      open: function (group, i) {
        var nodes = Array.prototype.slice.call(
          document.querySelectorAll('[data-lightbox][data-lightbox-group="' + group + '"]')
        );
        var seen = {}; items = [];
        nodes.forEach(function (n) { var s = srcOf(n); if (!seen[s]) { seen[s] = 1; items.push(s); } });
        if (!items.length) return;
        lastFocused = document.activeElement;
        overlay.classList.add('open');
        document.documentElement.style.overflow = 'hidden';
        show(Math.max(0, Math.min(i || 0, items.length - 1)));
        closeBtn.focus();
      }
    };
  }

  // Global "/" handler — opens the first terminal-search scope on the page.
  function bindTerminalSearchKey() {
    function inField(el) {
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
             el.tagName === 'SELECT' || el.isContentEditable;
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (inField(document.activeElement)) return;
      if (document.querySelector('.lightbox.open')) return;
      e.preventDefault();
      var scopes = document.querySelectorAll('[data-terminal-search]');
      for (var i = 0; i < scopes.length; i++) {
        if (scopes[i]._open) { scopes[i]._open(); break; }
      }
    });
  }

  // Global click handler — captures [data-scroll-to] targets into
  // sessionStorage so the destination page can smooth-scroll to them.
  function bindGuidedScrollClick() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-scroll-to]');
      if (!a) return;
      try { sessionStorage.setItem('guidedScroll', a.getAttribute('data-scroll-to')); }
      catch (err) {}
    });
  }

  // ============================================================
  // PER-NAVIGATION INITIALIZERS — run on every <main> swap
  // ============================================================

  // ============================================================
  // Project-page hero kicker typewriter + title word split.
  // Idempotent across PJAX swaps via data markers and isConnected
  // checks on every tick. Reduced motion bypasses all wrapping.
  // ============================================================
  function splitHeroTitle(title) {
    if (!title || title.dataset.split === '1' || reduceMotion) return;
    if (title.querySelector('.hero-w')) { title.dataset.split = '1'; return; }
    var src = title.textContent;
    if (!src) return;
    title.textContent = '';
    var wordIdx = 0;
    src.split(/(\s+)/).forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        title.appendChild(document.createTextNode(part));
        return;
      }
      var wrap = document.createElement('span');
      wrap.className = 'hero-w';
      var inner = document.createElement('span');
      inner.className = 'hero-w-i';
      inner.style.setProperty('--word-i', String(wordIdx++));
      inner.textContent = part;
      wrap.appendChild(inner);
      title.appendChild(wrap);
    });
    title.classList.add('is-ready');
    title.dataset.split = '1';
  }

  function typeHeroKicker(kicker) {
    if (!kicker || kicker.dataset.typed === 'done') return;
    if (kicker.dataset.typed === '1') return; // already running
    if (reduceMotion) {
      kicker.dataset.typed = 'done';
      return;
    }
    var textEl = kicker.querySelector('.kicker-text');
    if (!textEl || textEl.dataset.typer === '1') return;
    textEl.dataset.typer = '1';
    var full = textEl.textContent;
    textEl.textContent = '';

    var typer = document.createElement('span');
    typer.className = 'typer';
    var caret = document.createElement('span');
    caret.className = 'typer-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '_';

    kicker.appendChild(typer);
    kicker.appendChild(caret);

    var i = 0;
    function tick() {
      if (!kicker.isConnected || !textEl.isConnected) return;
      if (i >= full.length) {
        kicker.dataset.typed = 'done';
        caret.classList.add('is-done');
        return;
      }
      typer.appendChild(document.createTextNode(full.charAt(i++)));
      kicker._typerTimer = setTimeout(tick, 28);
    }
    kicker.dataset.typed = '1';
    kicker._typerTimer = setTimeout(tick, 28);
  }

  function initProjectHero(scope) {
    if (!scope.querySelector || !scope.querySelector('.project-detail')) return;
    var kicker = scope.querySelector('.hero-kicker');
    if (kicker) typeHeroKicker(kicker);
    scope.querySelectorAll('.hero-title').forEach(splitHeroTitle);
  }

  // Adds data-reveal to .project-body / .article-body > * with a staggered delay.
  // Reuses the site-wide reveal observer; no new IntersectionObserver.
  function initProjectBodyReveal(scope) {
    var body = scope.querySelector && scope.querySelector('.project-body, .article-body');
    if (!body) return;
    var kids = Array.prototype.slice.call(body.children);
    kids.forEach(function (el, i) {
      if (el.dataset.revealReady === '1') return;
      el.dataset.revealReady = '1';
      el.setAttribute('data-reveal', '');
      el.style.setProperty('--reveal-delay', ((i % 6) * 60) + 'ms');
    });
  }

  function initScrollReveal(scope) {
    var targets = scope.querySelectorAll('.reveal, .reveal-left, .reveal-right, [data-reveal]');
    if (!targets.length) return;
    document.body.classList.add('js-reveal-ready');

    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('visible', 'is-visible'); });
      return;
    }
    var observer = trackObserver(scope, new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (entry.isIntersecting) el.classList.add('visible', 'is-visible');
        else el.classList.remove('visible', 'is-visible');
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }));
    targets.forEach(function (el) { observer.observe(el); });
  }

  // Random work stream — reveal `count` random candidates per pool, per load.
  // Candidates are server-rendered hidden (.rw-item[hidden]); we unhide a
  // random subset, fix their index numbering, and re-apply side alternation.
  // Runs before initScrollReveal so the unhidden items get observed for reveal.
  function initRandomWork(scope) {
    scope.querySelectorAll('[data-random-work]').forEach(function (container) {
      var pool = Array.prototype.slice.call(container.querySelectorAll('.rw-item'));
      if (pool.length <= 1) {
        pool.forEach(function (el) { el.removeAttribute('hidden'); });
        return;
      }
      var count = parseInt(container.getAttribute('data-count'), 10) || 3;
      if (count > pool.length) count = pool.length;
      // Fisher–Yates shuffle
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      pool.slice(0, count).forEach(function (el, i) {
        el.removeAttribute('hidden');
        if (el.classList.contains('featured-item--project')) {
          el.classList.remove('fi-side-left', 'fi-side-right');
          el.classList.add(i % 2 === 0 ? 'fi-side-left' : 'fi-side-right');
        }
        var idx = el.querySelector('.fi-index');
        if (idx) idx.textContent = String(i + 1).padStart(2, '0');
      });
    });
  }

  function initMagneticButtons(scope) {
    if (reduceMotion || isTouch) return;
    scope.querySelectorAll('.btn-primary-custom, .btn-secondary-custom, .btn-project, [data-magnetic]').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var rect = btn.getBoundingClientRect();
        var x = e.clientX - rect.left - rect.width / 2;
        var y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = 'translate(' + (x * 0.15) + 'px, ' + (y * 0.18) + 'px) translateY(-2px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  function initGlitch(scope) {
    if (reduceMotion) return;
    var el = scope.querySelector('[data-glitch]');
    if (!el) return;
    // Signature chromatic-aberration burst — fires ONCE on load as a boot
    // flourish, then retires so it never distracts from the work on repeat
    // visits. (The resolver's is-hover path still lights the wordmark.)
    setTimeout(function () {
      if (!el.isConnected) return;
      el.classList.add('glitching');
      setTimeout(function () { el.classList.remove('glitching'); }, 320);
    }, 2800);
  }

  // Cover-portrait parallax — binds once. After swap the captured
  // portrait becomes detached; subsequent home visits rebind to the
  // new element. Flag prevents duplicate listeners.
  var parallaxBound = false;
  function initParallax(scope) {
    if (parallaxBound) return;
    var portrait = scope.querySelector('.cover-portrait');
    if (!portrait) return;
    if (reduceMotion || isTouch) return;
    parallaxBound = true;
    // Publish --mx / --my in [-0.5, 0.5]; halo + future layers read them
    // independently. rAF-throttled so we don't write on every pixel.
    var raf = 0;
    var lastEvent = null;
    function apply() {
      raf = 0;
      var e = lastEvent;
      if (!e) return;
      var cx = e.clientX / window.innerWidth - 0.5;
      var cy = e.clientY / window.innerHeight - 0.5;
      portrait.style.setProperty('--mx', cx.toFixed(3));
      portrait.style.setProperty('--my', cy.toFixed(3));
    }
    window.addEventListener('mousemove', function (e) {
      lastEvent = e;
      if (raf) return;
      raf = requestAnimationFrame(apply);
    }, { passive: true });
  }

  var heroScrollBound = false;
  function initHeroScroll(scope) {
    if (heroScrollBound) return;
    var hero = scope.querySelector('.landing-wrapper');
    if (!hero) return;
    heroScrollBound = true;
    addScrollConsumer(function (pos) {
      // hero is a child of <main> (router-swapped). Bail once it's gone
      // so we don't keep writing to a detached node across navigations.
      if (!hero.isConnected) return;
      var vh = window.innerHeight;
      if (pos >= vh) return;
      var pp = Math.min(pos / vh, 1);
      hero.style.opacity = String(1 - pp * 0.55);
      hero.style.transform = 'scale(' + (1 - pp * 0.03) + ') translate3d(0,' + (pos * 0.16) + 'px,0)';
    });
  }

  function initHeroAurora(scope) {
    if (!scope.querySelector('.landing-wrapper')) return;
    if (document.querySelector('.hero-aurora')) return;
    var aurora = document.createElement('div');
    aurora.className = 'hero-aurora';
    document.body.appendChild(aurora);
  }

  function augmentMarkdownImages(scope) {
    scope.querySelectorAll('.markdown-body').forEach(function (body, bi) {
      body.querySelectorAll('img:not(.emoji)').forEach(function (img) {
        if (img.closest('.gallery')) return;
        if (img.hasAttribute('data-lightbox')) return;
        img.setAttribute('data-lightbox', '');
        img.setAttribute('data-lightbox-group', 'md-' + bi);
      });
    });
  }

  function initGalleries(scope) {
    var galleries = scope.querySelectorAll('.gallery');
    if (!galleries.length) return;
    var inViewGallery = null;
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

    galleries.forEach(function (gallery) {
      var stage = gallery.querySelector('.gallery-stage');
      var track = gallery.querySelector('.gallery-track');
      var slides = gallery.querySelectorAll('.gallery-slide');
      var thumbs = gallery.querySelectorAll('.gallery-thumb');
      var prevBtn = gallery.querySelector('.gallery-prev');
      var nextBtn = gallery.querySelector('.gallery-next');
      var currentEl = gallery.querySelector('.gallery-current');
      var count = slides.length, index = 0;

      function go(i) {
        index = (i + count) % count;
        gallery.dataset.index = index;
        track.style.transform = 'translateX(' + (-index * 100) + '%)';
        thumbs.forEach(function (t, ti) { t.classList.toggle('active', ti === index); });
        if (currentEl) currentEl.textContent = pad(index + 1);
      }
      gallery._go = go;

      if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); go(index - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); go(index + 1); });
      thumbs.forEach(function (t, ti) {
        t.addEventListener('click', function (e) { e.stopPropagation(); go(ti); });
      });

      var startX = 0, dragging = false, moved = 0, lastDelta = 0;
      function down(e) {
        if (e.target.closest('.gallery-nav, .gallery-thumb')) return;
        dragging = true; moved = 0; lastDelta = 0;
        startX = e.clientX;
        track.classList.add('dragging');
        if (stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (err) {} }
      }
      function move(e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        moved = Math.max(moved, Math.abs(dx));
        lastDelta = dx;
        var edge = ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) ? dx * 0.35 : dx;
        track.style.transform = 'translateX(calc(' + (-index * 100) + '% + ' + edge + 'px))';
      }
      function up() {
        if (!dragging) return;
        dragging = false;
        track.classList.remove('dragging');
        var threshold = Math.max(40, stage.clientWidth * 0.1);
        if (Math.abs(lastDelta) > threshold) go(lastDelta < 0 ? index + 1 : index - 1);
        else go(index);
        if (moved < 8 && lightboxApi) {
          var grp = slides[index].getAttribute('data-lightbox-group');
          if (grp) setTimeout(function () { lightboxApi.open(grp, index); }, 0);
        }
      }
      stage.addEventListener('pointerdown', down);
      stage.addEventListener('pointermove', move);
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
      stage.addEventListener('dragstart', function (e) { e.preventDefault(); });

      if ('IntersectionObserver' in window) {
        trackObserver(scope, new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) inViewGallery = gallery;
            else if (inViewGallery === gallery) inViewGallery = null;
          });
        }, { threshold: 0.6 })).observe(gallery);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (!inViewGallery) return;
      if (document.querySelector('.lightbox.open')) return;
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      var i = parseInt(inViewGallery.dataset.index || '0', 10);
      if (e.key === 'ArrowLeft') { e.preventDefault(); inViewGallery._go(i - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); inViewGallery._go(i + 1); }
    });
  }

  function initCardParallax(scope) {
    if (reduceMotion || isTouch) return;
    scope.querySelectorAll('.featured-item--project').forEach(function (card) {
      var img = card.querySelector('.fi-media img');
      if (!img) return;
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width / 2) / r.width;
        var dy = (e.clientY - r.top - r.height / 2) / r.height;
        img.style.transform = 'translate3d(' + (dx * 10) + 'px,' + (dy * 10) + 'px,0) scale(1.04)';
      });
      card.addEventListener('mouseleave', function () { img.style.transform = ''; });
    });
  }

  // Premium re-entrance: stagger visible cards in (rise + scale + de-blur)
  // when a filter or visibility toggler is applied. Skips opacity so it
  // doesn't fight the scroll-reveal observer.
  function staggerIn(els) {
    Array.prototype.slice.call(els).forEach(function (el, i) {
      el.classList.remove('card-in');
      void el.offsetWidth; // restart the keyframe animation
      el.style.setProperty('--card-in-delay', ((i % 12) * 35) + 'ms');
      el.classList.add('card-in');
    });
  }

  // Outro: play a deactivation animation on a chip/toggler as it loses
  // .is-active. Mirrors the intro (shine + pop) so apply/un-apply feel
  // symmetric. Class is cleared after the longest keyframe finishes.
  function outro(el) {
    if (!el || el.classList.contains('is-outro')) return;
    el.classList.remove('is-outro');
    void el.offsetWidth;
    el.classList.add('is-outro');
    setTimeout(function () { el.classList.remove('is-outro'); }, 700);
  }

  function initTerminalSearch(scope) {
    var scopes = scope.querySelectorAll('[data-terminal-search]');
    if (!scopes.length) return;

    function setup(s) {
      var bar = s.querySelector('.search-bar');
      var input = s.querySelector('.search-input');
      var toggle = s.querySelector('.search-toggle');
      var countEl = s.querySelector('[data-search-count]');
      var empty = s.querySelector('[data-search-empty]');
      var emptyQuery = s.querySelector('[data-search-empty-query]');
      var listEl = document.querySelector(s.getAttribute('data-search-list'));
      var itemSel = s.getAttribute('data-search-item') || '.article-entry';
      if (!bar || !input || !listEl) return;
      // Relocate the empty-state line to just above the grid (below the filter
      // divider) so it reads as a grid status, not part of the search bar.
      if (empty && empty.parentNode !== listEl.parentNode) {
        listEl.parentNode.insertBefore(empty, listEl);
      }
      var items = Array.prototype.slice.call(listEl.querySelectorAll(itemSel));

      function open() { bar.classList.add('active'); setTimeout(function () { input.focus(); }, 150); }
      function close() {
        input.value = '';
        bar.classList.remove('active');
        run();
      }
      function run() {
        var q = input.value.toLowerCase().trim();
        var cat = listEl.dataset.activeCat || 'all';
        var visible = 0, effectiveTotal = 0;
        items.forEach(function (el) {
          // Visibility gate: hidden-by-default cards (e.g. archived work)
          // only count/show when a toggler has added .unhidden to them.
          var isHidden = el.getAttribute('data-visibility') === 'hidden';
          var visOk = !isHidden || el.classList.contains('unhidden');
          if (visOk) effectiveTotal++;
          var textMatch = q === '' || el.textContent.toLowerCase().indexOf(q) !== -1;
          var catMatch = cat === 'all' || el.getAttribute('data-category') === cat;
          var match = textMatch && catMatch && visOk;
          el.style.display = match ? '' : 'none';
          if (match) visible++;
        });
        if (q === '' && cat === 'all') {
          if (countEl) countEl.textContent = effectiveTotal + ' entries';
          listEl.style.display = '';
          if (empty) empty.style.display = 'none';
        } else {
          if (countEl) countEl.textContent = visible + '/' + effectiveTotal;
          listEl.style.display = visible > 0 ? '' : 'none';
          if (empty) empty.style.display = visible === 0 ? '' : 'none';
          if (emptyQuery) emptyQuery.textContent = input.value.trim();
        }
      }

      if (toggle) toggle.addEventListener('click', function () {
        bar.classList.contains('active') ? close() : open();
      });
      input.addEventListener('input', run);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { close(); input.blur(); }
      });
      input.addEventListener('blur', function () {
        if (input.value.trim() === '') bar.classList.remove('active');
      });

      s._open = open;
    }

    scopes.forEach(setup);
  }

  // Category filter chips. Sets listEl.dataset.activeCat, then re-runs the
  // terminal search (now category-aware) when one exists; falls back to a
  // standalone hide/show otherwise.
  function initCategoryFilter(scope) {
    scope.querySelectorAll('[data-category-filter]').forEach(function (nav) {
      var listSel = nav.getAttribute('data-filter-list');
      var itemSel = nav.getAttribute('data-filter-item') || '.card-wrap';
      var listEl = listSel && document.querySelector(listSel);
      if (!listEl) return;
      var chips = Array.prototype.slice.call(nav.querySelectorAll('[data-cat]'));
      var searchInput = document.querySelector('[data-terminal-search][data-search-list="' + listSel + '"] .search-input');

      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          if (chip.classList.contains('is-active')) return;
          chips.forEach(function (c) {
            if (c.classList.contains('is-active')) outro(c);
            c.classList.remove('is-active');
          });
          chip.classList.add('is-active');
          listEl.dataset.activeCat = chip.getAttribute('data-cat');
          if (searchInput) {
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            var active = listEl.dataset.activeCat;
            Array.prototype.slice.call(listEl.querySelectorAll(itemSel)).forEach(function (el) {
              el.style.display = (active === 'all' || el.getAttribute('data-category') === active) ? '' : 'none';
            });
          }
          staggerIn(Array.prototype.slice.call(listEl.querySelectorAll(itemSel))
            .filter(function (el) { return el.style.display !== 'none'; }));
        });
      });
    });
  }

  // Reveals cards hidden by default, one toggler per hidden key (tag/category).
  // Togglers sharing the same grid track a space-separated list of revealed
  // keys on the grid. A hidden card flips to .unhidden when ANY of its
  // data-hidden-keys is toggled on. The terminal search re-runs afterwards so
  // counts stay accurate.
  function initVisibilityToggle(scope) {
    var groups = {};
    scope.querySelectorAll('[data-visibility-toggle]').forEach(function (btn) {
      var sel = btn.getAttribute('data-target');
      (groups[sel] = groups[sel] || []).push(btn);
    });
    Object.keys(groups).forEach(function (sel) {
      var listEl = document.querySelector(sel);
      if (!listEl) return;
      var btns = groups[sel];
      var searchInput = document.querySelector('[data-terminal-search][data-search-list="' + sel + '"] .search-input');

      function revealed() {
        return (listEl.getAttribute('data-revealed-keys') || '').split(/\s+/).filter(Boolean);
      }
      function apply() {
        var keys = revealed();
        var newlyShown = [];
        listEl.querySelectorAll('[data-visibility="hidden"]').forEach(function (el) {
          var cardKeys = (el.getAttribute('data-hidden-keys') || '').split(/\s+/).filter(Boolean);
          var on = cardKeys.length > 0 && cardKeys.some(function (k) { return keys.indexOf(k) !== -1; });
          var wasOn = el.classList.contains('unhidden');
          el.classList.toggle('unhidden', on);
          // scroll-reveal skipped these while collapsed — show them now.
          if (on) el.classList.add('visible', 'is-visible');
          if (on && !wasOn) newlyShown.push(el);
        });
        if (newlyShown.length) staggerIn(newlyShown);
        if (searchInput) searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      btns.forEach(function (btn) {
        var key = btn.getAttribute('data-reveal-key');
        // Chip label is static (tag name + count, set server-side); only the
        // active state flips — same paradigm as the category filter chips.
        function setActive(on) {
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          btn.classList.toggle('is-active', on);
        }
        setActive(revealed().indexOf(key) !== -1);
        btn.addEventListener('click', function () {
          var keys = revealed();
          var i = keys.indexOf(key);
          var turningOn = i === -1;
          if (!turningOn) outro(btn);
          if (turningOn) keys.push(key); else keys.splice(i, 1);
          listEl.setAttribute('data-revealed-keys', keys.join(' '));
          setActive(turningOn);
          apply();
        });
      });
    });
  }
  // Apply a ?tag= filter on arrival: pre-fills the terminal search with the
  // tag name (grid filters by text) and, if that tag is a hidden key, flips
  // its reveal toggle so the hidden cards become searchable too.
  function initTagFilter(scope) {
    var tag;
    try { tag = new URLSearchParams(window.location.search).get('tag'); } catch (err) { return; }
    if (!tag) return;
    var searchScope = scope.querySelector('[data-terminal-search]');
    if (!searchScope) return;
    var input = searchScope.querySelector('.search-input');
    if (!input) return;
    input.value = tag;
    var bar = searchScope.querySelector('.search-bar');
    if (bar) bar.classList.add('active');
    // Reveal the matching hidden-key toggle (portfolio), if any.
    var slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var toggle = scope.querySelector('[data-visibility-toggle][data-reveal-key="' + slug + '"]');
    if (toggle && toggle.getAttribute('aria-pressed') !== 'true') toggle.click();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    try { input.focus(); } catch (e) {}
  }

  // Deep-link sync for ?cat=: on load, activate the matching chip; on click,
  // mirror the active category into the URL. Stacks on the portfolio
  // initCategoryFilter (shared) without modifying it.
  function initCatDeepLink(scope) {
    var nav = scope.querySelector('[data-category-filter]');
    if (!nav) return;
    var chips = nav.querySelectorAll('[data-cat]');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        try {
          var u = new URL(window.location.href);
          var cat = chip.getAttribute('data-cat');
          if (cat === 'all') u.searchParams.delete('cat');
          else u.searchParams.set('cat', cat);
          window.history.replaceState({}, '', u);
        } catch (err) {}
      });
    });
    try {
      var cat = new URLSearchParams(window.location.search).get('cat');
      if (cat) {
        var target = nav.querySelector('[data-cat="' + cat + '"]');
        if (target && !target.classList.contains('is-active')) target.click();
      }
    } catch (err) {}
  }

  // Tag filter chips: clicking fills the terminal search (grep) with the tag
  // name, composing with the active category filter (search reads activeCat).
  // Mirrors ?tag= deep-linking — syncs active state from the search input.
  function initTagChips(scope) {
    var chips = scope.querySelectorAll('[data-tag-chip]');
    if (!chips.length) return;
    var searchScope = scope.querySelector('[data-terminal-search]');
    var input = searchScope && searchScope.querySelector('.search-input');
    if (!input) return;
    function syncActive() {
      var q = input.value.trim().toLowerCase();
      Array.prototype.slice.call(chips).forEach(function (c) {
        c.classList.toggle('is-active', q !== '' && c.getAttribute('data-tag-chip').toLowerCase() === q);
      });
    }
    Array.prototype.slice.call(chips).forEach(function (chip) {
      chip.addEventListener('click', function () {
        var tag = chip.getAttribute('data-tag-chip');
        var target = input.value.trim().toLowerCase() === tag.toLowerCase() ? '' : tag;
        input.value = target;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        syncActive();
        try {
          var u = new URL(window.location.href);
          if (target) u.searchParams.set('tag', target);
          else u.searchParams.delete('tag');
          window.history.replaceState({}, '', u);
        } catch (err) {}
      });
    });
    syncActive();
  }

  // Reads the guided-scroll target set by the previous page's
  // [data-scroll-to] click, then smooth-scrolls to it.
  function initGuidedScroll() {
    var target;
    try { target = sessionStorage.getItem('guidedScroll'); } catch (err) {}
    if (!target) return;
    try { sessionStorage.removeItem('guidedScroll'); } catch (err) {}
    var el = document.getElementById(target);
    if (!el) return;

    window.scrollTo(0, 0);
    setTimeout(function () {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }, 500);
  }

  // ============================================================
  // initPageFeatures — public hook the router calls after each swap.
  // `scope` is the new <main id="app"> (or `document` on initial load).
  // ============================================================
  function initPageFeatures(scope) {
    scope = scope || document;

    // Run once (lifetime of tab)
    runOnce('atmosphere', injectAtmosphere);
    runOnce('scrollProgress', initScrollProgress);
    runOnce('backToTop', initBackToTop);
    runOnce('navbarScroll', initNavbarScroll);
    runOnce('navToggle', initNavToggle);
    runOnce('lightbox', initLightbox);
    runOnce('terminalSearchKey', bindTerminalSearchKey);
    runOnce('guidedScrollClick', bindGuidedScrollClick);

    // Per navigation
    initHeroAurora(scope);
    initProjectHero(scope);
    initProjectBodyReveal(scope);
    initRandomWork(scope);
    initScrollReveal(scope);
    initMagneticButtons(scope);
    initGlitch(scope);
    initParallax(scope);
    initHeroScroll(scope);
    initGalleries(scope);
    augmentMarkdownImages(scope);
    if (window.__cursor && window.__cursor.bindScrollables) window.__cursor.bindScrollables(scope);
    initCardParallax(scope);
    initTerminalSearch(scope);
    initCategoryFilter(scope);
    initVisibilityToggle(scope);
    initTagFilter(scope);
    initCatDeepLink(scope);
    initTagChips(scope);
    initGuidedScroll();
    // Rebind direct pointerenter/pointerleave on cards in the new
    // <main>. Router swaps replace <main>; cards in the old scope
    // are gone, so we re-query and re-bind here.
    bindCards();
    // A route swap replaced <main>; what's under the cursor changed,
    // so the trace target + zoom local must be re-resolved next frame.
    refreshFromScroll();
  }

  window.__initPageFeatures = initPageFeatures;

  // Initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initPageFeatures(document); });
  } else {
    initPageFeatures(document);
  }
})();