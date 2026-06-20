# Components inventory

The full markup lives in `../index.html` (single-file prototype). These partials are extracted as reference; each maps to a `<!-- ... -->`-able block in index.html.

| Component              | Purpose                                           | Reused in            |
| ---------------------- | ------------------------------------------------- | -------------------- |
| Sidebar                | Primary nav + comprehension meter                 | All screens          |
| Topbar                 | Search + MoodChip + AmbiencePicker + avatar       | All screens          |
| MoodChip + MoodPopover | Global daily mood control                         | All screens (topbar) |
| AmbiencePicker         | Theme switcher (Calma/Enfoque/Energía/Noche)      | All screens (topbar) |
| MetricCard             | A single reframed metric (reflexiones, insights…) | Inicio               |
| InsightCard            | "Insight del día"                                 | Inicio               |
| MiniRadar              | Mapa Emocional preview (SVG)                      | Inicio               |
| PatternCard            | A detected pattern w/ meter or connection         | Patrones IA          |
| ReflectionEntry        | A diary reflection w/ mood + map contribution     | Reflexiones          |
| TimelineItem           | A transformation milestone                        | Mi Evolución         |
| ExploreCard            | A themed journey                                  | Exploraciones        |
| BookCard               | A book reframed as "vehicle"                      | Biblioteca           |
| EcoChat                | Conversation column + composer                    | Eco                  |
