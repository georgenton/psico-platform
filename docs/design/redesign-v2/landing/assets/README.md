# Assets

This design uses **no raster images** — every icon is an inline SVG (viewBox, no fixed width/height, scales freely) defined directly in `index.html`.

- `/images` — none. Covers and avatars are CSS gradients, not files.
- `/icons` — inline SVG in markup. Icon set is original, Lucide-inspired (1.75 stroke, round caps), see README of the root folder for the full list and `window.Icons` mapping in the design system.
- `/fonts` — none bundled. Fonts load from Google Fonts CDN (Geist + Geist Mono), all OFL/free to redistribute.
