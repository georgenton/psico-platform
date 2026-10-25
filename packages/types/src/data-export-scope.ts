/**
 * Lo que la exportación de datos trae y lo que no, en palabras.
 *
 * ── Por qué existe, y por qué tiene un trinquete ───────────────────────────
 *
 * La verdad técnica vive en `apps/api/src/jobs/processors/data-export-inventory.ts`,
 * que clasifica **todos** los modelos con `userId`. Pero ese archivo habla en
 * nombres de tabla —`DiaryTextFeature`, `CheckinResponse`— y la persona que
 * va a pulsar «pedir mi exportación» no sabe qué son.
 *
 * Esto es la traducción, y la API tiene una prueba que comprueba que las dos
 * listas siguen diciendo lo mismo. Sin ella, añadir un modelo al inventario
 * dejaría esta copia desactualizada en silencio, y el archivo llegaría con
 * menos (o más) de lo que la pantalla prometió.
 *
 * No es una ampliación del alcance: describe el alcance que hay.
 */
export const DATA_EXPORT_SCOPE = {
  /** Lo que viaja dentro del archivo. */
  incluye: [
    "tu perfil",
    "tus preferencias",
    "los ajustes del lector",
    "los ajustes de avisos",
    "los ajustes de privacidad",
    "tu progreso de lectura",
    "tu suscripción",
    "tus sesiones de guía",
  ],
  /**
   * Lo que NO viaja, nombrado una por una.
   *
   * La nota que acompañaba al archivo cerraba con una enumeración sin
   * coletilla y se leía como la lista completa. No lo era: hay más material
   * fuera del archivo que estas categorías, y el alcance sigue abierto
   * (D-EXP). Por eso la última entrada no es una categoría, es el aviso de
   * que la lista no agota lo que queda fuera.
   */
  noIncluye: [
    "tu diario",
    "los mensajes que tú escribiste a Eco",
    "el historial de tu ánimo",
    "los check-ins",
    "las resonancias",
    "tus marcas y notas de lectura",
    "los eventos de inicio de sesión",
    "y algunas cosas más que todavía estamos decidiendo cómo entregarte",
  ],
} as const;
