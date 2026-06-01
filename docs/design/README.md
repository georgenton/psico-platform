# Psico Platform — Design System

A psychoeducation SaaS for Ecuador and LATAM. Books, audios, ejercicios prácticos and a future AI companion grounded in evidence-based psychology — written by psychologists, for Spanish-speaking users learning to understand themselves.

The platform is freemium → Pro $7/mo → Annual $59 → B2B $120+/mo. Two anchor books today: _Emociones en Construcción_ and _Familias Ensambladas_.

## Surfaces

| Product                               | Tech                                        | Role                                        |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| **Marketing site** (apps/web → `/`)   | Next.js 14 App Router · Tailwind v4 · Geist | Landing, pricing, libros, registration      |
| **Web app** (apps/web → `/dashboard`) | Next.js 14 + server actions                 | Logged-in surface: biblioteca, plan, perfil |
| **Mobile** (apps/mobile)              | React Native + Expo + Ionicons              | iOS/Android — same flows, native idioms     |

Backend (`apps/api`) is NestJS + Prisma + Postgres + Redis with Stripe, Claude API, Resend, Posthog. The brand surface is whatever the user opens — keep marketing and product visually unified.

## Sources

Everything in this design system was extracted from a single source repo. Treat that repo as canonical when in doubt.

- **GitHub:** [`georgenton/psico-platform`](https://github.com/georgenton/psico-platform) (default branch `main`)
- **Tokens of record:** `apps/web/src/app/globals.css` (Tailwind v4 `@theme`) and `apps/mobile/src/theme.ts` (mirrors the web exactly).
- **Web components imported:** `apps/web/src/app/page.tsx`, `apps/web/src/components/landing/*`, `apps/web/src/app/dashboard/*`, `apps/web/src/app/(auth)/*`.
- **Mobile components imported:** `apps/mobile/app/(tabs)/*`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/theme.ts`.
- **Architectural notes:** repo `CLAUDE.md` (mentor/business context).

A snapshot of the imported files lives under `apps/web/`, `apps/mobile/`, and `packages/ui/` in this project for offline reference.

---

## Quick index

| Path                                | What's there                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| `README.md`                         | This file — overview, content/visual/iconography guidance            |
| `SKILL.md`                          | Skill manifest the agent loads when this DS is referenced            |
| `colors_and_type.css`               | Every token (color, type, spacing, radius, shadow) as CSS vars       |
| `assets/README.md`                  | Wordmark + imagery policy (no logo SVG ships with the brand)         |
| `preview/`                          | Design-system review cards — one HTML per token group                |
| `ui_kits/web/Web UI kit.html`       | Marketing surface + dashboard parity demo                            |
| `ui_kits/mobile/Mobile UI kit.html` | 4 core screens in iPhone frames (Inicio · Libros · Mi Plan · Perfil) |
| `apps/`                             | Unmodified GitHub import — `apps/web/`, `apps/mobile/`, `apps/api/`  |
| `packages/`                         | Unmodified GitHub import — `packages/ui/`, `packages/types/`         |

> **No `slides/` directory.** The source repo has no deck template, and the user did not supply one. If a future deck is needed, build it on `deck_stage.js` using the warm-50 page background, lavender-700 wordmark, and the Geist type scale defined in `preview/type-*.html`.

---

## CONTENT FUNDAMENTALS

The product speaks **Spanish** — specifically a calm, neutral, _latinoamericano_ register that lands the same in Quito, Bogotá or CDMX. Every public string is in Spanish; English appears only in code comments and ADRs (per repo convention: _"All code comments written in English"_).

### Voice

- **Warm, grounded, first-person-singular ("tú")**. Never "usted", never "vosotros". Examples in the wild: _"Aprende a entenderte."_ / _"Continúa tu camino al bienestar emocional"_ / _"Hola, {name} 👋"_.
- **Hopeful, never clinical**. The product positions itself against jargon: _"Sin jerga técnica, sin listas de espera, sin complicaciones."_ If a sentence sounds like it belongs in a therapist's intake form, rewrite it.
- **Permission-giving**. _"a tu ritmo"_, _"cuando y donde puedas"_, _"Crece cuando estés listo."_ Time and pace belong to the user.
- **Plain words over precise ones**. "Bienestar emocional" over "salud mental"; "psicoeducación" only where it earns the space.
- **Brief**. Hero copy is one short imperative + one promise. Pricing descriptions are a single line. Empty states get one sentence.

### Tone-of-voice scale (use as a check)

| Dimension                     | Where we land                         |
| ----------------------------- | ------------------------------------- |
| Formal ↔ Casual               | **Mostly casual**, never slangy       |
| Serious ↔ Playful             | **Warm-serious**, sparing cheer       |
| Distant ↔ Intimate            | **Intimate** ("Hola, Ana 👋")         |
| Promotional ↔ Educational     | **Educational** with a confident CTA  |
| Authoritative ↔ Companionable | **Companionable** — guide, not expert |

### Casing

- **Sentence case for everything**: titles, buttons, badges, nav. _"Empieza gratis"_, not _"Empieza Gratis"_.
- **Brand mark** is two-word title case: **Psico Platform**. Never lowercase the wordmark.
- **Plan names** are title-case nouns: _Gratuito_, _Pro_, _Anual_, _Empresarial_.
- **Section labels** in tiny uppercase tracking (e.g. profile group headings, "Paso 01") — only at micro scale, never as a full heading.

### Punctuation & glyphs

- **Em dash with spaces** is the brand's connective tissue: _"a tu ritmo — en tu idioma"_, _"$7/mes — y accede a todo"_. Use it where English copy might use a colon.
- **`→` (rightward arrow)** at the end of CTAs that lead somewhere new: _"Empieza gratis →"_, _"Cómo funciona"_ (no arrow if the link is in-page anchor).
- **`·` (middle dot)** as a soft separator in supporting copy: _"Sin tarjeta de crédito · Cancela cuando quieras"_, _"© 2026 Psico Platform · Ecuador y LATAM"_.
- **Spanish typography**: `¿…?` and `¡…!` always; never US-style decimals — prices use `$7`, `$59`, `$120+`.
- Money is always shown as **USD** and labelled (`$7 USD/mes`, `$59 USD/año`) on mobile checkout buttons; on web pricing cards the unit can be implicit (`/mes`, `/año`).

### Emoji usage (deliberate, not decorative)

Emoji are part of the brand and appear in **two specific places**:

1. **Hero/section badges** — a single sparkle to soften an authoritative line. Example: _"✨ Psicología accesible para Ecuador y LATAM"_.
2. **Personal greetings & step illustrators** — `👋` on dashboard greeting, `📚 🎧 🌱` for the three landing-page steps, `📖` as fallback book cover, `🔒` for locked content, `✓` (or `✅`) for plan features, `🏠 📚 💳 👤` as web-sidebar nav glyphs (mobile uses Ionicons instead).

**Don't** sprinkle emoji into body paragraphs or as bullet decoration. **Don't** invent new ones — stick to the set above.

### Sample copy patterns

- **Hero pattern**: imperative + outcome. _"Aprende a entenderte. **Transforma tu vida.**"_ (second clause coloured lavender-600).
- **CTA pair**: primary action (sage button) + secondary in-page (`btn-outline-lavender`). _"Empieza gratis →"_ / _"Cómo funciona"_.
- **Reassurance line under CTAs**: muted warm-400, micro-copy. _"Sin tarjeta de crédito · Cancela cuando quieras"_.
- **Dashboard greeting**: `Hola, {firstName} 👋` then `Continúa tu camino al bienestar emocional`.
- **Locked content**: `Desbloquear con Pro →` (web) / `Requiere plan Pro` (mobile).
- **Empty state**: one sentence, muted. _"No hay libros disponibles por el momento."_
- **Error**: `text-red`-tinted card, full sentence. _"Las contraseñas no coinciden."_

---

## VISUAL FOUNDATIONS

The aesthetic reads as **calm, soft-modern, slightly clinical-but-warm** — somewhere between a Headspace-era wellness app and a thoughtful European reading product. The sole non-negotiable mood is _unrushed_.

### Colors

Three palettes do all the work. Avoid hand-mixed colors.

- **Lavender** (primary) — identity, headings of authority, primary surfaces, links. The 500/600 are workhorses; 100/50 are background tints; 800/900 are text-on-light-tints / deep gradient stops.
- **Sage** (action) — _every_ primary CTA is sage-400. Pressed state is sage-500. Soft sage-100/200 are used as success/positive checkmarks and "Más popular" badges over lavender cards.
- **Warm** (neutrals) — paper-like off-whites and warm browns. `warm-50` is the page background, `warm-700/800` carries body and headings. There is no pure black anywhere; near-black is `#2a2420`.

Splits-of-roles to remember: brand = lavender, action = sage, surface = warm. **Never** use lavender for a CTA button — it's a soft button (`btn-soft`) or a link.

### Type

- **Geist Sans** (Vercel) is the only display + body face, weights 400/500/600/700. Mono is **Geist Mono**.
- Headings get a subtle negative tracking (`-0.01em` general, `-0.02em` on hero) to feel less webby.
- Body line-height is **1.5–1.65**. Reading copy on the landing page uses `text-balance` to avoid orphans.
- A whitespace-rich rhythm: 32–96px between sections, never tighter; dashboards use 24px.
- Quiet hierarchy: hero is the only page with text >36px. Dashboard titles are 24px. Card titles are 18–20px. Labels are 12px.

### Spacing & layout

- Mobile uses an explicit **xs 4 / sm 8 / md 16 / lg 24 / xl 32 / xxl 48** scale (`apps/mobile/src/theme.ts`).
- Web is on Tailwind's default 4px scale, but in practice sticks to multiples of 4 and matches the mobile scale.
- Max content width is **`max-w-6xl`** (~72rem ≈ 1152px) for marketing, **`max-w-5xl`** for dashboard pages.
- Generous side gutters on mobile (16px), 24px on tablet, 24–32px+ on desktop.
- Vertical rhythm of sections is `py-20 sm:py-24` (~80→96px) — the brand reads slow on purpose.

### Surfaces & cards

- Cards are **white** (`bg-surface`) on a warm-50 page, with a 24–32px radius (`--radius-3xl: 32px`) — generous, never pill-shaped, never sharp.
- The default elevation is the dual `--shadow-card` (warm-tinted, two layers — a tight 0/1/4 plus a soft 0/4/24). Lavender-tinted `--shadow-soft` is reserved for the lavender-500 PRO pricing card and book covers.
- **No hairline lines** unless replacing a card on a tinted background — borders are 1.5px `warm-200`. Borders feel substantial, not utilitarian.
- Dashboard "Mi plan" card and "active subscription" card are inset rectangles inside the page surface — same shadow + radius.

### Backgrounds

- The page is **never plain white**. It's `warm-50` (`#fafaf8`) — a paper tone.
- The hero uses a **diagonal lavender → warm gradient** (`145deg, lavender-50 → warm-50 65%`) overlaid with two **soft radial blobs** (lavender-300 top-right, sage-200 bottom-left) at low opacity — that's the only place blobs appear.
- The CTA-end-of-page section uses a **deep brand gradient** (`lavender-600 → lavender-900`) with white text — the only place dark UI appears.
- Mobile "current plan" banner uses solid `lavender-500` with white type.
- **No textures, no patterns, no hand-drawn illustrations, no photography**. Imagery is _placeholder gradients with an emoji_ (`📖`) — meaning every cover/image slot is a candidate for a future real asset.

### Cover gradients (book covers + dashboard tiles)

Three gradients, rotated by index, used everywhere a book cover would go:

1. `lavender-400 → lavender-700` (cool)
2. `sage-400 → sage-700` (warm)
3. `lavender-300 → sage-500` (mixed)

Locked covers receive a 35% black overlay + a 🔒.

### Borders & radii

- **Inputs / buttons / chips**: 12px radius.
- **Soft buttons / pricing CTAs**: 16–20px.
- **Cards / banners / cover tiles**: 24–32px.
- **Avatars / pills / status dots**: full.
- Borders are sparing. When present, **1.5px** is the canonical width — not 1px (too web), not 2px (too clunky).

### Animation

- **Fast and quiet** — `150–200ms` with an ease-out curve (`cubic-bezier(0.2, 0.8, 0.2, 1)`).
- **Hover** on links/icons = `opacity: 0.7` (this is consistent across web). On primary buttons = darker shade (sage-500). On subtle buttons = `opacity: 0.85–0.9`. Never scale-up on hover.
- **Press** on mobile uses the platform default (slight opacity dip from React Native `Pressable`).
- No bouncing, no springs, no parallax. Sticky navbar fades into a glass surface (`backdrop-filter: blur(12px)`) — that's the only "delight" effect.
- Page transitions are Next.js default (instant). Loading uses `ActivityIndicator` (mobile) or a disabled-button "Iniciando sesión…" pattern (web).

### Transparency & blur

- **Glass navbar**: `rgba(250,250,248,0.88)` + `backdrop-filter: blur(12px)`. Used only at the top of the marketing site; the dashboard top bar is solid white.
- **Lock overlay** on book covers: `rgba(0,0,0,0.35)` (web) / `rgba(42,36,32,0.55)` (mobile).
- **Decorative blobs** in hero: 20–30% opacity radial gradients fading to transparent.
- Avoid translucency elsewhere. Cards are opaque.

### State & feedback colors

- **Error**: light red surface `#FEF2F2`, border `#FECACA`, text `#B91C1C`. Mobile destructive: `#e53e3e`.
- **Warning** (e.g. "subscription cancels at period end"): light yellow `#FEF9E7`, border `#FDE68A`, text `#B45309`.
- **Success**: sage palette — `sage-100` surface, `sage-700` text, `sage-500` checkmark. ✓ glyph in lavender-themed cards becomes `sage-200`.

### Layout rules to keep

- **Sticky** elements: marketing navbar (top), mobile tab bar (bottom). Nothing else floats.
- **Sidebar (web dashboard)**: 240px (`w-60`), white, 1px warm-200 right border, full-bleed top-to-bottom. Drawer on mobile.
- **Tabs (mobile)**: 4 tabs — Inicio · Libros · Mi Plan · Perfil — always visible, lavender-500 active, warm-400 inactive.
- **One CTA per region**. The page tells you what to do next; never two equally weighted buttons except hero (primary sage + ghost lavender).

### What to avoid

- Bluish-purple → pink "AI" gradients (we have a deliberate single-hue lavender gradient for end-CTA).
- Drop-shadow-y "neumorphism", glassy cards (only the navbar is glass).
- Sharp corners or 1-pixel borders — feels too SaaS.
- Photography of stock therapy/yoga imagery — the brand is intentionally non-photographic until original art is commissioned.

---

## ICONOGRAPHY

The platform uses **two parallel icon systems**, by surface:

### Mobile — Ionicons (`@expo/vector-icons`)

Every mobile screen uses **Ionicons** at sizes `12 / 14 / 16 / 18 / 20 / 28 / 32`, rendered in lavender-500 (active), warm-400 (inactive) or sage-500 (positive). The set is consistent and small — the same ~20 glyphs do all the work:

| Glyph                                                                                                                          | Used for               |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `home`, `library`, `diamond`, `person`                                                                                         | Tab bar                |
| `arrow-forward`, `chevron-forward`                                                                                             | CTA / row affordance   |
| `lock-closed`                                                                                                                  | Plan-gated content     |
| `checkmark`, `checkmark-circle`                                                                                                | Plan features, success |
| `star`                                                                                                                         | Upgrade banner accent  |
| `mail-outline`, `person-outline`, `shield-checkmark-outline`, `information-circle-outline`, `globe-outline`, `log-out-outline` | Settings rows          |
| `list`                                                                                                                         | Chapter count meta     |

Ionicons style is a **rounded outlined / filled hybrid** (the iOS-leaning subset of Ionicons). Always use the _outlined_ variant for settings rows (`-outline` suffix) and the _filled_ variant for tab bar / state badges.

### Web — Emoji + minimal SVG

The web app **does not import an icon library**. It uses, in this exact order of preference:

1. **Emoji** for navigation, illustration and personality. The full active set:
   - Sidebar/nav: `🏠 📚 💳 👤 🚪`
   - Steps section: `📚 🎧 🌱`
   - Hero badge: `✨`
   - Greetings/identity: `👋 📖 🔒`
   - Plan checkmarks: `✓` (custom glyph, not 🟢 or ✅ — it's a Unicode `U+2713`)
2. **Inline SVG, hand-rolled, stroke-only, 24×24 viewBox** — used twice: the hamburger menu in the dashboard top bar, and the rightward arrow in CTA labels (the latter is just the `→` character, not an SVG). Stroke is 2px, `currentColor`, rounded caps.

There are **no PNG or SVG icon files** in the source repo for web. If you need a glyph the emoji set doesn't cover (e.g. settings cog, search, copy-to-clipboard, calendar), our policy is:

> **Substitute Lucide Icons** ([lucide.dev](https://lucide.dev)) — closest match for stroke weight (2px), corner geometry (rounded), and dimensions (24×24). Load via CDN: `<script src="https://unpkg.com/lucide@latest"></script>` and call `lucide.createIcons()`. Flag the substitution to whoever's reviewing.

We picked Lucide because Ionicons does not ship as a webfont we can drop in cleanly, and the Geist + warm palette aesthetic matches Lucide's stroke weight. **Heroicons (outline)** is an acceptable second choice.

### Logo

There is **no logo SVG** — the brand is a wordmark. _"Psico Platform"_, set in **Geist Sans 700**, color **lavender-700** (`#5e42c0`). Sizes:

- Marketing navbar: `text-xl` / 20px / weight 700
- Dashboard sidebar: `text-lg` / 18px / weight 700
- Auth screen: `text-2xl` / 24px / weight 700, centered

If a brand asset is needed (favicon, social card), commission it. Until then, treat the wordmark as the logo.

### What's _not_ in the system

- No icon font is installed on the web side.
- No raster icons (PNG) anywhere.
- No animated icons.
- No custom illustrations (book covers are gradient + emoji; landing-page steps are emoji-in-rounded-tile).

---

## Substitution log

- **Geist** is loaded in the source via the `geist` npm package (Vercel's font self-host). Here we load via Google Fonts CDN — same family, identical metrics. If you ever need a downstream production install, switch back to `npm i geist`.
- **Lucide** is recommended as the web icon library (none was specified upstream); flag this with the user before shipping production code.

— _Last updated 2026-05-08_
