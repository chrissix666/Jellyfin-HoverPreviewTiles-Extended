/**
 * Jellyfin – Collection Preview
 * ---------------------------------------------
 * Hover a BoxSet (collection) card and its poster images spread out,
 * rising half out of the card like a hand of cards being opened.
 *
 * The preview tracks your mouse: the tile nearest the cursor rotates
 * upright, comes to the front with a white ring and its title, and
 * its neighbours part around it — all driven continuously by pointer
 * position for a fluid feel. Click a tile to jump to that item.
 *
 * This is a plain client-side script, not a compiled .NET plugin. Load it
 * with a JS-injection tool, e.g. the "JavaScript Injector" plugin
 * (github.com/n00bcodr/Jellyfin-JavaScript-Injector) — paste this whole file
 * into a new script entry — or by adding a <script> tag to jellyfin-web's
 * index.html. It only touches the DOM/CSS and Jellyfin's existing
 * window.ApiClient, so it works alongside your other customizations.
 */
(function () {
  "use strict";

  // Guard against double-init: injector tools can re-run this script on SPA navigation.
  if (window.__jfCollectionPreviewLoaded) return;
  window.__jfCollectionPreviewLoaded = true;

  const CARD_SELECTOR = '.card[data-type="BoxSet"]';

  const CONFIG = {
    hoverDelay: 220,        // ms to wait before opening (avoids flicker on quick passes)
    maxPosters: 100,          // most posters to show at once
    posterWidth: 110,       // px (height is derived from 2:3 aspect)
    maxSpreadDeg: 110,      // total arc width once "full"
    degPerPoster: 16,       // arc grows with poster count up to maxSpreadDeg
    lift: 130,              // px the preview rises above its pivot
    overlap: 0.5,           // fraction of the poster that stays INSIDE the card (0.5 = half in, half above)
    hoverPushDeg: 11,       // how far neighbours get pushed away from the focused tile
    hoverSpreadScale: 1.06, // whole preview opens slightly wider while the pointer is tracking
    smoothing: 0.18,        // per-frame lerp factor for pointer tracking (higher = snappier)
    staggerMs: 28,          // delay between each tile's animation
    closeMs: 220,
    scrollSettleMs: 160,    // ms of scroll silence before the preview may reappear

    // --- Alternative Mode: Hover Play-Button Instead Of Whole Title Card ---
    // By default the preview opens on hovering ANYWHERE over the card tile.
    // Set this to true to instead require the pointer to be over the small
    // center zone — the same spot where Jellyfin's own hover play-button
    // (".cardOverlayFab-primary") sits and enlarges/recolors via native CSS
    // ":hover". Both opening AND closing follow the zone: the preview opens
    // once the pointer settles inside it, and closes as soon as the pointer
    // leaves it — even while still over the rest of the card. Moving onto
    // one of the already-open floating poster tiles is exempt (otherwise
    // you could never reach them to click). If a card has no play button at
    // all (e.g. a user without play permission), there's simply no zone to
    // trigger on and the preview won't open for that card in this mode.
    centerHoverOnly: true,

    // --- Alternative Mode: Subtile Play Button On Focus ---
    // When true, the currently FOCUSED poster tile (the raised one with the
    // white ring/title) also grows its own miniature replica of Jellyfin's
    // own play-button overlay, scaled down to the tile's size. Clicking it
    // does NOT try to tap into Jellyfin's internal playbackManager directly
    // (confirmed unreachable from an injected script) — instead it
    // navigates to the item's real details page and then automatically
    // clicks Jellyfin's own, genuinely-wired Play/Resume button there
    // (".mainDetailButtons .btnPlay" / ".btnResume"), covering the brief
    // transition with an overlay so it feels instant. See
    // playItemDirect() for the full flow and its honest limitations.
    subtileFocusPlayButton: true,
    subtilePlayButtonSizeRatio: 0.4, // button diameter, as a fraction of CONFIG.posterWidth
    directPlayButtonTimeoutMs: 4000, // how long to wait for the details page's real Play/Resume button to appear
    directPlayRevealDelayMs: 500,    // how long to wait after clicking the real Play/Resume button before fading the black transition overlay away — tune this if the "silent" details page still flashes through (increase) or the reveal feels sluggish (decrease)
  };

  const POSTER_HEIGHT = CONFIG.posterWidth * 1.5; // 2:3 aspect
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Real problems only — no verbose tracing.
  const warn = (...args) => console.warn("[collection-preview]", ...args);
  const err = (...args) => console.error("[collection-preview]", ...args);

  // ---- styles -------------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    .jf-preview-container{position:fixed;top:0;left:0;width:0;height:0;z-index:9999;pointer-events:none;}
    .jf-preview-arm{position:absolute;top:0;left:0;width:0;height:0;
      transform:rotate(0deg) translateY(0px);
      transition:transform ${reduceMotion ? "0s" : ".45s cubic-bezier(.22,.85,.25,1.15)"};}
    .jf-preview-tile{position:absolute;top:0;left:0;width:${CONFIG.posterWidth}px;aspect-ratio:2/3;
      border-radius:6px;background:#222;overflow:hidden;
      box-shadow:0 8px 20px rgba(0,0,0,.55);
      transform:translate(-50%,-50%) scale(.6);opacity:0;
      pointer-events:auto;cursor:pointer;
      transition:transform ${reduceMotion ? "0s" : ".4s cubic-bezier(.22,.85,.25,1.15)"}, opacity .25s ease;}
    .jf-preview-arm.jf-preview-raised .jf-preview-tile{box-shadow:0 0 0 2px #fff, 0 14px 32px rgba(0,0,0,.75);}
    .jf-preview-poster{display:block;width:100%;height:100%;object-fit:cover;}
    .jf-preview-title{position:absolute;left:0;right:0;bottom:0;padding:18px 6px 6px;
      background:linear-gradient(transparent,rgba(0,0,0,.85));color:#fff;
      font-size:.72em;font-weight:600;line-height:1.25;text-align:center;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      opacity:0;transition:opacity .2s ease;pointer-events:none;}
    .jf-preview-title.jf-preview-scrolling{text-overflow:clip;text-align:left;}
    .jf-preview-title-inner{display:inline-block;white-space:nowrap;}
    .jf-preview-arm.jf-preview-raised .jf-preview-title{opacity:1;}
    .jf-preview-arm.jf-preview-raised .jf-preview-title-inner.jf-preview-scroll{
      animation:jf-preview-marquee var(--jf-preview-marquee-dur,6s) linear .6s infinite;}
    @keyframes jf-preview-marquee{
      0%,12%{transform:translateX(0);}
      44%,56%{transform:translateX(var(--jf-preview-marquee-x,0px));}
      88%,100%{transform:translateX(0);}
    }
    .jf-preview-more{display:flex;align-items:center;justify-content:center;color:#fff;
      font-weight:700;font-size:.85em;background:rgba(0,0,0,.6);}
    .jf-preview-playbtn{display:none;position:absolute;top:50%;left:50%;opacity:1;
      width:${CONFIG.posterWidth * CONFIG.subtilePlayButtonSizeRatio}px;
      height:${CONFIG.posterWidth * CONFIG.subtilePlayButtonSizeRatio}px;
      margin-top:-${(CONFIG.posterWidth * CONFIG.subtilePlayButtonSizeRatio) / 2}px;
      margin-left:-${(CONFIG.posterWidth * CONFIG.subtilePlayButtonSizeRatio) / 2}px;
      border-radius:50%;background-color:rgba(0,0,0,.7);color:#fff;
      align-items:center;justify-content:center;cursor:pointer;pointer-events:auto;
      border:none;padding:0;transition:transform .2s, background-color .2s, color .2s;}
    .jf-preview-arm.jf-preview-raised .jf-preview-tile .jf-preview-playbtn{display:flex;}
    .jf-preview-playbtn:hover{transform:scale(1.4);
      background-color:rgba(var(--accent, 0,164,220),.35);color:rgb(var(--accent, 0,164,220));}
    .jf-preview-transition-overlay{position:fixed;inset:0;width:100vw;height:100vh;
      max-width:none;max-height:none;margin:0;padding:0;border:none;background:#000;
      z-index:999999;opacity:0;pointer-events:none;transition:opacity .25s ease;}
    .jf-preview-transition-overlay::backdrop{background:transparent;}
  `;
  document.head.appendChild(style);

  // ---- state ----------------------------------------------------------
  const itemCache = new Map();        // collectionId -> {Items, TotalRecordCount}
  const hoverTimers = new WeakMap();  // card -> pending "open" timeout
  let active = null;                  // currently open preview's state (shape defined in buildPreview)
  const lastMouse = { x: -1, y: -1 }; // last known pointer position (used after scroll/fetch settle)
  let isScrolling = false;
  let scrollEndTimer = null;
  let zoneCard = null;                 // centerHoverOnly: card whose center-zone currently holds the pointer

  // ---- Jellyfin API helpers ---------------------------------------------
  function getApiClient() {
    return window.ApiClient || null;
  }

  function getPosterUrl(item, api) {
    const opts = { type: "Primary", maxHeight: 300, quality: 90, tag: item.ImageTags && item.ImageTags.Primary };
    return typeof api.getScaledImageUrl === "function"
      ? api.getScaledImageUrl(item.Id, opts)
      : api.getImageUrl(item.Id, opts);
  }

  /**
   * Navigate to an item's detail page. Prefers Jellyfin's own router when
   * it's exposed, falls back to hash navigation (handles both the old
   * "#!/details" and newer "#/details" URL styles).
   */
  function goToItem(itemId) {
    const api = getApiClient();
    const serverId = api && typeof api.serverId === "function" ? api.serverId() : null;
    const query = `id=${itemId}${serverId ? `&serverId=${serverId}` : ""}`;
    try {
      if (window.Emby && window.Emby.Page && typeof window.Emby.Page.show === "function") {
        window.Emby.Page.show(`/details?${query}`);
        return;
      }
    } catch (e) {
      warn("Emby.Page.show failed, falling back to hash navigation", e);
    }
    const prefix = window.location.hash.startsWith("#!") ? "#!/details?" : "#/details?";
    window.location.href = prefix + query;
  }

  // ---- direct play (subtileFocusPlayButton) -----------------------------
  // We confirmed Jellyfin's internal playbackManager isn't reachable from an
  // injected script (no global exposure, no delegated click system, and a
  // live webpack-module-cache probe on the actual instance came back empty).
  // What DOES reliably work: navigating to the item's real details page
  // (same mechanism as goToItem above) and then clicking Jellyfin's own,
  // genuinely-wired Play/Resume button there — ".mainDetailButtons .btnPlay"
  // / ".btnResume" — exactly as a user would. A full-viewport overlay masks
  // the brief in-between moment so it reads as "instant play" rather than a
  // visible page flip. This relies on the browser still treating the
  // resulting click as user-initiated (needed for audio/video autoplay)
  // across the short async wait — true for SPA route changes in practice,
  // but not a hard guarantee on every browser. If anything times out, we
  // simply reveal whatever page we ended up on (normally the details page)
  // instead of leaving the user stuck looking at a black screen.
  let transitionOverlay = null;
  function showTransitionOverlay() {
    if (!transitionOverlay) {
      // A <dialog> shown via showModal() renders in the browser's native
      // "top layer" — a special rendering layer that sits above the entire
      // regular document, completely independent of z-index or stacking
      // contexts anywhere else on the page. A plain fixed <div> with a high
      // z-index (the previous approach) is still just part of the normal
      // document stacking order and can in principle be out-stacked by
      // something elsewhere on the page; the top layer cannot be.
      transitionOverlay = document.createElement("dialog");
      transitionOverlay.className = "jf-preview-transition-overlay";
      document.body.appendChild(transitionOverlay);
    }
    // Shown INSTANTLY (transition disabled) so nothing underneath can ever
    // flash through while we navigate — the .25s fade only applies later,
    // on the way OUT in hideTransitionOverlay(), once real playback exists.
    transitionOverlay.style.transition = "none";
    transitionOverlay.style.opacity = "1";
    if (!transitionOverlay.open) {
      try {
        transitionOverlay.showModal();
      } catch (e) {
        warn("showTransitionOverlay: showModal() failed, falling back to plain visibility", e);
      }
    }
    void transitionOverlay.offsetWidth; // force the instant state to actually commit
  }
  function hideTransitionOverlay() {
    if (!transitionOverlay) return;
    transitionOverlay.style.transition = "opacity .25s ease";
    void transitionOverlay.offsetWidth; // commit the transition being re-enabled before animating opacity
    transitionOverlay.style.opacity = "0";
    // Actually close it (removing it from the top layer) once the fade has
    // finished, rather than leaving an invisible-but-still-open dialog
    // sitting in the top layer indefinitely.
    setTimeout(() => {
      if (transitionOverlay && transitionOverlay.open) transitionOverlay.close();
    }, 260);
  }

  function playItemDirect(itemId) {
    showTransitionOverlay();
    // Double rAF: a style change is only guaranteed to have been PAINTED by
    // the time two animation frames have passed. Without this, navigation
    // could start racing the browser's very first paint of the (now fully
    // opaque) overlay, letting a brief flash of the details page slip
    // through before the overlay visually lands.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        goToItem(itemId);
        runDirectPlayClickSequence(itemId);
      });
    });
  }

  function runDirectPlayClickSequence(itemId) {
    const clickDeadline = performance.now() + CONFIG.directPlayButtonTimeoutMs;
    const tryClick = () => {
      // goToItem() only kicks off navigation asynchronously and returns
      // immediately — right after that, the PREVIOUS details page (whatever
      // item the person last viewed) can still be fully present in the DOM,
      // complete with its own valid, non-hidden Play/Resume button. Without
      // this guard we could find and click THAT stale button before
      // Jellyfin has swapped in the page for the item we actually want.
      // Only proceed once the URL itself reflects navigation to this item.
      if (!window.location.hash.includes(itemId)) {
        if (performance.now() < clickDeadline) {
          setTimeout(tryClick, 50);
        } else {
          warn("playItemDirect: navigation to the target item never completed in time");
          hideTransitionOverlay();
        }
        return;
      }
      const btn =
        document.querySelector(".mainDetailButtons .btnResume:not(.hide)") ||
        document.querySelector(".mainDetailButtons .btnPlay:not(.hide)");
      if (btn) {
        btn.click();
        // Fixed buffer: reveal 200ms after the click, giving Jellyfin's own
        // visible reaction (loading state, player container, etc.) time to
        // begin before we start fading the overlay away.
        setTimeout(hideTransitionOverlay, CONFIG.directPlayRevealDelayMs);
        return;
      }
      if (performance.now() < clickDeadline) {
        setTimeout(tryClick, 50);
      } else {
        warn("playItemDirect: real Play/Resume button never appeared in time");
        hideTransitionOverlay();
      }
    };
    tryClick();
  }

  /** Fetches a collection's child items, caching by collectionId so repeat hovers don't re-fetch. */
  function fetchCollectionItems(collectionId) {
    if (itemCache.has(collectionId)) return Promise.resolve(itemCache.get(collectionId));

    const api = getApiClient();
    if (!api) {
      warn("ApiClient not ready, aborting fetch for", collectionId);
      return Promise.reject(new Error("ApiClient not ready"));
    }
    return api
      .getItems(api.getCurrentUserId(), {
        ParentId: collectionId,
        SortBy: "PremiereDate",
        SortOrder: "Ascending",
        Fields: "PrimaryImageAspectRatio",
        Limit: CONFIG.maxPosters + 1,
      })
      .then((result) => {
        itemCache.set(collectionId, result);
        return result;
      })
      .catch((e) => {
        err("getItems failed for", collectionId, e);
        throw e;
      });
  }

  // ---- geometry ----------------------------------------------------------
  /**
   * The preview's pivot point for a given card: horizontally centered, and
   * positioned so CONFIG.overlap of the middle tile's poster sits inside
   * the card while the rest rises above it. Shared by buildPreview() (initial
   * placement) and repositionActive() (keeping it glued to the card).
   */
  function getPivot(rect) {
    const x = rect.left + rect.width / 2;
    const posterCenterY = rect.top + POSTER_HEIGHT * (CONFIG.overlap - 0.5);
    const y = posterCenterY + CONFIG.lift;
    return { x, y };
  }

  /**
   * centerHoverOnly: is the pointer currently triggering Jellyfin's own
   * hover state on this card's play button? ".cardOverlayFab-primary" grows
   * (scale 1.4x) and — in some themes — changes color purely via native CSS
   * ":hover", so asking the browser whether IT considers the button hovered
   * gives us the exact rendered hit-area for free (including the enlarged
   * state), no geometry math needed.
   */
  function getPlayButton(card) {
    return card.querySelector(".cardOverlayFab-primary");
  }

  function isInCenterZone(card) {
    const btn = getPlayButton(card);
    if (!btn) return false; // no play button on this card — no zone, no trigger
    try {
      return btn.matches(":hover");
    } catch (e) {
      return false; // ":hover" in .matches() should be universally supported; fail closed if not
    }
  }

  // ---- open/close ----------------------------------------------------------
  function clearActive(instant) {
    if (!active) return;
    const a = active;
    clearTimeout(a.closeTimeout);
    if (a.raf) cancelAnimationFrame(a.raf);

    if (instant) {
      a.container.remove();
      active = null;
      return;
    }

    // Manual-mode tracking (below) turns off CSS transitions; restore them, and
    // force a reflow, so the close animation actually plays.
    a.tiles.forEach((b) => {
      b.arm.style.transition = "";
      b.tile.style.transition = "";
    });
    void a.container.offsetWidth;
    a.tiles.forEach((b, i) => {
      const delay = (a.tiles.length - 1 - i) * CONFIG.staggerMs;
      b.arm.style.transitionDelay = `${delay}ms`;
      b.arm.style.transform = "rotate(0deg) translateY(0px)";
      b.tile.style.transitionDelay = `${delay}ms`;
      b.tile.style.opacity = "0";
      b.tile.style.transform = "translate(-50%,-50%) scale(.6)";
    });
    const finished = a.container;
    setTimeout(() => finished.remove(), CONFIG.closeMs + a.tiles.length * CONFIG.staggerMs);
    active = null;
  }

  /**
   * Creates one arm + tile pair and wires click-through navigation. Does NOT
   * trigger the opening animation itself — buildPreview() does that for all
   * tiles at once, after forcing a reflow (see there for why).
   * `canPlay` marks real, playable items (not the "+N" more-badge tile) —
   * only those get the optional replicated focus play-button.
   */
  function buildTile(container, angle, contentEl, titleText, itemId, canPlay) {
    const arm = document.createElement("div");
    arm.className = "jf-preview-arm";

    const tile = document.createElement("div");
    tile.className = "jf-preview-tile";
    tile.appendChild(contentEl);

    let titleEl = null;
    let titleInner = null;
    if (titleText) {
      titleEl = document.createElement("div");
      titleEl.className = "jf-preview-title";
      titleInner = document.createElement("span");
      titleInner.className = "jf-preview-title-inner";
      titleInner.textContent = titleText;
      titleEl.appendChild(titleInner);
      tile.appendChild(titleEl);
    }

    if (CONFIG.subtileFocusPlayButton && canPlay && itemId) {
      const playBtn = document.createElement("button");
      playBtn.type = "button";
      // Note: deliberately NOT using Jellyfin's "cardOverlayButton-hover"
      // class here — that class carries opacity:0 in Jellyfin's own global
      // stylesheet, only revealed via ".card-hoverable:hover", which our
      // floating tile never satisfies (it isn't nested in a real .card).
      playBtn.className = "jf-preview-playbtn";
      // A self-contained SVG triangle instead of Jellyfin's own icon font
      // ligature ("play_arrow") — that text only renders as a glyph if the
      // exact matching icon font/version is loaded; otherwise it just shows
      // as literal text. fill="currentColor" picks up our own CSS color
      // (white), so this always renders correctly, independent of Jellyfin's
      // icon font.
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="50%" height="50%" fill="currentColor" style="pointer-events:none"><path d="M8 5v14l11-7z"/></svg>';
      playBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearActive(true);
        playItemDirect(itemId);
      });
      tile.appendChild(playBtn);
    }

    if (itemId) {
      tile.addEventListener("click", (e) => {
        // The mini play-button (if present) is handled by Jellyfin's own
        // item-action system, or is a silent no-op if that isn't reachable —
        // either way, never treat it as "go to details" here.
        if (e.target.closest(".jf-preview-playbtn")) return;
        e.preventDefault();
        e.stopPropagation();
        clearActive(true);
        goToItem(itemId);
      });
    }

    arm.appendChild(tile);
    container.appendChild(arm);

    return { arm, tile, titleEl, titleInner, marqueeMeasured: false, base: angle, cur: angle, tgt: angle, rot: 0, focused: false };
  }

  function buildPreview(card, rect, items, totalCount) {
    const api = getApiClient();
    const container = document.createElement("div");
    container.className = "jf-preview-container";

    const pivot = getPivot(rect);
    container.style.left = `${pivot.x}px`;
    container.style.top = `${pivot.y}px`;

    const shown = items.slice(0, CONFIG.maxPosters);
    const extra = totalCount - shown.length;
    const n = shown.length + (extra > 0 ? 1 : 0);
    const spread = n > 1 ? Math.min(CONFIG.maxSpreadDeg, (n - 1) * CONFIG.degPerPoster) : 0;
    const step = n > 1 ? spread / (n - 1) : CONFIG.degPerPoster;

    const tiles = [];
    shown.forEach((item, i) => {
      const angle = -spread / 2 + i * step;
      const img = document.createElement("img");
      img.className = "jf-preview-poster";
      img.src = getPosterUrl(item, api);
      img.alt = item.Name || "";
      // Hide broken posters instead of showing the browser's broken-image icon.
      img.onerror = () => { img.style.visibility = "hidden"; };
      tiles.push(buildTile(container, angle, img, item.Name || "", item.Id, true));
    });

    if (extra > 0) {
      const i = shown.length;
      const angle = -spread / 2 + i * step;
      const badge = document.createElement("div");
      badge.className = "jf-preview-poster jf-preview-more";
      badge.textContent = `+${extra}`;
      // "+N" badge opens the collection itself, where the rest can be seen.
      tiles.push(buildTile(container, angle, badge, "", card.dataset.id, false));
    }

    document.body.appendChild(container);

    // Force a reflow so the tiles' CSS start state (opacity:0, scale(.6),
    // set via the stylesheet) is actually committed before we set the
    // target state below. Without this, a single requestAnimationFrame
    // isn't a reliable enough boundary — depending on timing the browser can
    // coalesce both states into the same paint, and the tiles just "pop"
    // into place instead of animating (this is the same technique already
    // used for the close animation in clearActive()).
    void container.offsetWidth;

    requestAnimationFrame(() => {
      tiles.forEach((b, i) => {
        b.arm.style.transitionDelay = `${i * CONFIG.staggerMs}ms`;
        b.arm.style.transform = `rotate(${b.base}deg) translateY(-${CONFIG.lift}px)`;
        b.tile.style.transitionDelay = `${i * CONFIG.staggerMs}ms`;
        b.tile.style.opacity = "1";
        b.tile.style.transform = "translate(-50%,-50%) scale(1)";
      });
    });

    // Default stacking before any hover: leftmost card on top.
    tiles.forEach((b, i) => { b.arm.style.zIndex = String(tiles.length - i); });

    const previewHalfWidth = Math.sin(((spread / 2) * Math.PI) / 180) * CONFIG.lift + CONFIG.posterWidth / 2;
    active = {
      card,
      container,
      tiles,
      pivotX: pivot.x,
      pivotY: pivot.y,
      spread,
      step,
      rect,
      previewHalfWidth,
      focusedIdx: null,
      manual: false,
      raf: null,
      // Don't hijack the tiles until the opening animation has played out.
      readyAt: performance.now() + n * CONFIG.staggerMs + 500,
      closeTimeout: null,
    };
  }

  // ---- pointer tracking -------------------------------------------------
  function setFocused(idx) {
    if (!active || active.focusedIdx === idx) return;
    if (active.focusedIdx != null) {
      const prev = active.tiles[active.focusedIdx];
      prev.arm.classList.remove("jf-preview-raised");
      prev.focused = false;
    }
    active.focusedIdx = idx;
    if (idx != null) {
      const next = active.tiles[idx];
      next.arm.classList.add("jf-preview-raised");
      next.focused = true;

      // Titles that don't fit get a back-and-forth marquee so the whole
      // name can be read. Measured lazily on first focus.
      if (!next.marqueeMeasured && next.titleEl && !reduceMotion) {
        next.marqueeMeasured = true;
        const pad = 12; // horizontal padding of .jf-preview-title (6px each side)
        const overflow = next.titleInner.offsetWidth - (next.titleEl.clientWidth - pad);
        if (overflow > 2) {
          const dist = overflow + 6;
          next.titleInner.style.setProperty("--jf-preview-marquee-x", `-${dist}px`);
          next.titleInner.style.setProperty("--jf-preview-marquee-dur", `${Math.max(4, dist / 20)}s`);
          next.titleInner.classList.add("jf-preview-scroll");
          next.titleEl.classList.add("jf-preview-scrolling");
        }
      }

      // Z-index falls off with distance from the hovered tile in both directions,
      // so e.g. hovering the leftmost tile still puts the middle one above the right side.
      active.tiles.forEach((b, i) => {
        b.arm.style.zIndex = String(active.tiles.length - Math.abs(i - idx));
      });
    }
    // idx === null: z-index is intentionally left as-is here (avoids a visual jump);
    // it's reset to left-to-right order on the next rebuild in buildPreview().
  }

  /**
   * Switch from CSS-transition mode to per-frame manual mode and start
   * the smoothing loop. Each frame every tile eases toward its target
   * angle, and the focused tile counter-rotates so it reads upright.
   */
  function enterManualMode(a) {
    a.manual = true;
    a.tiles.forEach((b) => {
      b.arm.style.transition = "none";
      b.arm.style.transitionDelay = "0ms";
      b.tile.style.transition = "opacity .25s ease";
      b.tile.style.transitionDelay = "0ms";
    });
    const loop = () => {
      if (active !== a) return;
      a.tiles.forEach((b) => {
        b.cur += (b.tgt - b.cur) * CONFIG.smoothing;
        const rotTgt = b.focused ? -b.cur : 0;
        b.rot += (rotTgt - b.rot) * CONFIG.smoothing;
        b.arm.style.transform = `rotate(${b.cur}deg) translateY(-${CONFIG.lift}px)`;
        b.tile.style.transform = `translate(-50%,-50%) rotate(${b.rot}deg)`;
      });
      a.raf = requestAnimationFrame(loop);
    };
    a.raf = requestAnimationFrame(loop);
  }

  /**
   * centerHoverOnly: once a preview is open, this is the region that counts
   * as "still within reach of it" — the card itself, plus the arc above it
   * that the spread tiles occupy. Moving from the play button towards a
   * tile necessarily crosses bare card/gap space first, so gating on the
   * tiny button zone alone would close the preview before you ever reach a
   * tile. left/right/top mirror the focus-tracking region in onPointerMove()
   * for visual consistency; bottom covers the full card (not just the top
   * third used there) since leaving is a coarser decision than focusing.
   */
  function isWithinPreviewBounds(a, x, y) {
    const r = a.rect;
    const left = Math.min(r.left, a.pivotX - a.previewHalfWidth);
    const right = Math.max(r.right, a.pivotX + a.previewHalfWidth);
    const top = a.pivotY - CONFIG.lift - POSTER_HEIGHT / 2 - 10;
    const bottom = r.bottom;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  function onPointerMove(x, y) {
    const a = active;
    if (!a || !a.tiles) return;

    // Focus tracking only applies above the top third of the card;
    // the lower two-thirds leave the preview at rest.
    const r = a.rect;
    const left = Math.min(r.left, a.pivotX - a.previewHalfWidth);
    const right = Math.max(r.right, a.pivotX + a.previewHalfWidth);
    const top = a.pivotY - CONFIG.lift - POSTER_HEIGHT / 2 - 10;
    const bottom = r.top + r.height / 3;

    if (x < left || x > right || y < top || y > bottom) {
      setFocused(null);
      a.tiles.forEach((b) => { b.tgt = b.base; });
      return;
    }

    // Tile centers sit at sin(angle) * lift, so asin() inverts that to map the
    // pointer's x-offset onto the arc — a tile focuses exactly when the pointer
    // lines up with where it visually sits, keeping the outermost tiles reachable.
    const t = Math.max(-1, Math.min(1, (x - a.pivotX) / CONFIG.lift));
    const theta = (Math.asin(t) * 180) / Math.PI;

    let idx = 0;
    let best = Infinity;
    a.tiles.forEach((b, i) => {
      const d = Math.abs(b.base - theta);
      if (d < best) { best = d; idx = i; }
    });
    setFocused(idx);

    if (reduceMotion) return; // ring + title only, no motion
    if (!a.manual) {
      if (performance.now() < a.readyAt) return; // let the open animation finish
      enterManualMode(a);
    }

    // Neighbours are pushed away from the (continuous) focus angle, so the
    // parting ripples across the spread as the pointer sweeps.
    const sigma = a.step;
    a.tiles.forEach((b) => {
      const d = b.base - theta;
      const push = CONFIG.hoverPushDeg * Math.sign(d) * Math.exp(-((d / sigma) * (d / sigma)));
      b.tgt = b.base * CONFIG.hoverSpreadScale + (b.focused ? 0 : push);
    });
  }

  document.addEventListener("mousemove", (e) => {
    lastMouse.x = e.clientX;
    lastMouse.y = e.clientY;
    onPointerMove(e.clientX, e.clientY);

    // centerHoverOnly: drive the "open" trigger off the pointer entering/leaving
    // the small center zone, instead of the plain mouseover/mouseout below.
    if (!CONFIG.centerHoverOnly) return;
    if (active && inActivePreview(e.target)) return; // pointer is on the preview itself, not the underlying card

    // If a preview is already open, its own reachable area (card + tile fan)
    // takes priority over whatever's strictly under the pointer — this is
    // what lets you travel from the play button towards a tile without it
    // closing en route. Only once you leave that whole area do we close it
    // and fall through to evaluating whatever card is now under the pointer.
    if (active) {
      if (isWithinPreviewBounds(active, e.clientX, e.clientY)) return;
      clearActive(false);
    }

    const card = e.target && e.target.closest ? e.target.closest(CARD_SELECTOR) : null;

    if (!card) {
      if (zoneCard) { clearTimeout(hoverTimers.get(zoneCard)); zoneCard = null; }
      return;
    }

    if (card !== zoneCard) {
      // Pointer moved onto a different card (or from blank space) — drop any
      // pending timer for whichever card we were previously tracking.
      if (zoneCard) clearTimeout(hoverTimers.get(zoneCard));
      zoneCard = null;
    }

    const inZone = isInCenterZone(card);
    if (inZone) {
      if (zoneCard !== card) {
        zoneCard = card;
        clearTimeout(hoverTimers.get(card));
        hoverTimers.set(card, setTimeout(() => showPreview(card), CONFIG.hoverDelay));
      }
    } else if (zoneCard === card) {
      clearTimeout(hoverTimers.get(card));
      zoneCard = null;
    }
  }, { passive: true });

  // ---- show/hide orchestration -------------------------------------------
  function showPreview(card) {
    if (isScrolling) return; // never open mid-scroll
    if (active && active.card === card) return; // already open for this card

    const collectionId = card.dataset.id;
    if (!collectionId) {
      warn("card has no data-id attribute — selector matched something unexpected", card);
      return;
    }
    if (!getApiClient()) {
      warn("window.ApiClient is not available, cannot fetch items");
      return;
    }

    fetchCollectionItems(collectionId)
      .then((result) => {
        // ":hover" can be stale right after a scroll; confirm with elementFromPoint too.
        const under = lastMouse.x >= 0 ? document.elementFromPoint(lastMouse.x, lastMouse.y) : null;
        const stillOver = card.matches(":hover") || (under && card.contains(under));
        if (!stillOver) return;
        // centerHoverOnly: the fetch is async, so also re-check the pointer is
        // still within the center zone by the time the response comes back.
        if (CONFIG.centerHoverOnly && !isInCenterZone(card)) return;

        const items = result.Items || [];
        if (!items.length) return;

        clearActive(true);
        buildPreview(card, card.getBoundingClientRect(), items, result.TotalRecordCount || items.length);
      })
      .catch((e) => err("showPreview failed:", e));
  }

  function inActivePreview(node) {
    return !!(active && node && active.container.contains(node));
  }

  // ---- delegated hover handling ----------------------------------------
  document.addEventListener("mouseover", (e) => {
    const card = e.target.closest(CARD_SELECTOR);
    if (!card || card.contains(e.relatedTarget)) return;
    // Coming back from the preview onto its own card shouldn't restart anything.
    if (active && active.card === card && inActivePreview(e.relatedTarget)) return;

    clearTimeout(hoverTimers.get(card));

    // centerHoverOnly: the mousemove listener above owns the open-trigger timer
    // in this mode (it only starts once the pointer is actually within the
    // center zone), so skip the plain "anywhere on the card" trigger here.
    if (CONFIG.centerHoverOnly) return;

    hoverTimers.set(card, setTimeout(() => showPreview(card), CONFIG.hoverDelay));
  });

  document.addEventListener("mouseout", (e) => {
    const card = e.target.closest(CARD_SELECTOR);
    if (card) {
      if (card.contains(e.relatedTarget)) return;
      // The preview overlaps the card, so moving onto a tile fires the card's mouseout too — ignore it.
      if (active && active.card === card && inActivePreview(e.relatedTarget)) return;

      clearTimeout(hoverTimers.get(card));
      if (zoneCard === card) zoneCard = null;
      // centerHoverOnly: closing is owned by the mousemove fan-bounds check
      // instead (it also covers the arc the tiles occupy beyond the card's
      // own edges) — closing here on the plain card boundary would cut that
      // off short, before the pointer ever reaches a tile.
      if (!CONFIG.centerHoverOnly && active && active.card === card) clearActive(false);
      return;
    }

    // Leaving the preview itself: close unless heading back onto the card or another tile.
    if (active && inActivePreview(e.target)) {
      const to = e.relatedTarget;
      if (inActivePreview(to) || (to && active.card.contains(to))) return;
      if (!CONFIG.centerHoverOnly) clearActive(false);
    }
  });

  // ---- keep the preview glued to its card on resize ----------------------
  // The container is position:fixed, so a layout shift would drift it off
  // its card — re-anchor instead of closing it.
  let repositionQueued = false;

  function repositionActive() {
    if (!active) return;
    const rect = active.card.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      clearActive(true);
      return;
    }
    const pivot = getPivot(rect);
    active.rect = rect;
    active.pivotX = pivot.x;
    active.pivotY = pivot.y;
    active.container.style.left = `${pivot.x}px`;
    active.container.style.top = `${pivot.y}px`;
  }

  function queueReposition() {
    if (!active || repositionQueued) return;
    repositionQueued = true;
    requestAnimationFrame(() => {
      repositionQueued = false;
      repositionActive();
    });
  }

  // ---- scroll: hide immediately, reopen when scrolling settles -----------
  window.addEventListener("scroll", () => {
    isScrolling = true;
    clearActive(true);
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
      isScrolling = false;
      // Reopen for whichever card the (stationary) pointer landed on.
      const under = lastMouse.x >= 0 ? document.elementFromPoint(lastMouse.x, lastMouse.y) : null;
      const card = under && under.closest ? under.closest(CARD_SELECTOR) : null;
      if (card) {
        if (CONFIG.centerHoverOnly && !isInCenterZone(card)) return;
        showPreview(card);
      }
    }, CONFIG.scrollSettleMs);
  }, { passive: true, capture: true });

  window.addEventListener("resize", queueReposition);
})();
