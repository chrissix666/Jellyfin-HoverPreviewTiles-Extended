# Jellyfin Hover Preview Tiles Extended

This is a fork and further development of the **[Jellyfin – Collection Preview](https://gist.github.com/malte9799/691a52da31f703d176d4f913c5de5fe4)** Script by malte9799 on [Github](https://github.com/malte9799) and [reddit](https://www.reddit.com/user/Malte9799/), originally published as a GitHub Gist. **All credits goes to him!**

Based on his already very advanced Script, a number of small improvements, adjustments & additions have been made:

- **Reliable opening animation** — In the original script, the opening animation on hover wasn't always consistent — sometimes the tiles would just pop in instantly instead of animating. This has been fixed so the opening animation now always plays consistently.
- **Alternative hover mode (`centerHoverOnly`)** — An alternative hover mode has been added (enable via `CONFIG`). Instead of the subtiles fanning out whenever the mouse is anywhere over the main card (as in the original), they now only appear when the play button in the center of the main card is specifically focused/hovered. This makes the whole interaction calmer and more deliberate.
- **Subtile play button (`subtileFocusPlayButton`)** — An alternative subtile play button has been added (enable via `CONFIG`). When enabled, the currently focused subtile always shows a play button. Clicking it starts the movie directly; clicking anywhere else on the subtile behaves as usual (navigates to the item's details page).<br>
Note: To make this work, after a lot of experimenting and testing, I couldn't find any other solution than navigating directly to the movie detail page and triggering the Play button via script. A black fade transition is used to mask this process so it's barely noticeable, or ideally not noticeable at all.
- **TV Shows** (`CONFIG_TVSHOWS`) — hovering a Series card fans out its seasons. Series with only one season can optionally skip straight to showing that season's *episodes* instead of a single, pointless season tile.
- **TV Show Seasons** (`CONFIG_TVSEASONS`) — hovering a Season card fans out its episodes. Tile shape auto-detects from the episodes' own thumbnails (usually widescreen) instead of assuming a poster shape.
- **Home Videos** (`CONFIG_HOMEVIDEOS`) — hovering a Home Video folder fans out its contents, which can be a mix of sub-folders and actual video files. Pointless single wrapper folders (e.g. a folder that only contains one sub-folder called "videos") get skipped automatically, both when opening the fan and when clicking into a folder tile. Folders and videos can optionally be sorted independently of each other.
- **Chapter previews** (`CONFIG_MOVIES`, `CONFIG_EPISODES`, `CONFIG_HOMEVIDEOFILES`) — hovering a Movie, Episode, or individual Home Video file card fans out *that video's own chapters* instead of child items, using Jellyfin's real chapter images. Clicking a chapter tile's play button jumps straight into the video, seeked to that exact timestamp.
- **Global settings** — the hover preview can be switched off entirely on the Home page and/or inside "More Like This" sections & "Next Up" for TV Shows, independent of the per-type configs, for every card type at once.


# Configuration

The script has eight config blocks, split into two families, plus one global block that applies everywhere.

- **Container preview** (`CONFIG_SETS`, `CONFIG_TVSHOWS`, `CONFIG_TVSEASONS`, `CONFIG_HOMEVIDEOS`) — fans out a container's **children** (movies in a collection, seasons of a series, episodes of a season, contents of a home video folder), fetched via Jellyfin's `ParentId` query.
- **Chapter preview** (`CONFIG_MOVIES`, `CONFIG_EPISODES`, `CONFIG_HOMEVIDEOFILES`) — fans out a single video's own **chapters** instead, fetched via that item's own `Chapters` field — a completely different data path, since a video has no children in the container sense.

A lot of fields repeat across configs with the exact same meaning — those are explained once under "Shared settings," and each config's own section then only lists what's unique to it.

## Shared settings

(`enabled`, `hoverDelay`, `maxPosters`, `posterWidth`/`posterHeight`, `maxSpreadDeg`, `degPerPoster`, `lift`, `overlap`, `hoverPushDeg`, `hoverSpreadScale`, `smoothing`, `staggerMs`, `closeMs`, `scrollSettleMs`, `sortBy`, `sortOrder`, `centerHoverOnly`, `centerHoverOnlyDelay`, `centerHoverZoneRatio`, `subtileFocusPlayButton`, `subtilePlayButtonSizeRatio`, `directPlayButtonTimeoutMs`, `directPlayRevealDelayMs`, `autoDetectAspectRatio`, `aspectRatioCandidates`, `fallbackAspectRatio`)

**`enabled`** (`true` / `false`) — master on/off switch for this card type. When `false`, hovering that type of card does nothing at all, as if the script didn't handle it.

**`hoverDelay`** (number, ms) — how long the pointer has to stay before the preview opens, in full-card hover mode.

**`maxPosters`** (number) — the most tiles shown in the fan at once; anything beyond that collapses into a "+N more" tile.

**`posterWidth`** (number, px) — fixed tile width, used by configs whose content is portrait/poster-shaped (2:3). Height is derived automatically. Mutually exclusive with `posterHeight`.

**`posterHeight`** (number, px) — fixed tile height, used by configs whose content is typically widescreen (episodes, chapters, home videos). Width is derived automatically from the detected aspect ratio.

**`maxSpreadDeg`** (number, degrees) — the maximum total angle the fan opens to once it's full.

**`degPerPoster`** (number, degrees) — how much extra angle each additional poster adds, up to the `maxSpreadDeg` ceiling.

**`lift`** (number, px) — how far the fan rises above the card.

**`overlap`** (number, 0–1) — how much of the middle tile stays hidden inside the card versus rising above it. 0.5 means half in, half out.

**`hoverPushDeg`** (number, degrees) — how far neighboring tiles get pushed apart when one tile is focused.

**`hoverSpreadScale`** (number, e.g. `1.06`) — a small multiplier that widens the whole fan slightly while the pointer is actively tracking across it.

**`smoothing`** (number, 0–1) — how fluidly the fan follows the mouse; higher values feel snappier, lower values feel more eased.

**`staggerMs`** (number, ms) — the delay between each tile's individual opening animation.

**`closeMs`** (number, ms) — how long the closing animation takes.

**`scrollSettleMs`** (number, ms) — how long the page has to stop scrolling before the preview is allowed to reopen.

**`sortBy`** — one of `Album`, `AlbumArtist`, `Artist`, `Budget`, `CommunityRating`, `CriticRating`, `DateCreated`, `DatePlayed`, `PlayCount`, `PremiereDate`, `ProductionYear`, `SortName`, `Random`, `Revenue`, `Runtime`.

**`sortOrder`** — `Ascending` or `Descending`.

**`centerHoverOnly`** (`true` / `false`) — if true, the fan only opens when the pointer is specifically over the play button / center zone of the card, not anywhere on the card.

**`centerHoverOnlyDelay`** (number, ms) — a separate delay used only for that center-zone trigger. Fully replaces `hoverDelay` for this path rather than adding to it.

**`centerHoverZoneRatio`** (number, 0–1) — radius of an invisible circular hover zone, as a fraction of the card's shorter side. Only used as a fallback where no real play button exists on the card to hover natively (folders, or list-view episode rows).

**`subtileFocusPlayButton`** (`true` / `false`) — adds a small play button on whichever tile is currently focused, jumping straight into playback from the fan.

**`subtilePlayButtonSizeRatio`** (number, 0–1) — that button's diameter, as a fraction of the tile's reference size.

**`directPlayButtonTimeoutMs`** (number, ms) — how long to keep waiting for the real play button to appear on the destination page before giving up.

**`directPlayRevealDelayMs`** (number, ms) — how long the black transition overlay is held after clicking, before it fades away.

**`autoDetectAspectRatio`** (`true` / `false`) — automatically figures out the most common image shape from the actual fetched items' own image data.

**`aspectRatioCandidates`** (comma-separated ratio strings, e.g. `"2/3, 1/1, 4/3, 16/9"`) — the "clean" shapes the detected average gets snapped to.

**`fallbackAspectRatio`** (single ratio string, e.g. `"2/3"`) — the shape used when detection is off, or no usable image data exists.

## Group A — Container preview

### `CONFIG_SETS` — BoxSet / Collection cards

All shared settings above (width-anchored, via `posterWidth`), plus:

**`showYearInTitle`** (`true` / `false`) — shows each tile's title as "Name (Year)" instead of just "Name".

### `CONFIG_TVSHOWS` — Series cards, fans out a series' seasons

All shared settings (width-anchored), plus:

**`skipSingleSeason`** (`true` / `false`) — if a series only has one season, the preview doesn't open at all rather than fanning out a single poster.

**`singleSeasonShowEpisodesInstead`** (`true` / `false`) — only relevant when the setting above applies. Instead of doing nothing, shows that one season's episodes directly, using `CONFIG_TVSEASONS`'s own settings for them.

### `CONFIG_TVSEASONS` — Season cards, fans out a season's episodes

All shared settings, height-anchored (`posterHeight`), with `autoDetectAspectRatio` / `aspectRatioCandidates` / `fallbackAspectRatio` active, plus:

**`showSeasonEpisodeNumberInTitle`** (`true` / `false`) — prefixes each tile's title with "SX:EY – ".

### `CONFIG_HOMEVIDEOS` — Home Video folder cards, fans out a folder's contents

All shared settings, height-anchored, with `centerHoverZoneRatio` active (folders have no real play button), plus:

**`separateSortForFoldersAndVideos`** (`true` / `false`) — sort folders and videos inside a mixed folder independently instead of together.

**`folderSortBy`** / **`folderSortOrder`**, **`videoSortBy`** / **`videoSortOrder`** — same options as the shared `sortBy`/`sortOrder`, applied separately. Only used when the setting above is true.

**`mixedOrderMode`** — `"foldersFirst"` or `"videosFirst"` — arrangement when a folder contains both. Only relevant when `separateSortForFoldersAndVideos` is true.

¹**`skipFolderLayerNamesEnabled`** (`true` / `false`) — master switch for automatically skipping single "wrapper folders"¹.

¹**`skipFolderLayerNames`** (comma-separated names, e.g. `"videos, clips, footage"`) — which folder names count as skippable "wrapper layers"¹.

¹**`skipFolderLayerExactMatchEnabled`** (`true` / `false`) — allows skipping when the sole candidate folder's name matches exactly.

¹**`skipFolderLayerFuzzyFallbackEnabled`** (`true` / `false`) — allows skipping when the sole candidate folder's name only contains one of `skipFolderLayerNames`, rather than matching exactly.

**`maxFolderSkipDepth`** (integer) — safety cap against endlessly/circularly nested folder structures.

¹What's a wrapper folder? A wrapper folder is a fixed, consistently-named subfolder, for example "videos", placed one level inside every home video folder, holding nothing but the actual video files. The outer folder can be named anything ("Birthday 2023," "Italy Trip"), but this inner one stays the same name everywhere, so scripts and backup tools always know exactly where to find the videos, no matter what the outer folder is called. Everything else that belongs with that folder, files like cover art, poster.jpg, folder.jpg, fanart.jpg and folders like backups, links, leftover cuts, photos, images, screenshots, lives next to this subfolder, not inside it, keeping "just the videos" cleanly separate from everything else. (In Jellyfin, unwanted folders can be hidden, either manually or automatically, by placing a ".ignore" file in them. This way, you can keep your own folder structure intact while still having everything prepared uniformly for Jellyfin Home Videos.)

Example with `skipFolderLayerNames: "videos"`:<br>
- Only "videos" present → skipped (exact match)<br>
- Only "videos Instagram" present → skipped (fuzzy fallback)<br>
- Both "videos Instagram" and "videos Youtube" present → **not** skipped, ambiguous — both shown as their own tiles

## Group B — Chapter preview

### `CONFIG_MOVIES` — Movie cards, fans out a movie's own chapters

All shared settings, height-anchored, with `fallbackAspectRatio` fixed at `"16/9"` (chapter images are always this shape, so `autoDetectAspectRatio` isn't used). No `sortBy`/`sortOrder` — chapters always come back chronologically.

### `CONFIG_EPISODES` — Episode cards, fans out an episode's own chapters

Same structure as `CONFIG_MOVIES`.

### `CONFIG_HOMEVIDEOFILES` — individual Home Video file cards, fans out their own chapters

Identical in structure and values to `CONFIG_MOVIES`.

## Global settings

### `GLOBAL_SETTINGS` — applies across every card type at once

**`enablePreviewsOnHome`** (`true` / `false`) — disables the hover preview entirely on the Home page (`#/home.html`), for every card type.

**`enablePreviewsOnSimilarSection`** (`true` / `false`) — disables the hover preview entirely within a "More Like This" section, for every card type.

**`enablePreviewsOnNextUp`** (`true` / `false`) — disables the hover preview entirely within the "Next Up" section for TV Shows.

## Tested on

- Windows 11
- Chrome
- Jellyfin Web 10.10.7
- Jellyfin JavaScript Injector

## License

MIT

---
Original readme post by [malte9799](https://github.com/malte9799):
# Jellyfin – Collection Preview

Hover a collection (BoxSet) card in the Jellyfin web client and its poster images spread out above it like a hand of cards being opened. The preview tracks your mouse — the poster nearest the cursor rotates upright and comes to the front with its title, while its neighbours part around it. Click any poster to jump straight to that item.

Plain client-side JavaScript. No server-side changes, no compiled plugin, no forked `jellyfin-web` — it only touches the DOM/CSS and Jellyfin's existing `window.ApiClient`, so it works alongside your other client customizations.

## Preview

https://github.com/user-attachments/assets/d88b76ef-896b-492c-b06d-baea90e13e84

## Features

- Hover a collection card to fan out all its poster images
- Continuous pointer tracking — the focused poster rises, rotates upright, and gets a highlight ring + title
- Click a poster to open that item
- Sorted oldest → newest by release date
- Respects `prefers-reduced-motion`
- Tunable via a single `CONFIG` object at the top of the script (poster size, spread angle, hover delay, animation speed, etc.)

## Installation

Requires the [JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector) plugin.

1. Go to **Dashboard → Plugins → JavaScript Injector**, add a new script entry, and paste in the full contents of `jellyfin-collection-preview.js`. Save and enable it.
2. Reload the Jellyfin web UI in your browser. Hover any collection card to see it in action.
