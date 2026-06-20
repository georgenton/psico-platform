# States

The Dashboard screens are static hi-fi. Stateful behaviours and where they live:

- **default / hover / active** — every `.nav-item`, `.chip`, `.btn`, `.mood`, `.amb-opt` has hover + on/active styles in styles.css.
- **mood: empty vs registered** — `#moodChip` shows "¿Cómo estás?" until set, then "Hoy: <mood>"; the big Inicio check-in collapses once registered.
- **ambience themes** — `body.amb-{calma|enfoque|energia|noche}` re-skins everything (tokens + font). Persisted in localStorage "psico-amb".
- **empty / loading / error** — fully designed in the flagship **Mapa Emocional** screen (separate deliverable `Mapa Emocional.html`): `data-state="initial|building|rich|loading|updating|error"` on `.map-root`. See its spec doc.
