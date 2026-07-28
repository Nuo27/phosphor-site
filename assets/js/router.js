/**
 * router.js — soft router for the Jekyll site.
 *
 * Intercepts internal link clicks, fetches the destination HTML,
 * parses it, and swaps only <main id="app"> into the live document.
 * The shell (head, cursor controller, navbar, footer, atmosphere,
 * scroll bar, lightbox, …) is preserved across every in-app
 * navigation, so the custom cursor and every other persistent UI
 * element live for the lifetime of the tab — no re-creation, no
 * persistence layer, no native-cursor flash.
 *
 * Where supported, wraps the swap in document.startViewTransition
 * for a native cross-fade. Falls back to a direct swap otherwise.
 *
 * Falls back to a full browser navigation when the destination is
 * not a shell page (no <main id="app"> found) — e.g., the 404 page.
 */

(function () {
  'use strict';

  var APP_SEL = '#app';
  var cache = new Map();
  var inflight = new Map();
  var prefetched = new Set();

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // ============================================================
  // Helpers
  // ============================================================

  function isModifiedEvent(e) {
    return !!(e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1));
  }

  function shouldIgnore(a, e) {
    if (!a || !a.getAttribute('href')) return true;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return true;
    if (a.target && a.target !== '' && a.target !== '_self') return true;
    if (a.hasAttribute('download')) return true;
    if (a.hasAttribute('data-router-off')) return true;
    if (a.dataset.router === 'off') return true;
    var lower = href.toLowerCase();
    if (lower.indexOf('mailto:') === 0 || lower.indexOf('tel:') === 0 ||
        lower.indexOf('javascript:') === 0 || lower.indexOf('data:') === 0) return true;
    try {
      var u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return true;
    } catch (err) { return true; }
    if (isModifiedEvent(e)) return true;
    return false;
  }

  function findLink(el) {
    while (el && el !== document.body) {
      if (el.tagName === 'A' && el.getAttribute('href')) return el;
      el = el.parentNode;
    }
    return null;
  }

  function normalizeUrl(href) {
    try { return new URL(href, location.href).href; }
    catch (e) { return null; }
  }

  // ============================================================
  // Fetch + parse
  // ============================================================

  async function fetchPage(url) {
    if (cache.has(url)) return cache.get(url);
    if (inflight.has(url)) return inflight.get(url);
    var p = fetch(url, {
      headers: { 'X-Router': '1', 'Accept': 'text/html' },
      credentials: 'same-origin',
      redirect: 'follow'
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, 'text/html');
      cache.set(url, doc);
      inflight.delete(url);
      return doc;
    }).catch(function (err) {
      inflight.delete(url);
      throw err;
    });
    inflight.set(url, p);
    return p;
  }

  function extractPage(doc) {
    var app = doc.querySelector(APP_SEL);
    if (!app) return null;
    var title = doc.title || '';
    function meta(name) {
      var m = doc.querySelector('meta[property="' + name + '"]');
      return m ? m.getAttribute('content') : null;
    }
    return {
      app: app,
      title: title,
      ogTitle: meta('og:title'),
      ogDesc: meta('og:description'),
      ogImage: meta('og:image')
    };
  }

  // ============================================================
  // DOM updates
  // ============================================================

  function updateHead(page) {
    if (page.title) document.title = page.title;
    function setMeta(name, val) {
      if (!val) return;
      var m = document.querySelector('meta[property="' + name + '"]');
      if (m) m.setAttribute('content', val);
    }
    setMeta('og:title', page.ogTitle);
    setMeta('og:description', page.ogDesc);
    setMeta('og:image', page.ogImage);
  }

  function updateNavbar(pathname) {
    var links = document.querySelectorAll('#site-navbar .nav-link');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var match = false;
      try {
        var u = new URL(a.getAttribute('href'), location.origin);
        var p = u.pathname;
        match = (p === pathname) || (p !== '/' && pathname.indexOf(p) === 0);
      } catch (e) {}
      a.classList.toggle('active', match);
    }
    // Brand links to '/', so it doubles as the homepage's current-page
    // indicator. Exact match only — the prefix-match above would light the
    // brand on every route.
    var brand = document.querySelector('#site-navbar .navbar-brand');
    if (brand) brand.classList.toggle('active', pathname === '/');
  }

  function cleanupOldScope(oldScope) {
    if (!oldScope || !oldScope.__observers) return;
    for (var i = 0; i < oldScope.__observers.length; i++) {
      try { oldScope.__observers[i].disconnect(); } catch (e) {}
    }
    oldScope.__observers.length = 0;
  }

  function doSwap(newApp) {
    var oldApp = document.querySelector(APP_SEL);
    if (oldApp) {
      cleanupOldScope(oldApp);
      oldApp.replaceWith(newApp);
    } else {
      // Shell broken — bail to full nav
      throw new Error('No #app in current document');
    }
  }

  // ============================================================
  // Navigate
  // ============================================================

  async function navigate(url, opts) {
    opts = opts || {};
    var fromScroll = window.scrollY;
    var pathname;
    try { pathname = new URL(url, location.origin).pathname; }
    catch (e) { pathname = url; }

    var page;
    try {
      var doc = await fetchPage(url);
      page = extractPage(doc);
    } catch (err) {
      // Network / parse error → full browser navigation
      location.href = url;
      return;
    }
    if (!page) {
      // Non-shell page (e.g. 404) → full browser navigation
      location.href = url;
      return;
    }

    if (!opts.pop) {
      history.pushState({ url: url, scrollY: fromScroll }, '', url);
    }

    var swap = function () {
      updateHead(page);
      doSwap(page.app);
      updateNavbar(pathname);
      if (window.__initPageFeatures) window.__initPageFeatures(page.app);
      // Reset scroll: 0 on forward nav, restored position on popstate.
      var to = opts.pop ? (typeof opts.toScroll === 'number' ? opts.toScroll : 0) : 0;
      window.scrollTo(0, to);
    };

    if (opts.skipTransition || typeof document.startViewTransition !== 'function') {
      swap();
    } else {
      document.startViewTransition(swap);
    }
  }

  // ============================================================
  // Event wiring
  // ============================================================

  function onLinkClick(e) {
    var a = findLink(e.target);
    if (!a) return;
    if (shouldIgnore(a, e)) return;
    // Same-page hash: let the browser handle the anchor jump.
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.pathname === location.pathname && u.hash) return;
    e.preventDefault();
    navigate(u.href);
  }

  function onPopState(e) {
    // Browser-managed entry (same-page hash nav, e.g. footnote links) has no
    // router state. Don't re-fetch — just scroll to the anchor target, since
    // scrollRestoration:'manual' disables the browser's native scroll-on-pop.
    if (!e.state || !e.state.url) {
      if (location.hash) {
        var t = document.getElementById(location.hash.slice(1));
        if (t) {
          // Inline refs (sup/a) → centre of viewport so context is visible.
          // Block targets (li/div) → top of viewport so they read from start.
          var block = (t.tagName === 'SUP' || t.tagName === 'A') ? 'center' : 'start';
          t.scrollIntoView({ block: block });
        }
      } else {
        window.scrollTo(0, 0);
      }
      return;
    }
    var to = (e.state && typeof e.state.scrollY === 'number') ? e.state.scrollY : 0;
    navigate(location.href, { pop: true, skipTransition: true, toScroll: to });
  }

  // hashchange fires for same-page anchor clicks (footnote refs, back-links).
  // Belt-and-braces alongside the browser's native scroll, in case
  // scrollRestoration:'manual' or the smooth-scroll wrapper interferes.
  function onHashChange() {
    if (!location.hash) return;
    var t = document.getElementById(location.hash.slice(1));
    if (!t) return;
    var block = (t.tagName === 'SUP' || t.tagName === 'A') ? 'center' : 'start';
    requestAnimationFrame(function () {
      t.scrollIntoView({ behavior: 'smooth', block: block });
    });
  }

  function prefetch(url) {
    if (!url || cache.has(url) || prefetched.has(url)) return;
    prefetched.add(url);
    fetchPage(url).catch(function () { prefetched.delete(url); });
  }

  function onPrefetchIntent(e) {
    var a = findLink(e.target);
    if (!a || shouldIgnore(a)) return;
    var url = normalizeUrl(a.getAttribute('href'));
    if (url) prefetch(url);
  }

  function initRouter() {
    document.addEventListener('click', onLinkClick);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('mouseover', onPrefetchIntent);
    document.addEventListener('focusin', onPrefetchIntent);
    document.addEventListener('touchstart', onPrefetchIntent, { passive: true });
    history.replaceState({ url: location.href, scrollY: 0 }, '');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter, { once: true });
  } else {
    initRouter();
  }
})();