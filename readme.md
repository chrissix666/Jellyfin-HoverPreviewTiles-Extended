# Jellyfin – HoverPreviewTiles (Extended)

This is a fork and further development of the **[Jellyfin – Collection Preview](https://gist.github.com/malte9799/691a52da31f703d176d4f913c5de5fe4)** script by **[malte9799](https://github.com/malte9799)** ([Reddit](https://www.reddit.com/user/Malte9799/)), originally published as a GitHub Gist.

**All credit for the original concept and the already very solid implementation goes to him!**

Based on his JavaScript, a number of small improvements and adjustments have been made:

- ...
- ...
- ...

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
