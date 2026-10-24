/**
 * Qué guarda el servicio de una persona, y qué dice de ello la exportación.
 *
 * ── Por qué hace falta un inventario declarado ────────────────────────────
 *
 * El trinquete anterior recorría `Object.keys(payload)` en las dos
 * direcciones: que la nota nombrase todo lo incluido, y que no declarase
 * ausente nada que viniera. Las dos comprobaciones son buenas y ninguna puede
 * ver lo que falta. Una tabla que la base guarda y el exportador nunca
 * consulta no aparece en el payload, así que no hay clave que iterar y no hay
 * nada que pueda fallar — ni hoy ni cuando alguien añada la siguiente.
 *
 * Y la nota cerraba con una enumeración sin coletilla —«no está incluido …:
 * las respuestas de Eco, el historial de tu ánimo, los check-ins, las
 * resonancias, tus marcas de lectura y los eventos de inicio de sesión»— que
 * se lee como la lista completa. No lo era.
 *
 * Así que la dirección que faltaba se abre contra el ESQUEMA: todo modelo con
 * `userId` tiene que estar clasificado aquí. Añadir uno sin clasificarlo
 * rompe el trinquete, que es el momento exacto en que alguien debe decidir
 * si entra en la exportación, si se nombra como ausente, o ninguna de las
 * dos y por qué.
 *
 * ── Lo que esto NO es ────────────────────────────────────────────────────
 *
 * No es una política de retención, ni una decisión de alcance. El alcance
 * sigue abierto (D-EXP). Es la lista de lo que hay que mirar para decidirlo,
 * y la garantía de que la lista no se queda atrás sin que nadie se entere.
 */

export type ClaseDeDato =
  /** Viaja en el archivo. La nota tiene que nombrarlo entre lo incluido. */
  | "exportado"
  /** No viaja, y la nota lo nombra una por una entre lo que falta. */
  | "nombrado-como-ausente"
  /**
   * No viaja y no se nombra por su nombre: queda cubierto por la frase que
   * dice que el archivo no lo trae todo. Alcance abierto (D-EXP).
   */
  | "pendiente-de-alcance"
  /**
   * No es contenido de la persona: mecánica del servicio —credenciales,
   * tokens, idempotencia, contabilidad interna—. Exportarlo no le diría nada
   * sobre sí misma y en algún caso sería entregarle material sensible.
   */
  | "mecanica-del-servicio";

export interface EntradaDeInventario {
  clase: ClaseDeDato;
  /** Por qué está en esa clase. Una línea; la lee quien revisa, no un test. */
  porque: string;
  /**
   * Para `nombrado-como-ausente`: las palabras EXACTAS con que la nota lo
   * nombra. El trinquete las busca en la parte de la nota que habla de lo
   * que no viene, así que renombrarlas en un sitio y no en el otro falla.
   */
  frase?: string;
}

export const EXPORT_INVENTORY: Record<string, EntradaDeInventario> = {
  // ── Lo que el archivo trae ───────────────────────────────────────────────
  Profile: { clase: "exportado", porque: "perfil" },
  UserPreferences: { clase: "exportado", porque: "preferencias" },
  ReaderPreferences: { clase: "exportado", porque: "ajustes del lector" },
  NotificationSettings: { clase: "exportado", porque: "ajustes de avisos" },
  PrivacySettings: { clase: "exportado", porque: "ajustes de privacidad" },
  UserProgress: { clase: "exportado", porque: "progreso de lectura" },
  Subscription: { clase: "exportado", porque: "suscripción" },
  GuideSession: { clase: "exportado", porque: "sesiones de guía" },

  // ── Lo que la nota nombra como ausente, una por una ──────────────────────
  DiaryEntry: {
    clase: "nombrado-como-ausente",
    porque: "cifrado de extremo a extremo; ni siquiera podría leerse",
    frase: "tu diario",
  },
  EcoThread: {
    clase: "nombrado-como-ausente",
    porque: "los mensajes propios van cifrados; el hilo los acompaña",
    frase: "los mensajes que tú escribiste a eco",
  },
  MoodLog: {
    clase: "nombrado-como-ausente",
    porque: "historial del ánimo",
    frase: "el historial de tu ánimo",
  },
  CheckinResponse: {
    clase: "nombrado-como-ausente",
    porque: "check-ins",
    frase: "los check-ins",
  },
  Resonance: {
    clase: "nombrado-como-ausente",
    porque: "resonancias",
    frase: "las resonancias",
  },
  Highlight: {
    clase: "nombrado-como-ausente",
    porque: "marcas de lectura",
    frase: "tus marcas y notas de lectura",
  },
  Annotation: {
    clase: "nombrado-como-ausente",
    porque: "notas del lector",
    frase: "tus marcas y notas de lectura",
  },
  AuthEvent: {
    clase: "nombrado-como-ausente",
    porque: "eventos de inicio de sesión",
    frase: "los eventos de inicio de sesión",
  },

  // ── Guardado, no exportado, no nombrado por su nombre (D-EXP) ────────────
  BookReview: { clase: "pendiente-de-alcance", porque: "reseñas que escribió" },
  BookFavorite: { clase: "pendiente-de-alcance", porque: "favoritos" },
  BookBookmark: { clase: "pendiente-de-alcance", porque: "marcadores" },
  ReadingSession: {
    clase: "pendiente-de-alcance",
    porque: "posición y tiempo de lectura",
  },
  OnboardingState: {
    clase: "pendiente-de-alcance",
    porque: "respuestas del alta",
  },
  WeeklySummary: {
    clase: "pendiente-de-alcance",
    porque: "prosa que el servicio escribió sobre ella",
  },
  EmotionalMapSnapshot: {
    clase: "pendiente-de-alcance",
    porque: "cobertura del mapa a lo largo del tiempo",
  },
  DiaryTextFeature: {
    clase: "pendiente-de-alcance",
    porque: "números derivados del texto, con su consentimiento",
  },
  VoiceTranscription: {
    clase: "pendiente-de-alcance",
    porque: "metadatos de dictado; el audio nunca se guarda",
  },
  Conversation: { clase: "pendiente-de-alcance", porque: "chat de IA anterior" },
  LearningEvent: {
    clase: "pendiente-de-alcance",
    porque: "qué abrió y completó",
  },
  CircleMember: {
    clase: "pendiente-de-alcance",
    porque: "pertenencia a un círculo",
  },
  UserAchievement: { clase: "pendiente-de-alcance", porque: "logros" },
  DismissedReflectionPrompt: {
    clase: "pendiente-de-alcance",
    porque: "qué invitaciones descartó",
  },
  EcoMessageReport: {
    clase: "pendiente-de-alcance",
    porque: "reportes que envió sobre respuestas de Eco",
  },
  SharedDiaryEntry: {
    clase: "pendiente-de-alcance",
    porque: "lo que compartió con terapia, cifrado para quien lo recibe",
  },
  CrisisLog: {
    clase: "pendiente-de-alcance",
    porque: "registro de crisis; su manejo tiene criterios propios",
  },
  Therapist: { clase: "pendiente-de-alcance", porque: "ficha profesional" },
  TherapistFavorite: {
    clase: "pendiente-de-alcance",
    porque: "terapeutas marcados",
  },
  TherapistReview: {
    clase: "pendiente-de-alcance",
    porque: "reseñas de terapeutas",
  },
  TherapySession: { clase: "pendiente-de-alcance", porque: "sesiones" },
  TherapyPrescription: { clase: "pendiente-de-alcance", porque: "recetas" },
  TherapyNotification: { clase: "pendiente-de-alcance", porque: "avisos" },
  TherapyTechnicalReport: {
    clase: "pendiente-de-alcance",
    porque: "informes técnicos",
  },
  DataExportRequest: {
    clase: "pendiente-de-alcance",
    porque: "sus propias peticiones de exportación",
  },

  // ── Mecánica del servicio ────────────────────────────────────────────────
  RefreshToken: { clase: "mecanica-del-servicio", porque: "credencial viva" },
  PasswordResetToken: {
    clase: "mecanica-del-servicio",
    porque: "credencial de un solo uso",
  },
  EmailVerificationToken: {
    clase: "mecanica-del-servicio",
    porque: "credencial de un solo uso",
  },
  EmailChangeRequest: {
    clase: "mecanica-del-servicio",
    porque: "trámite en curso, con su propio token",
  },
  DeviceToken: {
    clase: "mecanica-del-servicio",
    porque: "dirección de entrega de avisos",
  },
  LiveActivityToken: {
    clase: "mecanica-del-servicio",
    porque: "dirección de entrega de avisos",
  },
  GuideCommandReceipt: {
    clase: "mecanica-del-servicio",
    porque: "idempotencia de comandos",
  },
  BillingUsageDay: {
    clase: "mecanica-del-servicio",
    porque: "contabilidad agregada de uso",
  },
};
