# Assets

This brand has **no logo SVG, no PNG, no illustrations** in the source repo. The brand is a wordmark only.

## Wordmark

`Psico Platform` set in **Geist Sans 700**, color **lavender-700** (`#5e42c0`). Sentence tracking: `letter-spacing: -0.01em`. Always two words, title-case, never lowercase.

```html
<span
  style="font: 700 20px Geist, sans-serif; color: #5e42c0; letter-spacing: -0.01em;"
  >Psico Platform</span
>
```

See `../preview/brand-wordmark.html` for sized variants.

## Imagery policy

Until original art is commissioned:

- **Book covers** = gradient tile + emoji 📖 (or two-letter title initials in white). See `../preview/components-cover.html`.
- **Hero/feature illustrations** = soft lavender→warm gradient backgrounds with optional radial blobs. No people, no abstract 3D, no stock photography.
- **Logos for partner brands (B2B)** = render as a wordmark in `warm-700` until real assets exist.

## Icons — see `../README.md` § Iconography

- Mobile: `@expo/vector-icons` Ionicons (no static files needed).
- Web: native emoji + `→ ✓` glyphs. Substitute Lucide ([lucide.dev](https://lucide.dev)) where emoji can't carry meaning.

## Favicon

Not provided. When commissioning, target a single-letter "P" mark in lavender-600 on warm-50, 32×32 minimum.
