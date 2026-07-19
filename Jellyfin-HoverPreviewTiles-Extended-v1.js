/**
 * Jellyfin – Hover Preview Tiles
 * ---------------------------------------------
 * Hover a BoxSet (collection) card, a Series (TV show) card, a Season card,
 * or a Home Video folder card, and its contents spread out, rising half out
 * of the card like a hand of cards being opened. For BoxSets the posters
 * are the movies inside the collection; for Series they're the show's
 * seasons; for Seasons they're the episodes; for Home Video folders they're
 * that folder's direct children (a mix of sub-folders and videos).
 *
 * The preview tracks your mouse: the tile nearest the cursor rotates
 * upright, comes to the front with a white ring and its title, and
 * its neighbours part around it — all driven continuously by pointer
 * position for a fluid feel. Click a tile to jump to that item.
 *
 * Each card type has its OWN, fully independent config block (CONFIG_SETS /
 * CONFIG_TVSHOWS / CONFIG_TVSEASONS / CONFIG_HOMEVIDEOS) — every option
 * (hover mode, sizes, timings, direct-play behavior, etc.) can be tuned
 * separately for each. See TYPE_CONFIGS near the top for how a hovered
 * card is matched to the right config.
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
  if (window.__jfCollectionPreviewLoaded) return;
  window.__jfCollectionPreviewLoaded = true;

  // =========================================================================
  // CONFIG — Sets / Collections (BoxSet cards)
  // =========================================================================
  const CONFIG_SETS = {
    // Master on/off switch for this entire card type. Set to false to
    // disable the hover preview completely for BoxSet/Collection cards —
    // hovering them then does nothing, as if this script didn't handle
    // this card type at all.
    enabled: true,
    hoverDelay: 220,        // ms to wait before opening (avoids flicker on quick passes)
    maxPosters: 100,        // most posters to show at once
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
    sortBy: "PremiereDate", // how the fetched child items are ordered
    sortOrder: "Ascending",

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
    // Separate delay ONLY for this centerHoverOnly trigger path — REPLACES
    // hoverDelay entirely for this path (not added on top of it).
    centerHoverOnlyDelay: 1500,

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
    subtilePlayButtonSizeRatio: 0.4, // button diameter, as a fraction of posterWidth
    directPlayButtonTimeoutMs: 4000, // how long to wait for the details page's real Play/Resume button to appear
    directPlayRevealDelayMs: 500,    // how long to wait after clicking the real Play/Resume button before fading the black transition overlay away — tune this if the "silent" details page still flashes through (increase) or the reveal feels sluggish (decrease)

    // --- Sets-Specific: Show Year In Tile Title ---
    // When true, each movie tile's title shows "Name (Year)" instead of
    // just "Name" — uses Jellyfin's own ProductionYear field. If a movie
    // has no year data, falls back to plain "Name".
    showYearInTitle: true,
  };

  // =========================================================================
  // CONFIG — TV Shows (Series cards) — shows SEASON posters
  // =========================================================================
  // Fully independent copy of CONFIG_SETS — every option here can be tuned
  // separately from the Sets/Collections config above.
  const CONFIG_TVSHOWS = {
    // Master on/off switch for this entire card type. Set to false to
    // disable the hover preview completely for Series (TV show) cards —
    // hovering them then does nothing, as if this script didn't handle
    // this card type at all.
    enabled: true,
    hoverDelay: 220,        // ms to wait before opening (avoids flicker on quick passes)
    maxPosters: 100,        // most posters to show at once
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
    sortBy: "PremiereDate", // how the fetched child items are ordered
    sortOrder: "Ascending",

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
    // Separate delay ONLY for this centerHoverOnly trigger path — REPLACES
    // hoverDelay entirely for this path (not added on top of it).
    centerHoverOnlyDelay: 1500,

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
    subtilePlayButtonSizeRatio: 0.4, // button diameter, as a fraction of posterWidth
    directPlayButtonTimeoutMs: 4000, // how long to wait for the details page's real Play/Resume button to appear
    directPlayRevealDelayMs: 500,    // how long to wait after clicking the real Play/Resume button before fading the black transition overlay away — tune this if the "silent" details page still flashes through (increase) or the reveal feels sluggish (decrease)

    // --- TV-Show-Specific: Skip Preview On Single-Season Series ---
    // If a series only has a single season, fanning out "one poster" isn't
    // useful. Set this to true to make the preview not open at all for such
    // a series — hovering it does nothing, same as a card type this script
    // doesn't handle. Only checked for this config (Sets/Collections have
    // no equivalent option, since a one-item collection is still meaningful
    // to preview).
    skipSingleSeason: true,
    // --- TV-Show-Specific: Show Episodes Instead, On Single-Season Series ---
    // Only relevant when skipSingleSeason (above) actually applies. Instead
    // of doing nothing for a single-season series, fetch that one season's
    // own children and fan out its EPISODES directly on the series card —
    // using CONFIG_TVSEASONS' settings (sizing, aspect ratio detection,
    // etc.) for the resulting tiles, exactly as if you'd hovered that
    // season card itself. If false, a single-season series simply does
    // nothing on hover, same as before.
    singleSeasonShowEpisodesInstead: true,
  };

  // =========================================================================
  // CONFIG — TV Show Seasons (Season cards) — shows EPISODE posters
  // =========================================================================
  // Fully independent copy of CONFIG_TVSHOWS — every option here can be
  // tuned separately. This handles hovering a SEASON card (e.g. inside a
  // series' season grid) to fan out that season's episodes, as opposed to
  // CONFIG_TVSHOWS which handles hovering the SERIES card itself to fan out
  // its seasons.
  const CONFIG_TVSEASONS = {
    // Master on/off switch for this entire card type. Set to false to
    // disable the hover preview completely for Season cards — hovering
    // them then does nothing, as if this script didn't handle this card
    // type at all.
    enabled: true,
    hoverDelay: 220,        // ms to wait before opening (avoids flicker on quick passes)
    maxPosters: 100,        // most posters to show at once
    // Episode thumbnails are typically widescreen rather than poster-shaped
    // — unlike Sets/TV Shows/Home Videos, sizing here is anchored on a
    // fixed HEIGHT instead of a width (posterWidth doesn't exist in this
    // config at all). Width is derived automatically from this height and
    // whichever aspect ratio gets detected below, so every tile ends up
    // exactly this tall (matching Sets/TV Shows tiles: 110px wide at 2:3 ≈
    // 165px tall), however wide that makes it (e.g. ~293px at 16:9).
    posterHeight: 165,
    // Detects the fan's shared tile shape from the fetched episodes' own
    // image data (already included in every fetch — no extra request).
    // See resolveTileAspectRatio() for exactly how the detection works.
    autoDetectAspectRatio: true,
    aspectRatioCandidates: "2/3, 1/1, 4/3, 16/9", // candidate ratios (width/height) to snap detected shapes to
    fallbackAspectRatio: "2/3", // used when autoDetectAspectRatio is off, or no image data is available
    maxSpreadDeg: 110,       // total arc width once "full"
    degPerPoster: 16,       // arc grows with poster count up to maxSpreadDeg
    lift: 130,              // px the preview rises above its pivot
    overlap: 0.5,           // fraction of the poster that stays INSIDE the card (0.5 = half in, half above)
    hoverPushDeg: 11,       // how far neighbours get pushed away from the focused tile
    hoverSpreadScale: 1.06, // whole preview opens slightly wider while the pointer is tracking
    smoothing: 0.18,        // per-frame lerp factor for pointer tracking (higher = snappier)
    staggerMs: 28,          // delay between each tile's animation
    closeMs: 220,
    scrollSettleMs: 160,    // ms of scroll silence before the preview may reappear
    sortBy: "PremiereDate", // how the fetched child items are ordered
    sortOrder: "Ascending",

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
    // Separate delay ONLY for this centerHoverOnly trigger path — REPLACES
    // hoverDelay entirely for this path (not added on top of it).
    centerHoverOnlyDelay: 1500,

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
    subtilePlayButtonSizeRatio: 0.4, // button diameter, as a fraction of the reference width (see getButtonSizeReferenceWidth())
    directPlayButtonTimeoutMs: 4000, // how long to wait for the details page's real Play/Resume button to appear
    directPlayRevealDelayMs: 500,    // how long to wait after clicking the real Play/Resume button before fading the black transition overlay away — tune this if the "silent" details page still flashes through (increase) or the reveal feels sluggish (decrease)

    // --- TV-Season-Specific: Show Season/Episode Number In Tile Title ---
    // When true, each episode tile's title is prefixed with "SX:EY - "
    // (season/episode number, from Jellyfin's ParentIndexNumber/
    // IndexNumber fields) instead of just "Name". If season/episode
    // numbers are missing, falls back to plain "Name".
    showSeasonEpisodeNumberInTitle: true,
  };

  // =========================================================================
  // CONFIG — Home Videos (Folder cards) — shows the folder's direct children
  // =========================================================================
  // Fully independent copy of CONFIG_SETS — every option here can be tuned
  // separately from the other two configs above. Home Video folders can be
  // nested arbitrarily deep, and their direct children can themselves be a
  // MIX of sub-folders and actual playable videos (unlike Sets/TV Shows,
  // where children are always uniformly playable). See buildPreview()'s
  // per-item canPlay check for how that mix is handled.
  const CONFIG_HOMEVIDEOS = {
    // Master on/off switch for this entire card type. Set to false to
    // disable the hover preview completely for Home Video folder cards —
    // hovering them then does nothing, as if this script didn't handle
    // this card type at all.
    enabled: true,
    hoverDelay: 220,        // ms to wait before opening (avoids flicker on quick passes)
    maxPosters: 33,         // most posters to show at once
    // Home Video content varies a lot more in shape than movies/episodes —
    // landscape recordings, square social-media clips, and portrait phone
    // videos can all show up in the same folder — so sizing here, like TV
    // Seasons, is anchored on a fixed HEIGHT instead of a width
    // (posterWidth doesn't exist in this config at all). Width is derived
    // automatically from this height and whichever aspect ratio gets
    // detected below, so every tile ends up exactly this tall (matching
    // Sets/TV Shows tiles: 110px wide at 2:3 ≈ 165px tall), however wide
    // (or narrow, for portrait clips) that makes it.
    posterHeight: 165,
    // Detects the fan's shared tile shape from the fetched items' own image
    // data (already included in every fetch — no extra request). See
    // resolveTileAspectRatio() for exactly how the detection works.
    autoDetectAspectRatio: true,
    // Includes 9/16 (portrait) in addition to the usual landscape/square
    // shapes, unlike CONFIG_TVSEASONS's list, since Home Videos commonly
    // include portrait phone recordings.
    aspectRatioCandidates: "2/3, 1/1, 4/3, 16/9, 9/16",
    fallbackAspectRatio: "2/3", // used when autoDetectAspectRatio is off, or no image data is available
    maxSpreadDeg: 110,       // total arc width once "full"
    degPerPoster: 16,       // arc grows with poster count up to maxSpreadDeg
    lift: 130,              // px the preview rises above its pivot
    overlap: 0.5,           // fraction of the poster that stays INSIDE the card (0.5 = half in, half above)
    hoverPushDeg: 11,       // how far neighbours get pushed away from the focused tile
    hoverSpreadScale: 1.06, // whole preview opens slightly wider while the pointer is tracking
    smoothing: 0.18,        // per-frame lerp factor for pointer tracking (higher = snappier)
    staggerMs: 28,          // delay between each tile's animation
    closeMs: 220,
    scrollSettleMs: 160,    // ms of scroll silence before the preview may reappear

    // --- Home-Video-Specific: Sort Order For Fetched Child Items ---
    // sortBy options: Album, AlbumArtist, Artist, Budget, CommunityRating,
    //   CriticRating, DateCreated, DatePlayed, PlayCount, PremiereDate,
    //   ProductionYear, SortName, Random, Revenue, Runtime
    // sortOrder options: Ascending, Descending

    // Master switch: false = one shared sort for everything (below);
    // true = folders and videos get their own separate sort instead.
    separateSortForFoldersAndVideos: false,

    // Used when separateSortForFoldersAndVideos is FALSE — folders and
    // videos sorted together, as one combined list. Home Video files/
    // folders rarely have meaningful release-date metadata (they're
    // personal recordings, not movies/shows), so PremiereDate (the default
    // used by Sets/TV Shows) isn't a good fit here.
    sortBy: "Random",
    sortOrder: "Ascending",

    // Used when separateSortForFoldersAndVideos is TRUE instead — each
    // group gets its own rule (same sortBy/sortOrder options as above):
    folderSortBy: "SortName",
    folderSortOrder: "Ascending",
    videoSortBy: "Random",
    videoSortOrder: "Ascending",
    // How folders and videos are arranged in the fan when a folder mixes
    // both (only relevant when separateSortForFoldersAndVideos is true):
    //   "foldersFirst" — all folder tiles, then all video tiles
    //   "videosFirst"  — all video tiles, then all folder tiles
    mixedOrderMode: "foldersFirst",

    // --- Home-Video-Specific: Skip Wrapper Folder Layer(s) ---
    // Some Home Video folder structures have an extra, meaningless wrapper
    // layer in between, e.g.:
    //   FolderName (folder)
    //     └── videos (folder)       <- pointless middle layer, gets skipped
    //           └── Video1, Video2, ...   <- what actually gets shown
    // Applied consistently in TWO places: when you HOVER a card (decides
    // what's shown in the fan) and when you CLICK a folder subtile or the
    // "+N more" tile (decides where it navigates to).
    //
    // How a skip decision is made: among a folder's children, count how
    // many CONTAIN one of the names below (unrelated folders like "fotos"
    // don't count at all). Only if that count is exactly ONE does anything
    // get skipped — see the two toggles below for exact vs. partial matches.
    skipFolderLayerNamesEnabled: true, // master on/off switch for this whole feature
    // Comma-separated, case-insensitive folder names to match against.
    // Example: "videos, clips, footage"
    skipFolderLayerNames: "videos",
    // Allows skipping when the single candidate is an EXACT name match
    // (e.g. a child literally named "videos").
    skipFolderLayerExactMatchEnabled: true,
    // Fallback: allows skipping when the single candidate only CONTAINS one
    // of skipFolderLayerNames rather than matching it exactly (e.g. "videos
    // Instagram"). Only ever consulted when there's no exact match and
    // still just one candidate overall — never when multiple similarly-
    // named folders exist.
    skipFolderLayerFuzzyFallbackEnabled: true,
    maxFolderSkipDepth: 1, // safety cap against runaway/circular folder structures

    // --- Alternative Mode: Hover Center Zone Instead Of Whole Title Card ---
    // By default the preview opens on hovering ANYWHERE over the card tile.
    // Set this to true to instead require the pointer to be over a small
    // center zone. Unlike Sets/TV Shows, a Home Video FOLDER card never has
    // a real play button to hook into (folders aren't playable) — so this
    // zone is a purely geometric, invisible circle in the middle of the
    // card instead of a real button's :hover state (see
    // centerHoverZoneRatio below). Both opening AND closing follow the
    // zone: the preview opens once the pointer settles inside it, and
    // closes as soon as the pointer leaves it — even while still over the
    // rest of the card. Moving onto one of the already-open floating
    // poster tiles is exempt (otherwise you could never reach them to
    // click).
    centerHoverOnly: true,
    // Separate delay ONLY for this centerHoverOnly trigger path — REPLACES
    // hoverDelay entirely for this path (not added on top of it).
    centerHoverOnlyDelay: 1500,
    // Radius of the invisible center-hover circle, as a fraction of the
    // card's shorter side. Only relevant when centerHoverOnly is true.
    centerHoverZoneRatio: 0.22,

    // --- Alternative Mode: Subtile Play Button On Focus ---
    // When true, the currently FOCUSED poster tile (the raised one with the
    // white ring/title) also grows its own miniature replica of Jellyfin's
    // own play-button overlay, scaled down to the tile's size. Clicking it
    // does NOT try to tap into Jellyfin's internal playbackManager directly
    // (confirmed unreachable from an injected script) — instead it
    // navigates to the item's real details page and then automatically
    // clicks Jellyfin's own, genuinely-wired Play/Resume button there
    // (".mainDetailButtons .btnPlay" / ".btnResume"), covering the brief
    // transition with an overlay so it feels instant. Only actually shows
    // up on VIDEO subtiles — sub-folder subtiles never get one (see
    // buildPreview()'s canPlay check), since a folder can't be played.
    // See playItemDirect() for the full flow and its honest limitations.
    subtileFocusPlayButton: true,
    subtilePlayButtonSizeRatio: 0.4, // button diameter, as a fraction of the reference width (see getButtonSizeReferenceWidth())
    directPlayButtonTimeoutMs: 4000, // how long to wait for the details page's real Play/Resume button to appear
    directPlayRevealDelayMs: 500,    // how long to wait after clicking the real Play/Resume button before fading the black transition overlay away — tune this if the "silent" details page still flashes through (increase) or the reveal feels sluggish (decrease)
  };

  // =========================================================================
  // CONFIG — Movies (Movie cards) — shows CHAPTER previews
  // CONFIG — Episodes (Episode cards) — shows CHAPTER previews
  // CONFIG — Home Video Files (Video cards) — shows CHAPTER previews
  // =========================================================================
  // These three are structurally different from the four configs above:
  // instead of fanning out a container's CHILDREN (fetched via ParentId),
  // they fan out a single video's own CHAPTER images (fetched via that
  // item's own Chapters field) — see fetchItemChapters() and
  // TYPE_CONFIGS' fetchMode: "chapters" below. Clicking a chapter tile (or
  // its play button) plays that exact video, seeked directly to that
  // chapter's timestamp — see playItemDirectAtChapter().
  //
  // Chapter images are always extracted at a fixed 16:9 resolution by
  // Jellyfin itself, so unlike TV Seasons/Home Videos there's no per-item
  // aspect ratio data to detect from — these configs just use a fixed
  // fallbackAspectRatio instead of autoDetectAspectRatio. There's also no
  // sortBy/sortOrder here: chapters already come back in chronological
  // order from the API, and re-sorting them wouldn't make sense.
  const CONFIG_MOVIES = {
    enabled: true,
    hoverDelay: 220,
    maxPosters: 100,
    posterHeight: 165,          // px — every chapter tile's fixed height; width follows from fallbackAspectRatio below
    fallbackAspectRatio: "16/9", // chapter images are always extracted at this ratio by Jellyfin itself
    maxSpreadDeg: 110,
    degPerPoster: 16,
    lift: 130,
    overlap: 0.5,
    hoverPushDeg: 11,
    hoverSpreadScale: 1.06,
    smoothing: 0.18,
    staggerMs: 28,
    closeMs: 220,
    scrollSettleMs: 160,

    // Same as the other configs' centerHoverOnly — Movies are playable, so
    // this uses the card's real play button, not a geometric fallback.
    centerHoverOnly: true,
    // Separate delay ONLY for this centerHoverOnly trigger path — REPLACES
    // hoverDelay entirely for this path (not added on top of it).
    centerHoverOnlyDelay: 1500,

    // Same idea as the other configs' subtileFocusPlayButton, but clicking
    // it (or the tile itself) plays THIS movie seeked directly to that
    // chapter's timestamp, via playItemDirectAtChapter().
    subtileFocusPlayButton: true,
    subtilePlayButtonSizeRatio: 0.4,
    directPlayButtonTimeoutMs: 4000,
    directPlayRevealDelayMs: 500,
  };

  const CONFIG_EPISODES = {
    enabled: true,
    hoverDelay: 220,
    maxPosters: 100,
    posterHeight: 165,
    fallbackAspectRatio: "16/9",
    maxSpreadDeg: 110,
    degPerPoster: 16,
    lift: 130,
    overlap: 0.5,
    hoverPushDeg: 11,
    hoverSpreadScale: 1.06,
    smoothing: 0.18,
    staggerMs: 28,
    closeMs: 220,
    scrollSettleMs: 160,
    centerHoverOnly: true,
    // Separate delay ONLY for this centerHoverOnly trigger path — REPLACES
    // hoverDelay entirely for this path (not added on top of it).
    centerHoverOnlyDelay: 1500,
    // Fallback for contexts where no real ".cardOverlayFab-primary" play
    // button exists to hover — confirmed via source: episodes inside a
    // season's own episode LIST (as opposed to grid/card contexts like
    // suggestions or "More from this season") render through Jellyfin's
    // listview.js component instead of cardBuilder.js, which uses a
    // completely different button system (no cardOverlayFab-primary at
    // all). Without this, centerHoverOnly could never trigger there.
    centerHoverZoneRatio: 0.22,
    subtileFocusPlayButton: true,
    subtilePlayButtonSizeRatio: 0.4,
    directPlayButtonTimeoutMs: 4000,
    directPlayRevealDelayMs: 500,
  };

  const CONFIG_HOMEVIDEOFILES = {
    enabled: true,
    hoverDelay: 220,
    maxPosters: 100,
    posterHeight: 165,
    fallbackAspectRatio: "16/9",
    maxSpreadDeg: 110,
    degPerPoster: 16,
    lift: 130,
    overlap: 0.5,
    hoverPushDeg: 11,
    hoverSpreadScale: 1.06,
    smoothing: 0.18,
    staggerMs: 28,
    closeMs: 220,
    scrollSettleMs: 160,
    centerHoverOnly: true,
    // Separate delay ONLY for this centerHoverOnly trigger path — REPLACES
    // hoverDelay entirely for this path (not added on top of it).
    centerHoverOnlyDelay: 1500,
    subtileFocusPlayButton: true,
    subtilePlayButtonSizeRatio: 0.4,
    directPlayButtonTimeoutMs: 4000,
    directPlayRevealDelayMs: 500,
  };

  // =========================================================================
  // Global settings — apply across ALL card types (not per-config), unlike
  // everything above.
  // =========================================================================
  const GLOBAL_SETTINGS = {
    // Master on/off switch for the hover preview specifically on the Home
    // page (#/home.html) — applies to every card type equally, regardless
    // of media type. Set to false to disable previews there entirely,
    // while leaving them fully working everywhere else.
    enablePreviewsOnHome: true,
    // Master on/off switch for the hover preview specifically within a
    // "More Like This" section (confirmed container: .similarContent) —
    // applies to every card type equally. Set to false to disable previews
    // there, while leaving them fully working everywhere else.
    enablePreviewsOnSimilarSection: true,
    // Master on/off switch for the hover preview specifically within the
    // "Next Up" section (confirmed container: .nextUpItems, found on the
    // Home page — Next Up cards are Episodes, part of the TV Shows
    // family) — applies to every card type equally. Set to false to
    // disable previews there, while leaving them fully working elsewhere.
    enablePreviewsOnNextUp: true,
  };

  // =========================================================================
  // Card-type registry — maps a card's data-type to its selector + config.
  // Add more entries here the same way for any further type. fetchMode
  // defaults to fetching a container's CHILDREN via ParentId (the original
  // behavior) when omitted; "chapters" instead fetches a single video
  // item's own chapter list (see showPreview() / fetchItemChapters()).
  // =========================================================================
  const TYPE_CONFIGS = {
    BoxSet: { key: "sets", cardSelector: '.card[data-type="BoxSet"]', config: CONFIG_SETS },
    Series: { key: "tvshows", cardSelector: '.card[data-type="Series"]', config: CONFIG_TVSHOWS },
    Season: { key: "tvseasons", cardSelector: '.card[data-type="Season"]', config: CONFIG_TVSEASONS },
    Folder: { key: "homevideos", cardSelector: '.card[data-type="Folder"]', config: CONFIG_HOMEVIDEOS },
    // NOTE: the actual data-type Jellyfin uses for a single Home Video FILE
    // card is assumed to be "Video" here (by analogy with the confirmed
    // BaseItemKind naming for BoxSet/Series/Season/Folder) but wasn't
    // separately confirmed the way "Folder" was (via a real checked URL).
    // If chapter previews don't trigger on your home video file cards,
    // this is the first thing to check/correct.
    Movie: { key: "movies", cardSelector: '.card[data-type="Movie"]', config: CONFIG_MOVIES, fetchMode: "chapters" },
    // Matches BOTH the normal grid card markup (cardBuilder.js) AND the
    // season-page's own episode LIST view markup (listview.js) — confirmed
    // via real DOM inspection that the latter uses ".listItem" (no "card"
    // class at all) instead of ".card" for its outer element.
    Episode: { key: "episodes", cardSelector: '.card[data-type="Episode"], .listItem[data-type="Episode"]', config: CONFIG_EPISODES, fetchMode: "chapters" },
    Video: { key: "homevideofiles", cardSelector: '.card[data-type="Video"]', config: CONFIG_HOMEVIDEOFILES, fetchMode: "chapters" },
  };
  const CARD_SELECTOR = Object.keys(TYPE_CONFIGS)
    .map((k) => TYPE_CONFIGS[k].cardSelector)
    .join(", ");

  /**
   * Given a card element, returns its {key, cardSelector, config} entry, or
   * null if unrecognized OR excluded by GLOBAL_SETTINGS (Home page /
   * "More Like This" / "Next Up" sections — see there for details).
   * Checking hash with .includes() rather than an exact match covers both
   * the older "#!/home.html" and current "#/home.html" URL styles.
   */
  function resolveTypeConfig(card) {
    if (!card || !card.dataset) return null;
    const typeInfo = TYPE_CONFIGS[card.dataset.type];
    if (!typeInfo || typeInfo.config.enabled === false) return null;
    if (!GLOBAL_SETTINGS.enablePreviewsOnHome && window.location.hash.includes("/home.html")) return null;
    if (!GLOBAL_SETTINGS.enablePreviewsOnSimilarSection && card.closest(".similarContent")) return null;
    if (!GLOBAL_SETTINGS.enablePreviewsOnNextUp && card.closest(".nextUpItems")) return null;
    return typeInfo;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Real problems only — no verbose tracing.
  const warn = (...args) => console.warn("[hover-preview-tiles]", ...args);
  const err = (...args) => console.error("[hover-preview-tiles]", ...args);

  // ---- styles -------------------------------------------------------
  // Size-dependent values (poster width, play-button size) are NOT baked in
  // here as fixed numbers anymore — they're read from CSS custom properties
  // (--jf-poster-width / --jf-playbtn-size) that buildPreview() sets on the
  // container per-instance, based on whichever config applies to the card
  // that was hovered. The var() fallbacks below only matter if that ever
  // fails to be set for some reason.
  const style = document.createElement("style");
  style.textContent = `
    .jf-preview-container{position:fixed;top:0;left:0;width:0;height:0;z-index:9999;pointer-events:none;}
    .jf-preview-arm{position:absolute;top:0;left:0;width:0;height:0;
      transform:rotate(0deg) translateY(0px);
      transition:transform ${reduceMotion ? "0s" : ".45s cubic-bezier(.22,.85,.25,1.15)"};}
    .jf-preview-tile{position:absolute;top:0;left:0;width:var(--jf-poster-width, 110px);aspect-ratio:var(--jf-tile-aspect-ratio, 2/3);
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
      width:var(--jf-playbtn-size, 44px);height:var(--jf-playbtn-size, 44px);
      margin-top:calc(var(--jf-playbtn-size, 44px) * -0.5);
      margin-left:calc(var(--jf-playbtn-size, 44px) * -0.5);
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
  const itemCache = new Map();        // parentId -> {Items, TotalRecordCount} (shared; ids never collide across types)
  const hoverTimers = new WeakMap();  // card -> pending "open" timeout
  let active = null;                  // currently open preview's state (shape defined in buildPreview); active.config is the type config that opened it
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

  /**
   * Navigate INTO a folder (browse its contents) — a different route than
   * goToItem()'s item-details page. Confirmed via the actual URL Jellyfin
   * itself uses when browsing into a Home Video folder:
   * "#/list.html?parentId=X&serverId=Y", not "#/details?id=X". Used for
   * Home Video sub-folder subtiles and their "+N more" tile — Sets/TV Shows
   * never call this, since their "+N more" target (a BoxSet/Series) is a
   * proper details-page item, not a plain folder.
   */
  function goToFolder(folderId) {
    const api = getApiClient();
    const serverId = api && typeof api.serverId === "function" ? api.serverId() : null;
    const query = `parentId=${folderId}${serverId ? `&serverId=${serverId}` : ""}`;
    try {
      if (window.Emby && window.Emby.Page && typeof window.Emby.Page.show === "function") {
        window.Emby.Page.show(`/list.html?${query}`);
        return;
      }
    } catch (e) {
      warn("Emby.Page.show failed, falling back to hash navigation", e);
    }
    const prefix = window.location.hash.startsWith("#!") ? "#!/list.html?" : "#/list.html?";
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

  function playItemDirect(itemId, config, seekSeconds) {
    showTransitionOverlay();
    // Double rAF: a style change is only guaranteed to have been PAINTED by
    // the time two animation frames have passed. Without this, navigation
    // could start racing the browser's very first paint of the (now fully
    // opaque) overlay, letting a brief flash of the details page slip
    // through before the overlay visually lands.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        goToItem(itemId);
        runDirectPlayClickSequence(itemId, config, seekSeconds);
      });
    });
  }

  /**
   * Movies/Episodes/Home Video files: same flow as playItemDirect(), but
   * additionally seeks the resulting <video> element to a specific
   * chapter's timestamp once playback has actually started. startTicks is
   * Jellyfin's own tick unit (100-nanosecond intervals) — divided by
   * 10,000,000 to get seconds, which is what HTMLMediaElement.currentTime
   * expects.
   */
  function playItemDirectAtChapter(itemId, startTicks, config) {
    const seekSeconds = (startTicks || 0) / 10000000;
    playItemDirect(itemId, config, seekSeconds);
  }

  function runDirectPlayClickSequence(itemId, config, seekSeconds) {
    const clickDeadline = performance.now() + config.directPlayButtonTimeoutMs;
    const tryClick = () => {
      // goToItem() only kicks off navigation asynchronously and returns
      // immediately — right after that, the PREVIOUS details page (whatever
      // item the person last viewed) can still be fully present in the DOM,
      // complete with its own valid, non-hidden Play/Resume button. Without
      // this guard we could find and click THAT stale button before
      // Jellyfin has swapped in the page for the item we actually want.
      // Two checks, both required: the URL itself must reflect navigation
      // to this item, AND — confirmed via live testing to matter
      // separately — a sibling button within .mainDetailButtons (e.g.
      // btnPlaystate/btnUserRating, which carry a real data-id attribute;
      // .btnPlay itself does not) must show the SAME id. The URL can
      // update before the actual .mainDetailButtons block has been
      // swapped in for the new item, especially when navigating from one
      // details page directly to another (confirmed to reproduce the bug)
      // — during that gap the OLD item's fully-wired button is still
      // sitting there, and would otherwise get clicked instead. Searches
      // directly for OUR target id (not "grab whichever data-id comes
      // first, then compare") and scopes the button search to THAT
      // specific container — if multiple .mainDetailButtons blocks exist
      // in the DOM simultaneously (old one not yet removed, new one
      // already present), a "grab first, compare" approach can keep
      // matching the same wrong block forever and never succeed at all.
      const hashReady = window.location.hash.includes(itemId);
      const idButton = document.querySelector(`.mainDetailButtons [data-id="${itemId}"]`);
      const container = idButton ? idButton.closest(".mainDetailButtons") : null;
      if (!hashReady || !container) {
        if (performance.now() < clickDeadline) {
          setTimeout(tryClick, 50);
        } else {
          warn("playItemDirect: navigation to the target item never completed in time");
          hideTransitionOverlay();
        }
        return;
      }
      // For a chapter seek, prefer the plain "Play" button over "Resume" —
      // clicking Resume makes Jellyfin jump to its OWN saved resume
      // position, which can then race our own seek (sometimes winning,
      // sometimes losing, depending on timing) instead of landing on the
      // chapter we actually asked for. Normal (non-chapter) direct play
      // keeps preferring Resume, since resuming where you left off is the
      // whole point there.
      const btn =
        seekSeconds != null
          ? container.querySelector(".btnPlay:not(.hide)") ||
            container.querySelector(".btnResume:not(.hide)")
          : container.querySelector(".btnResume:not(.hide)") ||
            container.querySelector(".btnPlay:not(.hide)");
      if (btn) {
        btn.click();
        if (seekSeconds != null) {
          // Chapter seeks: reveal the overlay once playback actually
          // starts (or the timeout is hit as a fallback), rather than a
          // fixed delay — confirmed via testing that episode detail pages
          // can take noticeably longer to finish rendering (extra series/
          // season breadcrumb data) than movie pages, which a fixed delay
          // tuned for movies doesn't account for.
          seekVideoWhenReady(seekSeconds, config.directPlayButtonTimeoutMs, hideTransitionOverlay);
        } else {
          // Non-chapter direct play: unchanged, fixed buffer giving
          // Jellyfin's own visible reaction (loading state, player
          // container, etc.) time to begin before fading the overlay away.
          setTimeout(hideTransitionOverlay, config.directPlayRevealDelayMs);
        }
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

  /**
   * Movies/Episodes/Home Video files: waits for the real <video> element to
   * appear (created by Jellyfin's own player after the real Play/Resume
   * button was clicked), then applies the target chapter's timestamp
   * REPEATEDLY at several points in the video's startup (loadedmetadata,
   * canplay, and once more shortly after playback actually begins) rather
   * than just once. This is needed because Jellyfin's own "Resume" button
   * (clicked when a saved position exists) triggers Jellyfin's own jump to
   * THAT position, which can race our seek — sometimes our seek wins,
   * sometimes Jellyfin's does, depending on timing. Re-applying several
   * times makes ours reliably win regardless of that race. Silently gives
   * up after timeoutMs if no <video> ever appears — worst case the video
   * just plays from wherever Jellyfin put it, rather than throwing or
   * leaving anything broken.
   */
  /**
   * onReady (optional) fires once, either when the video actually starts
   * playing, or — as a fallback — when timeoutMs is reached without a
   * <video> ever appearing (so a caller relying on this to reveal the
   * transition overlay never gets stuck waiting forever).
   */
  function seekVideoWhenReady(seekSeconds, timeoutMs, onReady) {
    const deadline = performance.now() + timeoutMs;
    let readyFired = false;
    const fireReady = () => {
      if (readyFired) return;
      readyFired = true;
      if (onReady) onReady();
    };
    const tryFind = () => {
      const video = document.querySelector("video");
      if (video) {
        const applySeek = () => {
          try {
            video.currentTime = seekSeconds;
          } catch (e) {
            warn("seekVideoWhenReady: setting currentTime failed", e);
          }
        };
        if (video.readyState >= 1) {
          // HAVE_METADATA or later — duration/seekable range already known.
          applySeek();
        } else {
          video.addEventListener("loadedmetadata", applySeek, { once: true });
        }
        // Re-apply at further lifecycle points, in case Jellyfin's own
        // resume-position logic jumps the video AFTER our first seek.
        video.addEventListener("canplay", applySeek, { once: true });
        video.addEventListener(
          "playing",
          () => {
            setTimeout(applySeek, 150);
            fireReady();
          },
          { once: true }
        );
        return;
      }
      if (performance.now() < deadline) {
        setTimeout(tryFind, 50);
      } else {
        warn("seekVideoWhenReady: no <video> element appeared in time");
        fireReady();
      }
    };
    tryFind();
  }

  /** Parses a "W/H" ratio string (e.g. "16/9") into a numeric width/height value. Returns null if invalid. */
  function parseAspectRatio(str) {
    const parts = (str || "").split("/").map((s) => parseFloat(s.trim()));
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) return parts[0] / parts[1];
    return null;
  }

  /**
   * TV Seasons / Home Videos (autoDetectAspectRatio): determines ONE tile
   * shape (as a numeric width/height ratio) to use uniformly across the
   * whole fan. Each fetched item's own PrimaryImageAspectRatio is first
   * individually snapped to whichever of config.aspectRatioCandidates it's
   * closest to, and then whichever candidate was the MOST COMMON match
   * wins — a frequency/mode approach, not an average. This is deliberately
   * robust against outliers: e.g. 99 portrait clips and 1 landscape one
   * won't get averaged into a false "square" result — portrait simply wins
   * on frequency, since only the one outlier snaps to landscape.
   * Individual tiles are never shaped independently; that would break the
   * fan's shared geometry (see buildPreview()). Falls back to
   * config.fallbackAspectRatio when detection is off or no image data is
   * available.
   */
  function resolveTileAspectRatio(items, config) {
    const fallback = parseAspectRatio(config.fallbackAspectRatio) || 2 / 3;
    if (!config.autoDetectAspectRatio) return fallback;

    const ratios = items
      .map((it) => it.PrimaryImageAspectRatio)
      .filter((r) => typeof r === "number" && r > 0);
    if (!ratios.length) return fallback;

    const candidates = (config.aspectRatioCandidates || "")
      .split(",")
      .map((s) => parseAspectRatio(s.trim()))
      .filter((r) => r != null);
    if (!candidates.length) return fallback;

    const nearestCandidate = (r) => {
      let best = candidates[0];
      let bestDist = Math.abs(r - best);
      candidates.forEach((c) => {
        const d = Math.abs(r - c);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      });
      return best;
    };

    const counts = new Map();
    ratios.forEach((r) => {
      const snapped = nearestCandidate(r);
      counts.set(snapped, (counts.get(snapped) || 0) + 1);
    });

    let winner = candidates[0];
    let winnerCount = -1;
    counts.forEach((count, candidate) => {
      if (count > winnerCount) {
        winnerCount = count;
        winner = candidate;
      }
    });
    return winner;
  }

  /**
   * Computes the actual tile width to use for a given resolved aspect
   * ratio. If config defines an explicit posterHeight (TV Seasons and Home
   * Videos both do), width is derived directly from THAT fixed height —
   * every tile ends up exactly posterHeight tall, however wide that makes
   * it. Otherwise (Sets/TV Shows, anchored on posterWidth), falls back to
   * preserving roughly the same visual AREA as a plain 2:3 poster at
   * config.posterWidth — since those configs never deviate from 2:3 anyway
   * (no autoDetectAspectRatio), this always just returns config.posterWidth
   * unchanged.
   */
  function computeTileWidth(config, tileAspectRatio) {
    if (config.posterHeight) {
      return config.posterHeight * tileAspectRatio;
    }
    const baseRatio = parseAspectRatio(config.fallbackAspectRatio) || 2 / 3;
    const baseArea = config.posterWidth * (config.posterWidth / baseRatio);
    return Math.sqrt(baseArea * tileAspectRatio);
  }

  /**
   * A stable "reference width" for sizing things that should NOT scale
   * with the fan's actual (possibly wide) tile width — currently just the
   * subtile play button. Configs anchored on posterWidth (Sets/TV Shows)
   * use it directly. Configs anchored on posterHeight instead (TV Seasons,
   * Home Videos — neither has a posterWidth at all) convert back to an
   * equivalent width at the base aspect ratio, so the button ends up the
   * same size either way.
   */
  function getButtonSizeReferenceWidth(config) {
    if (config.posterHeight) {
      // Always convert back using the standard 2:3 poster-button scale,
      // regardless of this config's own actual TILE shape (which can be
      // very different — e.g. 16:9 for chapter previews). Using
      // config.fallbackAspectRatio here instead was the bug: it's meant to
      // describe the CONTENT's shape, not the button-size baseline, and
      // for configs where those two ratios differ (any 16:9-anchored one)
      // it made the button balloon to roughly 2.7x the intended size.
      return config.posterHeight / 1.5; // 1.5 === 1 / (2/3)
    }
    return config.posterWidth;
  }

  /**
   * Fetches a parent item's direct children, caching by parentId so repeat
   * hovers don't re-fetch. Works unmodified for BoxSets (children =
   * movies), Series (children = seasons), Seasons (children = episodes),
   * and Home Video folders (children = sub-folders/videos) — Jellyfin's
   * getItems with ParentId just returns whatever that item's direct
   * children are. Fields requests everything any config might need for
   * display (aspect ratio, year, episode numbers) or client-side sorting
   * (see sortItemsClientSide()) in one shot, since it's cheap to over-ask.
   */
  function fetchChildItems(parentId, config) {
    if (itemCache.has(parentId)) return Promise.resolve(itemCache.get(parentId));

    const api = getApiClient();
    if (!api) {
      warn("ApiClient not ready, aborting fetch for", parentId);
      return Promise.reject(new Error("ApiClient not ready"));
    }
    return api
      .getItems(api.getCurrentUserId(), {
        ParentId: parentId,
        SortBy: config.sortBy,
        SortOrder: config.sortOrder,
        Fields: "PrimaryImageAspectRatio,ProductionYear,ParentIndexNumber,IndexNumber,DateCreated,PremiereDate,CommunityRating,CriticRating",
        Limit: config.maxPosters + 1,
      })
      .then((result) => {
        itemCache.set(parentId, result);
        return result;
      })
      .catch((e) => {
        err("getItems failed for", parentId, e);
        throw e;
      });
  }

  /**
   * Movies/Episodes/Home Video files (fetchMode: "chapters"): fetches a
   * single video item's own Chapters field (NOT a ParentId-based children
   * fetch — a video has no children) and wraps its chapters into the same
   * {Items, TotalRecordCount} shape fetchChildItems()/resolveSkippedFolder()
   * return, so the rest of showPreview()/buildPreview() can treat a
   * chapter fan exactly like any other fan without special-casing. Each
   * synthetic "item" carries the real chapter data needed later
   * (getChapterPosterUrl(), playItemDirectAtChapter()) as underscore-
   * prefixed fields; Id is set to the VIDEO's own id (not a real per-
   * chapter id — chapters aren't separately navigable items), and
   * Type:"Chapter" flags these to buildPreview() so it knows to use the
   * chapter image URL builder instead of the normal poster one. Chapters
   * with no extracted image (ImageTag missing) are skipped entirely —
   * there'd be nothing to show. Cached by the video's own id, same as any
   * other fetch.
   */
  function fetchItemChapters(itemId, config) {
    if (itemCache.has(itemId)) return Promise.resolve(itemCache.get(itemId));

    const api = getApiClient();
    if (!api) {
      warn("ApiClient not ready, aborting chapter fetch for", itemId);
      return Promise.reject(new Error("ApiClient not ready"));
    }
    return api
      .getItems(api.getCurrentUserId(), {
        Ids: itemId,
        Fields: "Chapters",
      })
      .then((result) => {
        const item = (result.Items || [])[0] || null;
        const chapters = (item && item.Chapters) || [];
        const chapterItems = chapters
          .filter((ch) => ch.ImageTag)
          .map((ch) => ({
            Id: itemId,
            Name: ch.Name || "",
            IsFolder: false,
            Type: "Chapter",
            // The image endpoint needs the chapter's position in the FULL,
            // unfiltered chapters array — not its position among only the
            // ones that happen to have images.
            _chapterIndex: chapters.indexOf(ch),
            _chapterImageTag: ch.ImageTag,
            _chapterStartTicks: ch.StartPositionTicks || 0,
          }));
        const wrapped = { Items: chapterItems, TotalRecordCount: chapterItems.length };
        itemCache.set(itemId, wrapped);
        return wrapped;
      })
      .catch((e) => {
        err("getItems (chapters) failed for", itemId, e);
        throw e;
      });
  }

  /**
   * Builds a chapter's image URL — Jellyfin's own "Chapter" ImageType
   * (confirmed via the official @jellyfin/sdk's ImageType enum), addressed
   * the same way as other indexed image types like Backdrop:
   * /Items/{itemId}/Images/Chapter/{chapterIndex}. Tries the same
   * getScaledImageUrl() helper used for posters first (passing type +
   * index), falling back to manually building the URL via api.getUrl() if
   * that doesn't support the index parameter the way we expect.
   */
  function getChapterPosterUrl(item, api) {
    const opts = { maxHeight: 300, quality: 90 };
    if (item._chapterImageTag) opts.tag = item._chapterImageTag;
    if (typeof api.getScaledImageUrl === "function") {
      try {
        const url = api.getScaledImageUrl(item.Id, { type: "Chapter", index: item._chapterIndex, ...opts });
        if (url) return url;
      } catch (e) {
        // fall through to manual construction below
      }
    }
    const query = { maxHeight: "300", quality: "90" };
    if (item._chapterImageTag) query.tag = item._chapterImageTag;
    return api.getUrl(`Items/${item.Id}/Images/Chapter/${item._chapterIndex}`, query);
  }


  /**
   * Home Videos (separateSortForFoldersAndVideos): a small client-side
   * approximation of Jellyfin's own SortBy behavior, used to re-sort an
   * already-fetched list of items by a field that may differ from
   * whatever the server-side fetch itself was sorted by. Supports the
   * most commonly useful fields (SortName, PremiereDate, DateCreated,
   * ProductionYear, CommunityRating, CriticRating, Random); anything else
   * falls back to sorting by Name.
   */
  function getClientSortValue(item, sortBy) {
    switch (sortBy) {
      case "SortName":
        return (item.SortName || item.Name || "").toLowerCase();
      case "PremiereDate":
        return item.PremiereDate ? new Date(item.PremiereDate).getTime() : 0;
      case "DateCreated":
        return item.DateCreated ? new Date(item.DateCreated).getTime() : 0;
      case "ProductionYear":
        return item.ProductionYear || 0;
      case "CommunityRating":
        return item.CommunityRating || 0;
      case "CriticRating":
        return item.CriticRating || 0;
      default:
        return (item.Name || "").toLowerCase();
    }
  }

  function sortItemsClientSide(items, sortBy, sortOrder) {
    if (sortBy === "Random") {
      // Fisher-Yates shuffle.
      const arr = items.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }
    const arr = items.slice().sort((a, b) => {
      const va = getClientSortValue(a, sortBy);
      const vb = getClientSortValue(b, sortBy);
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
    if (sortOrder === "Descending") arr.reverse();
    return arr;
  }

  /**
   * Home Videos: if config.separateSortForFoldersAndVideos is true, splits
   * a folder's children into folders/videos, sorts each group with its own
   * rule (folderSortBy/folderSortOrder, videoSortBy/videoSortOrder), and
   * arranges them per config.mixedOrderMode. Has no effect (returns items
   * unchanged) for any config that doesn't define this switch, or when a
   * folder's children turn out to be all-folders or all-videos anyway
   * (nothing to separate).
   */
  function applySeparateFolderVideoSort(items, config) {
    if (!config.separateSortForFoldersAndVideos) return items;

    const folders = items.filter((it) => it.IsFolder);
    const videos = items.filter((it) => !it.IsFolder);
    if (!folders.length || !videos.length) return items; // nothing mixed — nothing to separate

    const sortedFolders = sortItemsClientSide(folders, config.folderSortBy, config.folderSortOrder);
    const sortedVideos = sortItemsClientSide(videos, config.videoSortBy, config.videoSortOrder);

    return config.mixedOrderMode === "videosFirst"
      ? sortedVideos.concat(sortedFolders)
      : sortedFolders.concat(sortedVideos);
  }

  /**
   * Formats a tile's title text according to whichever config options
   * apply: Sets' showYearInTitle ("Name (Year)") or TV Seasons' own
   * showSeasonEpisodeNumberInTitle ("SX:EY - Name"). Falls back to the
   * plain name if the relevant metadata field is missing, or if neither
   * option is set for this config (the common case for most types).
   */
  function formatTileTitle(item, config) {
    let title = item.Name || "";
    if (config.showYearInTitle && item.ProductionYear) {
      title = `${title} (${item.ProductionYear})`;
    }
    if (config.showSeasonEpisodeNumberInTitle && item.ParentIndexNumber != null && item.IndexNumber != null) {
      title = `S${item.ParentIndexNumber}:E${item.IndexNumber} - ${title}`;
    }
    return title;
  }

  /**
   * Home Videos: if config.skipFolderLayerNamesEnabled is true, decides
   * whether to recursively fetch INTO a wrapper sub-folder instead of
   * showing/navigating to "one folder" — repeated up to
   * config.maxFolderSkipDepth layers deep in case several such wrapper
   * layers are stacked.
   *
   * The decision: among the fetched children, count how many folders'
   * names CONTAIN one of config.skipFolderLayerNames — unrelated folders
   * (e.g. "fotos") never count, no matter how many of those exist. Only if
   * that count is exactly ONE does anything get skipped; see
   * skipFolderLayerExactMatchEnabled / skipFolderLayerFuzzyFallbackEnabled
   * on CONFIG_HOMEVIDEOS for how exact vs. partial matches are handled.
   *
   * Used for BOTH the hover-open flow AND the click-on-a-folder-subtile
   * flow (see buildTile()'s click handler) — same rules apply either way.
   * Has no effect for Sets/TV Shows, since neither config defines
   * skipFolderLayerNamesEnabled (undefined is falsy, so skipNames ends up
   * empty and the function always returns immediately below — a single
   * plain fetch, same as before). Resolves to {parentId, result}: parentId
   * is the (possibly deeper) id whose children should actually be
   * shown/navigated to, and result is that id's raw getItems response.
   */
  function resolveSkippedFolder(parentId, config, depth) {
    return fetchChildItems(parentId, config).then((result) => {
      const items = result.Items || [];
      const skipNames = config.skipFolderLayerNamesEnabled
        ? (config.skipFolderLayerNames || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
        : [];

      if (skipNames.length === 0 || depth >= config.maxFolderSkipDepth) {
        return { parentId, result };
      }

      // Candidates: folders whose name CONTAINS one of skipNames.
      // Unrelated folders (e.g. "fotos") are excluded entirely and never
      // count toward the ambiguity check below.
      const candidates = items.filter((it) => {
        if (!it.IsFolder) return false;
        const lower = (it.Name || "").toLowerCase();
        return skipNames.some((skipName) => lower.includes(skipName));
      });

      let target = null;
      if (candidates.length === 1) {
        const candidate = candidates[0];
        const isExact = skipNames.includes((candidate.Name || "").toLowerCase());
        if (isExact && config.skipFolderLayerExactMatchEnabled) {
          target = candidate;
        } else if (!isExact && config.skipFolderLayerFuzzyFallbackEnabled) {
          target = candidate;
        }
      }

      if (target) {
        return resolveSkippedFolder(target.Id, config, depth + 1);
      }
      return { parentId, result };
    });
  }

  // ---- geometry ----------------------------------------------------------
  /**
   * The preview's pivot point for a given card: horizontally centered, and
   * positioned so config.overlap of the middle tile's poster sits inside
   * the card while the rest rises above it. Shared by buildPreview() (initial
   * placement) and repositionActive() (keeping it glued to the card).
   * tileWidth/tileAspectRatio are this preview's actual, resolved tile
   * dimensions (see computeTileWidth() / resolveTileAspectRatio()) — NOT
   * always equal to config.posterWidth, since wider ratios (e.g. TV Season
   * episodes) get a wider tile to preserve visual area.
   */
  function getPivot(rect, config, tileWidth, tileAspectRatio) {
    const posterHeight = tileWidth / tileAspectRatio;
    const x = rect.left + rect.width / 2;
    const posterCenterY = rect.top + posterHeight * (config.overlap - 0.5);
    const y = posterCenterY + config.lift;
    return { x, y };
  }

  /**
   * centerHoverOnly: is the pointer currently triggering Jellyfin's own
   * hover state on this card's play button? ".cardOverlayFab-primary" grows
   * (scale 1.4x) and — in some themes — changes color purely via native CSS
   * ":hover", so asking the browser whether IT considers the button hovered
   * gives us the exact rendered hit-area for free (including the enlarged
   * state), no geometry math needed. Some card types (Home Video folders)
   * never render this button at all — folders aren't playable — so for
   * those isInCenterZone() falls back to a purely geometric, invisible
   * circle in the middle of the card instead (see config.centerHoverZoneRatio).
   */
  function getPlayButton(card) {
    // ".cardOverlayFab-primary" for normal grid cards (cardBuilder.js);
    // ".listItemImageButton[data-action='resume']" for the season page's
    // own episode LIST view (listview.js) — confirmed via real DOM
    // inspection to be a genuinely different, real Resume/Play button
    // there, not the same element under a different name.
    return card.querySelector(".cardOverlayFab-primary, .listItemImageButton[data-action='resume']");
  }

  /**
   * True if the pointer currently counts as "in the center zone" for
   * centerHoverOnly mode. Prefers the real play button's native :hover
   * state (Sets/TV Shows always have one). If the card has no such button
   * at all — true for Home Video folders and season-list episodes, which
   * don't render one — falls back to a plain geometric circle, sized via
   * config.centerHoverZoneRatio (a fraction of the shorter side). That
   * circle is centered on the card's own ".cardImageContainer" (the actual
   * thumbnail/image area) when present, NOT the whole card element —
   * Jellyfin cards include a title-text area below the image as part of
   * their overall bounding box, which would otherwise shift the computed
   * center noticeably downward from where the image (and the real button,
   * when one exists) actually sits. Falls back to the whole card's own
   * rect if no such image container is found. If centerHoverZoneRatio
   * isn't set either, there's simply no zone to trigger on for this card.
   */
  /**
   * The rect to use for VISUAL purposes (fan positioning, geometric
   * center-zone fallback) — deliberately NOT always card.getBoundingClientRect()
   * itself. Normal grid cards are compact and their own rect is exactly
   * right, but the season page's episode LIST rows (see Episode's
   * cardSelector / getPlayButton()) are wide, full-width rows with the
   * actual thumbnail sitting only at the left edge — using the whole row's
   * rect would center the fan over empty space instead of the thumbnail.
   * Falls back to the card's own rect if neither known inner element exists.
   */
  function getCardVisualRect(card) {
    const inner = card.querySelector(".cardImageContainer, .listItemImage");
    return (inner || card).getBoundingClientRect();
  }

  function isInCenterZone(card, config) {
    const btn = getPlayButton(card);
    if (btn) {
      try {
        return btn.matches(":hover");
      } catch (e) {
        return false; // ":hover" in .matches() should be universally supported; fail closed if not
      }
    }
    if (!config || !config.centerHoverZoneRatio) return false;
    const rect = getCardVisualRect(card);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) * config.centerHoverZoneRatio;
    const dx = lastMouse.x - cx;
    const dy = lastMouse.y - cy;
    return dx * dx + dy * dy <= radius * radius;
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
      const delay = (a.tiles.length - 1 - i) * a.config.staggerMs;
      b.arm.style.transitionDelay = `${delay}ms`;
      b.arm.style.transform = "rotate(0deg) translateY(0px)";
      b.tile.style.transitionDelay = `${delay}ms`;
      b.tile.style.opacity = "0";
      b.tile.style.transform = "translate(-50%,-50%) scale(.6)";
    });
    const finished = a.container;
    setTimeout(() => finished.remove(), a.config.closeMs + a.tiles.length * a.config.staggerMs);
    active = null;
  }

  /**
   * Creates one arm + tile pair and wires click-through navigation. Does NOT
   * trigger the opening animation itself — buildPreview() does that for all
   * tiles at once, after forcing a reflow (see there for why).
   * `canPlay` marks real, playable items (not the "+N" more-badge tile) —
   * only those get the optional replicated focus play-button.
   */
  function buildTile(container, angle, contentEl, titleText, itemId, canPlay, config, isFolder, chapterStartTicks) {
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

    if (config.subtileFocusPlayButton && canPlay && itemId) {
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
        if (chapterStartTicks != null) {
          playItemDirectAtChapter(itemId, chapterStartTicks, config);
        } else {
          playItemDirect(itemId, config);
        }
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
        if (isFolder) {
          // Same wrapper-folder-skipping rules as the hover-open flow (see
          // resolveSkippedFolder) — if this folder ALSO turns out to be a
          // pointless single wrapper layer, jump straight through it
          // instead of landing on an empty middle folder.
          resolveSkippedFolder(itemId, config, 0)
            .then(({ parentId }) => goToFolder(parentId))
            .catch(() => goToFolder(itemId)); // fall back to the original target if the check itself fails
        } else {
          // Chapter tiles: clicking anywhere except the play button
          // navigates normally to the item's own details page, same as
          // every other tile type — the seek-to-chapter behavior is
          // exclusive to the play button (see above).
          goToItem(itemId);
        }
      });
    }

    arm.appendChild(tile);
    container.appendChild(arm);

    return { arm, tile, titleEl, titleInner, marqueeMeasured: false, base: angle, cur: angle, tgt: angle, rot: 0, focused: false };
  }

  function buildPreview(card, rect, items, totalCount, config, moreTargetId, moreTargetIsFolder) {
    const api = getApiClient();
    const container = document.createElement("div");
    container.className = "jf-preview-container";

    // Home Videos: optionally re-order folders/videos with independent
    // sort rules — no-op for every other config (and for Home Video
    // folders that aren't actually mixed).
    items = applySeparateFolderVideoSort(items, config);

    // One shared tile shape (width/height ratio) for the whole fan — see
    // resolveTileAspectRatio() for why this isn't per-tile. Defaults to
    // plain 2/3 for configs that don't define autoDetectAspectRatio at all
    // (Sets/TV Shows). tileWidth is then sized to either match posterHeight
    // exactly (TV Seasons/Home Videos) or preserve visual area (Sets/TV
    // Shows) — see computeTileWidth().
    const tileAspectRatio = resolveTileAspectRatio(items, config);
    const tileWidth = computeTileWidth(config, tileAspectRatio);

    // Size-dependent CSS custom properties for this specific preview
    // instance — see the stylesheet comment near the top for why these
    // aren't fixed values baked into the shared <style> tag.
    container.style.setProperty("--jf-poster-width", `${tileWidth}px`);
    // Fixed size, based on a stable reference width (NOT the actual,
    // possibly-wide tileWidth) — otherwise the button would grow along
    // with wider tiles (e.g. TV Season episodes).
    container.style.setProperty("--jf-playbtn-size", `${getButtonSizeReferenceWidth(config) * config.subtilePlayButtonSizeRatio}px`);
    container.style.setProperty("--jf-tile-aspect-ratio", String(tileAspectRatio));

    const pivot = getPivot(rect, config, tileWidth, tileAspectRatio);
    container.style.left = `${pivot.x}px`;
    container.style.top = `${pivot.y}px`;

    const shown = items.slice(0, config.maxPosters);
    const extra = totalCount - shown.length;
    const n = shown.length + (extra > 0 ? 1 : 0);
    const spread = n > 1 ? Math.min(config.maxSpreadDeg, (n - 1) * config.degPerPoster) : 0;
    const step = n > 1 ? spread / (n - 1) : config.degPerPoster;

    const tiles = [];
    shown.forEach((item, i) => {
      const angle = -spread / 2 + i * step;
      const img = document.createElement("img");
      img.className = "jf-preview-poster";
      // Movies/Episodes/Home Video files (fetchMode: "chapters"): these are
      // synthetic "items" wrapping chapter data (see fetchItemChapters()),
      // not real Jellyfin items — they need the dedicated chapter image
      // URL builder instead of the normal poster one.
      img.src = item.Type === "Chapter" ? getChapterPosterUrl(item, api) : getPosterUrl(item, api);
      img.alt = item.Name || "";
      // Hide broken posters instead of showing the browser's broken-image icon.
      img.onerror = () => { img.style.visibility = "hidden"; };
      // Sets/TV Shows: children are always playable movies/seasons, so
      // canPlay is always true and isFolder always false — unchanged from
      // before. Home Videos: a folder's direct children can be a MIX of
      // sub-folders (not playable, and clicking navigates via the folder
      // route rather than the item-details route) and actual videos
      // (playable, normal item-details navigation). Chapters: always
      // playable (canPlay true, isFolder false), but ALSO carry a
      // chapterStartTicks value that routes clicks to seek-to-timestamp
      // playback instead of normal navigation (see buildTile()).
      //
      // Deliberately checks item.Type === "Folder" (the literal BaseItemKind),
      // NOT the generic item.IsFolder flag — IsFolder is true for ANY
      // container item (Seasons, Series, BoxSets all have children too),
      // which wrongly routed Season tiles (under TV Shows) to the folder
      // navigation route instead of their own normal details page.
      const isFolder = item.Type === "Folder";
      const canPlay = !isFolder;
      const chapterStartTicks = item.Type === "Chapter" ? item._chapterStartTicks : null;
      tiles.push(buildTile(container, angle, img, formatTileTitle(item, config), item.Id, canPlay, config, isFolder, chapterStartTicks));
    });

    if (extra > 0) {
      const i = shown.length;
      const angle = -spread / 2 + i * step;
      const badge = document.createElement("div");
      badge.className = "jf-preview-poster jf-preview-more";
      badge.textContent = `+${extra}`;
      // "+N" badge opens the parent item itself, where the rest can be seen.
      // Uses moreTargetId (the resolved, possibly-skipped-into folder) when
      // given, falling back to the hovered card's own id — Sets/TV Shows
      // always pass their own id here since they never skip anything.
      // moreTargetIsFolder routes the click correctly: true for Home Videos
      // (target is a genuine Folder item), false for Sets/TV Shows (target
      // is a BoxSet/Series, a proper details-page item).
      tiles.push(buildTile(container, angle, badge, "", moreTargetId != null ? moreTargetId : card.dataset.id, false, config, !!moreTargetIsFolder));
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
        b.arm.style.transitionDelay = `${i * config.staggerMs}ms`;
        b.arm.style.transform = `rotate(${b.base}deg) translateY(-${config.lift}px)`;
        b.tile.style.transitionDelay = `${i * config.staggerMs}ms`;
        b.tile.style.opacity = "1";
        b.tile.style.transform = "translate(-50%,-50%) scale(1)";
      });
    });

    // Default stacking before any hover: leftmost card on top.
    tiles.forEach((b, i) => { b.arm.style.zIndex = String(tiles.length - i); });

    const previewHalfWidth = Math.sin(((spread / 2) * Math.PI) / 180) * config.lift + tileWidth / 2;
    active = {
      card,
      config, // the type config that this open preview belongs to
      tileAspectRatio, // resolved width/height ratio shared by all tiles in this fan
      tileWidth, // actual resolved tile width in px
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
      readyAt: performance.now() + n * config.staggerMs + 500,
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
        b.cur += (b.tgt - b.cur) * a.config.smoothing;
        const rotTgt = b.focused ? -b.cur : 0;
        b.rot += (rotTgt - b.rot) * a.config.smoothing;
        b.arm.style.transform = `rotate(${b.cur}deg) translateY(-${a.config.lift}px)`;
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
    const posterHeight = a.tileWidth / a.tileAspectRatio;
    const left = Math.min(r.left, a.pivotX - a.previewHalfWidth);
    const right = Math.max(r.right, a.pivotX + a.previewHalfWidth);
    const top = a.pivotY - a.config.lift - posterHeight / 2 - 10;
    const bottom = r.bottom;
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  function onPointerMove(x, y) {
    const a = active;
    if (!a || !a.tiles) return;

    // Focus tracking only applies above the top third of the card;
    // the lower two-thirds leave the preview at rest.
    const r = a.rect;
    const posterHeight = a.tileWidth / a.tileAspectRatio;
    const left = Math.min(r.left, a.pivotX - a.previewHalfWidth);
    const right = Math.max(r.right, a.pivotX + a.previewHalfWidth);
    const top = a.pivotY - a.config.lift - posterHeight / 2 - 10;
    const bottom = r.top + r.height / 3;

    if (x < left || x > right || y < top || y > bottom) {
      setFocused(null);
      a.tiles.forEach((b) => { b.tgt = b.base; });
      return;
    }

    // Tile centers sit at sin(angle) * lift, so asin() inverts that to map the
    // pointer's x-offset onto the arc — a tile focuses exactly when the pointer
    // lines up with where it visually sits, keeping the outermost tiles reachable.
    const t = Math.max(-1, Math.min(1, (x - a.pivotX) / a.config.lift));
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
      const push = a.config.hoverPushDeg * Math.sign(d) * Math.exp(-((d / sigma) * (d / sigma)));
      b.tgt = b.base * a.config.hoverSpreadScale + (b.focused ? 0 : push);
    });
  }

  document.addEventListener("mousemove", (e) => {
    lastMouse.x = e.clientX;
    lastMouse.y = e.clientY;
    onPointerMove(e.clientX, e.clientY);

    if (active && inActivePreview(e.target)) return; // pointer is on the preview itself, not the underlying card

    // If a preview is already open, its own reachable area (card + tile fan)
    // takes priority over whatever's strictly under the pointer — this is
    // what lets you travel from the play button towards a tile without it
    // closing en route. Only once you leave that whole area do we close it
    // and fall through to evaluating whatever card is now under the pointer.
    // This branch only APPLIES if the open preview's own config uses
    // centerHoverOnly — otherwise (full-card mode) mouseover/mouseout own
    // opening/closing entirely, and this handler has nothing to do.
    if (active) {
      if (!active.config.centerHoverOnly) return;
      if (isWithinPreviewBounds(active, e.clientX, e.clientY)) return;
      clearActive(false);
    }

    const card = e.target && e.target.closest ? e.target.closest(CARD_SELECTOR) : null;
    const typeInfo = resolveTypeConfig(card);

    // No card, or a recognized card whose config doesn't use centerHoverOnly
    // — nothing for this handler to do (mouseover/mouseout own it instead).
    if (!typeInfo || !typeInfo.config.centerHoverOnly) {
      if (zoneCard && card !== zoneCard) { clearTimeout(hoverTimers.get(zoneCard)); zoneCard = null; }
      return;
    }
    const config = typeInfo.config;

    if (card !== zoneCard) {
      // Pointer moved onto a different card (or from blank space) — drop any
      // pending timer for whichever card we were previously tracking.
      if (zoneCard) clearTimeout(hoverTimers.get(zoneCard));
      zoneCard = null;
    }

    const inZone = isInCenterZone(card, config);
    if (inZone) {
      if (zoneCard !== card) {
        zoneCard = card;
        clearTimeout(hoverTimers.get(card));
        hoverTimers.set(card, setTimeout(() => showPreview(card), config.centerHoverOnlyDelay));
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

    const typeInfo = resolveTypeConfig(card);
    if (!typeInfo) return;
    const config = typeInfo.config;

    const parentId = card.dataset.id;
    if (!parentId) {
      warn("card has no data-id attribute — selector matched something unexpected", card);
      return;
    }
    if (!getApiClient()) {
      warn("window.ApiClient is not available, cannot fetch items");
      return;
    }

    // Movies/Episodes/Home Video files (fetchMode: "chapters") fetch a
    // single video's own chapter list instead of a container's children —
    // fetchItemChapters() returns the same {Items, TotalRecordCount} shape
    // resolveSkippedFolder() does, so everything below this point works
    // identically either way, with no further special-casing needed.
    const fetchPromise =
      typeInfo.fetchMode === "chapters"
        ? fetchItemChapters(parentId, config).then((result) => ({ parentId, result }))
        : resolveSkippedFolder(parentId, config, 0);

    fetchPromise
      .then(({ parentId: effectiveParentId, result }) => {
        // ":hover" can be stale right after a scroll; confirm with elementFromPoint too.
        const under = lastMouse.x >= 0 ? document.elementFromPoint(lastMouse.x, lastMouse.y) : null;
        const stillOver = card.matches(":hover") || (under && card.contains(under));
        if (!stillOver) return;
        // centerHoverOnly: the fetch is async, so also re-check the pointer is
        // still within the center zone by the time the response comes back.
        if (config.centerHoverOnly && !isInCenterZone(card, config)) return;

        const items = result.Items || [];
        const totalCount = result.TotalRecordCount || items.length;

        // TV Shows: a single-season series has nothing meaningful to fan
        // out as its own seasons — skip entirely (only checked if the
        // config defines it, so this has no effect on Sets/Collections).
        if (config.skipSingleSeason && totalCount <= 1) {
          // Optional fallback: show that one season's EPISODES instead of
          // doing nothing, using CONFIG_TVSEASONS' own settings for them —
          // exactly as if the season card itself had been hovered.
          if (config.singleSeasonShowEpisodesInstead && items.length === 1) {
            const season = items[0];
            const seasonConfig = TYPE_CONFIGS.Season.config;
            fetchChildItems(season.Id, seasonConfig)
              .then((episodeResult) => {
                // Recompute fresh — this is a second, separate async fetch
                // that can resolve well after the first one did, so the
                // outer "under"/"stillOver" from above may be stale by now.
                const underNow = lastMouse.x >= 0 ? document.elementFromPoint(lastMouse.x, lastMouse.y) : null;
                const stillOverNow = card.matches(":hover") || (underNow && card.contains(underNow));
                if (!stillOverNow) return;
                if (config.centerHoverOnly && !isInCenterZone(card, config)) return;

                const episodeItems = episodeResult.Items || [];
                const episodeTotal = episodeResult.TotalRecordCount || episodeItems.length;
                if (!episodeItems.length) return;

                clearActive(true);
                buildPreview(card, getCardVisualRect(card), episodeItems, episodeTotal, seasonConfig, season.Id, false);
              })
              .catch((e) => err("singleSeasonShowEpisodesInstead fetch failed:", e));
          }
          return;
        }

        if (!items.length) return;

        clearActive(true);
        // Only Home Videos' resolved "+N more" target is itself a Folder
        // item (needing the list.html route) — Sets/TV Shows always point
        // at a BoxSet/Series (a normal details-page item).
        const moreTargetIsFolder = typeInfo.key === "homevideos";
        buildPreview(card, getCardVisualRect(card), items, totalCount, config, effectiveParentId, moreTargetIsFolder);
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
    const typeInfo = resolveTypeConfig(card);
    if (!typeInfo) return;
    const config = typeInfo.config;

    // Coming back from the preview onto its own card shouldn't restart anything.
    if (active && active.card === card && inActivePreview(e.relatedTarget)) return;

    clearTimeout(hoverTimers.get(card));

    // centerHoverOnly: the mousemove listener above owns the open-trigger timer
    // in this mode (it only starts once the pointer is actually within the
    // center zone), so skip the plain "anywhere on the card" trigger here.
    if (config.centerHoverOnly) return;

    hoverTimers.set(card, setTimeout(() => showPreview(card), config.hoverDelay));
  });

  document.addEventListener("mouseout", (e) => {
    const card = e.target.closest(CARD_SELECTOR);
    if (card) {
      const typeInfo = resolveTypeConfig(card);
      const config = typeInfo ? typeInfo.config : null;

      if (card.contains(e.relatedTarget)) return;
      // The preview overlaps the card, so moving onto a tile fires the card's mouseout too — ignore it.
      if (active && active.card === card && inActivePreview(e.relatedTarget)) return;

      clearTimeout(hoverTimers.get(card));
      if (zoneCard === card) zoneCard = null;
      // centerHoverOnly: closing is owned by the mousemove fan-bounds check
      // instead (it also covers the arc the tiles occupy beyond the card's
      // own edges) — closing here on the plain card boundary would cut that
      // off short, before the pointer ever reaches a tile.
      if (config && !config.centerHoverOnly && active && active.card === card) clearActive(false);
      return;
    }

    // Leaving the preview itself: close unless heading back onto the card or another tile.
    if (active && inActivePreview(e.target)) {
      const to = e.relatedTarget;
      if (inActivePreview(to) || (to && active.card.contains(to))) return;
      if (!active.config.centerHoverOnly) clearActive(false);
    }
  });

  // ---- keep the preview glued to its card on resize ----------------------
  // The container is position:fixed, so a layout shift would drift it off
  // its card — re-anchor instead of closing it.
  let repositionQueued = false;

  function repositionActive() {
    if (!active) return;
    const rect = getCardVisualRect(active.card);
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      clearActive(true);
      return;
    }
    const pivot = getPivot(rect, active.config, active.tileWidth, active.tileAspectRatio);
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
    // Note: the settle duration itself can't be type-specific — we don't
    // know which card (if any) the pointer will end up over until AFTER
    // scrolling has actually stopped. CONFIG_SETS.scrollSettleMs is used as
    // the shared baseline for this one timing; each config's own
    // scrollSettleMs value only affects its own hover-open delay elsewhere.
    scrollEndTimer = setTimeout(() => {
      isScrolling = false;
      // Reopen for whichever card the (stationary) pointer landed on.
      const under = lastMouse.x >= 0 ? document.elementFromPoint(lastMouse.x, lastMouse.y) : null;
      const card = under && under.closest ? under.closest(CARD_SELECTOR) : null;
      if (card) {
        const typeInfo = resolveTypeConfig(card);
        if (typeInfo && typeInfo.config.centerHoverOnly && !isInCenterZone(card, typeInfo.config)) return;
        showPreview(card);
      }
    }, CONFIG_SETS.scrollSettleMs);
  }, { passive: true, capture: true });

  window.addEventListener("resize", queueReposition);
})();
