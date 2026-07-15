# Jellyfin Hover Preview Tiles Extended

This is a fork and further development of the **[Jellyfin – Collection Preview](https://gist.github.com/malte9799/691a52da31f703d176d4f913c5de5fe4)** Script by malte9799 on [Github](https://github.com/malte9799) and [reddit](https://www.reddit.com/user/Malte9799/), originally published as a GitHub Gist. **All credits goes to him!**

Based on his already very advanced Script, a number of small improvements, adjustments & additions have been made:

- In the original script, the opening animation on hover wasn't always consistent — sometimes the tiles would just pop in instantly instead of animating. This has been fixed so the opening animation now always plays consistently.
- An alternative hover mode has been added (enable via config). Instead of the subtiles fanning out whenever the mouse is anywhere over the main card (as in the original), they now only appear when the play button in the center of the main card is specifically focused/hovered. This makes the whole interaction calmer and more deliberate.
- An alternative subtile play button has been added (enable via config). When enabled, the currently focused subtile always shows a play button. Clicking it starts the movie directly; clicking anywhere else on the subtile behaves as usual (navigates to the item's details page).<br>
Note: To make this work, after a lot of experimenting and testing, I couldn't find any other solution than navigating directly to the movie detail page and triggering the Play button via script. A black fade transition is used to mask this process so it's barely noticeable, or ideally not noticeable at all.

Support for TV shows is also planned, using season tiles with a completely separate config. Home Videos support may be added as well. None of this has been implemented in the script yet.

---

## Tested on

- Windows 11
- Chrome
- Jellyfin Web 10.10.7
- Jellyfin JavaScript Injector

---

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
