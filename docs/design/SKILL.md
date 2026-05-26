---
name: Psico Platform Design System
trigger: User mentions Psico Platform, psicoplatform, Emociones en Construcción, Familias Ensambladas, or asks for designs in the brand voice (Spanish-language psychoeducation, lavender + sage/eucalyptus palette, Geist type, warm-50 paper surfaces).
---

# Psico Platform — design system skill

When designing for Psico Platform, ground your work in this folder before drawing anything.

## Where things live

- `README.md` — read this first. It contains the **CONTENT FUNDAMENTALS** (Spanish copy, voice, casing, punctuation, emoji policy) and **VISUAL FOUNDATIONS** (color roles, type, surfaces, spacing, animation, transparency, what to avoid). Do not invent rules that contradict it.
- `colors_and_type.css` — single source of truth for tokens. Always import this rather than hand-typing hex values.
- `preview/` — one card per token group. Use these to confirm a swatch, scale, or component pattern before using it.
- `ui_kits/web/Web UI kit.html` — marketing + dashboard reference. Mirrors `apps/web/src/app/globals.css` component classes (`.btn-sage`, `.btn-outline-lavender`, `.btn-soft`, `.field`, `.pill-*`, `.hero-bg`, `.cover-cool/warm-g/mixed`).
- `ui_kits/mobile/Mobile UI kit.html` — iOS frames. Mirrors `apps/mobile/src/theme.ts` and the `app/(tabs)/*` flow.
- `apps/` and `packages/` — unmodified import from `github.com/georgenton/psico-platform`. Use these as the canonical source when a token, component, or copy line is ambiguous.

## Working rules

1. **Spanish first.** Every user-facing string is in Spanish, neutral _latinoamericano_, second-person singular ("tú"), sentence-case. Code comments and asset filenames are English. Never default to English UI copy.
2. **Three palettes do all the work.** Lavender = identity/headings/links. Sage (or proposed eucalyptus replacement, see `preview/colors-sage.html`) = CTAs/success only. Warm = surfaces/text. Never put lavender on a CTA — it's `btn-sage` or `btn-soft`.
3. **Page background is `warm-50` (`#fafaf8`)**, not white. Cards are white, radius 24–32px, with `--shadow-card` (warm-tinted dual-layer). Borders are 1.5px when present.
4. **Type is Geist** (sans + mono), loaded from Google Fonts. Headings carry slight negative tracking (`-0.01em`, `-0.02em` on hero). Body line-height 1.5–1.65. Reading copy uses `text-balance`.
5. **Imagery is gradient + emoji**, never stock photo. Cover gradients rotate cool / warm / mixed (see `preview/colors-gradients.html`).
6. **Iconography is split by surface.** Mobile uses Ionicons (`@expo/vector-icons`). Web uses native emoji + `→ ✓` glyphs. If the emoji set can't carry meaning on web, substitute Lucide.
7. **No web-design tropes**: no rainbow AI gradients, no neumorphism, no scale-up hovers, no decorative iconography, no filler stats, no stock photography. Hover state on links/icons = `opacity: 0.7`. Animations are 150–200ms ease-out.
8. **Money is USD** (`$7`, `$59`, `$120+`); plan names are `Gratuito`, `Pro`, `Anual`, `Empresarial`.
9. **Em dash with spaces** is the brand connector (`a tu ritmo — en tu idioma`). `→` ends CTAs that go somewhere new. `·` separates supporting copy.

## When you must add something the system doesn't cover

- New color: pick from oklch-harmonious neighbors of the existing palette; never invent a new hue. Document the proposal as a card in `preview/`.
- New copy: check the **Sample copy patterns** section of the README — match cadence and length, don't expand to fill space.
- New icon: web → emoji or Lucide; mobile → Ionicons. Flag the substitution in the file's header.
- New surface (e.g. dark mode): not in the system. Ask before introducing.
