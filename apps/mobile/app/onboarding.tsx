import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { onboardingApi } from "@psico/api-client";
import type {
  OnboardingBookRecommendation,
  OnboardingIntro,
  OnboardingMood,
  OnboardingMotivo,
  OnboardingVoicePreference,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Mobile onboarding screen — Sprint S4-front.
 *
 * A single screen with an internal `step` state machine (0 = welcome →
 * 4 = recommendation). Trading native swipe-back-between-steps for
 * implementation simplicity: each step's "Atrás" button decrements the
 * counter; the system back button exits the onboarding (Skip).
 *
 * Network shape mirrors web exactly via @psico/api-client.
 */

type Step = 0 | 1 | 2 | 3 | 4;

const VOICE_OPTIONS: Array<{
  value: OnboardingVoicePreference;
  label: string;
  hint: string;
}> = [
  { value: "marina", label: "Marina", hint: "Voz cálida, ritmo pausado" },
  { value: "tomas", label: "Tomás", hint: "Voz cercana, ritmo natural" },
  { value: "none", label: "Sin voz", hint: "Solo texto, por ahora" },
];

const NAME_REGEX = /^[\p{L}\p{M}'\- ]+$/u;
const MIN_MOTIVOS = 1;
const MAX_MOTIVOS = 5;

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);

  // Catalogs / API state
  const [intro, setIntro] = useState<OnboardingIntro | null>(null);
  const [motivos, setMotivos] = useState<OnboardingMotivo[]>([]);
  const [moods, setMoods] = useState<OnboardingMood[]>([]);
  const [recommendation, setRecommendation] =
    useState<OnboardingBookRecommendation | null>(null);
  const [alternatives, setAlternatives] = useState<
    OnboardingBookRecommendation[]
  >([]);

  // Selections
  const [selectedMotivos, setSelectedMotivos] = useState<Set<string>>(
    new Set(),
  );
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [voice, setVoice] = useState<OnboardingVoicePreference>("marina");
  const [activeRecommendation, setActiveRecommendation] =
    useState<OnboardingBookRecommendation | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step loading ─────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        if (step === 0 && !intro) {
          const data = await onboardingApi.getIntro();
          if (!cancelled) setIntro(data);
        } else if (step === 1 && motivos.length === 0) {
          const { motivos: list } = await onboardingApi.getMotivos();
          if (!cancelled) setMotivos(list);
        } else if (step === 2 && moods.length === 0) {
          const { moods: list } = await onboardingApi.getMoods();
          if (!cancelled) setMoods(list);
        } else if (step === 4 && !recommendation) {
          const data = await onboardingApi.getRecommendation();
          if (!cancelled) {
            setRecommendation(data.recommendation);
            setActiveRecommendation(data.recommendation);
            setAlternatives(data.alternatives);
          }
        }
      } catch {
        if (!cancelled) setError("No pudimos cargar la pantalla. Reintenta.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  // ── Action handlers ──────────────────────────────────────────────────

  async function handleSkip() {
    try {
      setSubmitting(true);
      await onboardingApi.skip();
      router.replace("/(tabs)" as never);
    } catch {
      setSubmitting(false);
      setError("No pudimos saltar el onboarding. Reintenta.");
    }
  }

  async function handleStep1() {
    if (selectedMotivos.size < MIN_MOTIVOS) {
      setError("Elige al menos uno.");
      return;
    }
    try {
      setSubmitting(true);
      await onboardingApi.saveStep1({
        motivosIds: Array.from(selectedMotivos),
      });
      setStep(2);
      setError(null);
    } catch {
      setError("No pudimos guardar. Reintenta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep2() {
    if (!selectedMood) {
      setError("Elige cómo te sientes.");
      return;
    }
    try {
      setSubmitting(true);
      await onboardingApi.saveStep2({ moodId: selectedMood });
      setStep(3);
      setError(null);
    } catch {
      setError("No pudimos guardar. Reintenta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep3() {
    const trimmed = firstName.trim();
    if (trimmed.length < 2 || trimmed.length > 40) {
      setError("Tu nombre debe tener entre 2 y 40 letras.");
      return;
    }
    if (!NAME_REGEX.test(trimmed)) {
      setError("Sin emojis ni símbolos especiales.");
      return;
    }
    try {
      setSubmitting(true);
      await onboardingApi.saveStep3({
        firstName: trimmed,
        voicePreference: voice,
      });
      setStep(4);
      setError(null);
    } catch {
      setError("No pudimos guardar. Reintenta.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(book: OnboardingBookRecommendation | null) {
    try {
      setSubmitting(true);
      const res = await onboardingApi.complete({
        chosenBookId: book?.bookId ?? null,
      });
      // Backend may suggest /books/:slug or /dashboard. We map to mobile routes.
      if (book) {
        router.replace(`/books/${book.bookId}` as never);
      } else {
        router.replace("/(tabs)" as never);
      }
      // res.redirectTo is intentionally unused here — we route by intent
      // rather than echoing whatever string the backend hands us. The
      // backend value still drives the web flow.
      void res;
    } catch {
      setError("No pudimos completar. Reintenta.");
      setSubmitting(false);
    }
  }

  // ── Render per step ──────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress dots */}
        <View style={styles.progressRow}>
          {[0, 1, 2, 3, 4].map((i) => {
            const filled = i <= step;
            return (
              <View
                key={i}
                style={[styles.progressDot, filled && styles.progressDotFilled]}
              />
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={Colors.lavender[500]} />
          </View>
        ) : (
          <>
            {step === 0 && intro ? (
              <WelcomeStep intro={intro} onNext={() => setStep(1)} />
            ) : null}
            {step === 1 ? (
              <MotivosStep
                motivos={motivos}
                selected={selectedMotivos}
                onToggle={(id) => {
                  setSelectedMotivos((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else if (next.size < MAX_MOTIVOS) next.add(id);
                    return next;
                  });
                }}
              />
            ) : null}
            {step === 2 ? (
              <MoodStep
                moods={moods}
                selected={selectedMood}
                onSelect={setSelectedMood}
              />
            ) : null}
            {step === 3 ? (
              <ProfileStep
                firstName={firstName}
                onChangeName={setFirstName}
                voice={voice}
                onSelectVoice={setVoice}
              />
            ) : null}
            {step === 4 && activeRecommendation ? (
              <RecommendationStep
                primary={activeRecommendation}
                alternatives={[recommendation!, ...alternatives]}
                onSwap={setActiveRecommendation}
              />
            ) : null}
          </>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Footer actions */}
        <View style={styles.footer}>
          {step === 4 && activeRecommendation ? (
            <View style={{ gap: Spacing.sm }}>
              <Pressable
                onPress={() => handleComplete(activeRecommendation)}
                disabled={submitting}
                style={[styles.primaryButton, submitting && { opacity: 0.5 }]}
              >
                <Text style={styles.primaryButtonText}>
                  Empezar a leer "{activeRecommendation.title}"
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleComplete(null)}
                disabled={submitting}
              >
                <Text style={styles.secondaryText}>Terminar sin elegir</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footerRow}>
              {step > 0 ? (
                <Pressable
                  onPress={() => setStep((s) => (s - 1) as Step)}
                  disabled={submitting}
                >
                  <Text style={styles.backText}>← Atrás</Text>
                </Pressable>
              ) : (
                <Pressable onPress={handleSkip} disabled={submitting}>
                  <Text style={styles.skipText}>Saltar</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  if (step === 0) setStep(1);
                  else if (step === 1) handleStep1();
                  else if (step === 2) handleStep2();
                  else if (step === 3) handleStep3();
                }}
                disabled={submitting}
                style={[styles.primaryButton, submitting && { opacity: 0.5 }]}
              >
                <Text style={styles.primaryButtonText}>
                  {step === 0
                    ? "Empezar →"
                    : submitting
                      ? "Guardando…"
                      : "Siguiente →"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Step components ────────────────────────────────────────────────────

function WelcomeStep({
  intro,
  onNext,
}: {
  intro: OnboardingIntro;
  onNext: () => void;
}) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.eyebrow}>Bienvenida</Text>
      <Text style={styles.title}>{intro.title}</Text>
      <Text style={styles.subtitle}>{intro.subtitle}</Text>
      <View style={styles.bodyCard}>
        <Text style={styles.bodyText}>{intro.body}</Text>
        <Text style={styles.signature}>{intro.signature}</Text>
      </View>
      <Text style={styles.helperHint}>
        Tarda 60 segundos. Puedes saltarlo cuando quieras.
      </Text>
      {/* onNext used by parent footer; no inline button to avoid duplication */}
      <View
        accessibilityLabel="advance-target"
        accessible={false}
        onLayout={onNext === onNext ? undefined : undefined}
      />
    </View>
  );
}

function MotivosStep({
  motivos,
  selected,
  onToggle,
}: {
  motivos: OnboardingMotivo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.eyebrow}>Paso 1 de 4</Text>
      <Text style={styles.title}>¿Qué te trae aquí?</Text>
      <Text style={styles.helper}>
        Marca lo que resuene. Entre 1 y {MAX_MOTIVOS}.
      </Text>
      <View style={styles.chipGrid}>
        {motivos.map((m) => {
          const active = selected.has(m.id);
          return (
            <Pressable
              key={m.id}
              onPress={() => onToggle(m.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipIcon, active && styles.chipTextActive]}>
                {m.icon}
              </Text>
              <Text style={[styles.chipLabel, active && styles.chipTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.counterText}>
        {selected.size}/{MAX_MOTIVOS} seleccionados
      </Text>
    </View>
  );
}

function MoodStep({
  moods,
  selected,
  onSelect,
}: {
  moods: OnboardingMood[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.eyebrow}>Paso 2 de 4</Text>
      <Text style={styles.title}>¿Cómo te sientes ahora?</Text>
      <Text style={styles.helper}>
        Sin pensarlo mucho. Lo que llega primero suele ser lo cierto.
      </Text>
      <View style={styles.chipGrid}>
        {moods.map((m) => {
          const active = selected === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => onSelect(m.id)}
              style={[styles.moodCard, active && styles.moodCardActive]}
            >
              <View
                style={[styles.moodSwatch, { backgroundColor: m.swatch }]}
              />
              <Text style={[styles.moodLabel, active && styles.chipTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ProfileStep({
  firstName,
  onChangeName,
  voice,
  onSelectVoice,
}: {
  firstName: string;
  onChangeName: (s: string) => void;
  voice: OnboardingVoicePreference;
  onSelectVoice: (v: OnboardingVoicePreference) => void;
}) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.eyebrow}>Paso 3 de 4</Text>
      <Text style={styles.title}>¿Cómo te llamamos?</Text>

      <Text style={styles.fieldLabel}>Tu nombre</Text>
      <TextInput
        value={firstName}
        onChangeText={onChangeName}
        placeholder="Lucía"
        autoComplete="given-name"
        maxLength={40}
        style={styles.nameInput}
      />

      <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
        Voz preferida
      </Text>
      <View style={{ gap: Spacing.sm }}>
        {VOICE_OPTIONS.map((v) => {
          const active = voice === v.value;
          return (
            <Pressable
              key={v.value}
              onPress={() => onSelectVoice(v.value)}
              style={[styles.voiceCard, active && styles.voiceCardActive]}
            >
              <View
                style={[styles.voiceRadio, active && styles.voiceRadioActive]}
              >
                {active ? <View style={styles.voiceRadioDot} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.voiceLabel}>{v.label}</Text>
                <Text style={styles.voiceHint}>{v.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function RecommendationStep({
  primary,
  alternatives,
  onSwap,
}: {
  primary: OnboardingBookRecommendation;
  alternatives: OnboardingBookRecommendation[];
  onSwap: (book: OnboardingBookRecommendation) => void;
}) {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.eyebrow}>Tu primera recomendación</Text>
      <Text style={styles.title}>Te recomiendo empezar por aquí.</Text>

      <View style={styles.recommendationCard}>
        <View
          style={[
            styles.recommendationCover,
            { backgroundColor: coverColorForOnboarding(primary.cover) },
          ]}
        >
          <Text style={styles.recommendationAuthor}>{primary.author}</Text>
        </View>
        <Text style={styles.recommendationTitle}>{primary.title}</Text>
        <Text style={styles.recommendationWhy}>
          <Text style={styles.recommendationWhyLead}>Por qué este libro: </Text>
          {primary.why}
        </Text>
        {primary.chapter1Preview ? (
          <Text style={styles.recommendationPreview}>
            {primary.chapter1Preview}
          </Text>
        ) : null}
      </View>

      {alternatives.length > 0 ? (
        <View style={styles.altsRow}>
          {alternatives.map((alt) => {
            const isActive = alt.bookId === primary.bookId;
            return (
              <Pressable
                key={alt.bookId}
                onPress={() => onSwap(alt)}
                style={[styles.altChip, isActive && styles.altChipActive]}
              >
                <Text
                  style={[
                    styles.altChipText,
                    isActive && styles.chipTextActive,
                  ]}
                >
                  {alt.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function coverColorForOnboarding(
  cover: OnboardingBookRecommendation["cover"],
): string {
  switch (cover) {
    case "cool":
      return Colors.lavender[500];
    case "warm":
      return "#C76A4D";
    case "mixed":
    default:
      return Colors.sage[500];
  }
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.warm[50] },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: Spacing.lg },
  progressDot: {
    height: 4,
    width: 12,
    borderRadius: 4,
    backgroundColor: Colors.warm[200],
  },
  progressDotFilled: { width: 24, backgroundColor: Colors.lavender[500] },
  loading: { paddingVertical: Spacing.xxl, alignItems: "center" },
  stepContent: { gap: Spacing.sm },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: Colors.lavender[600],
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.warm[600],
    marginBottom: Spacing.sm,
  },
  helper: {
    fontSize: 14,
    color: Colors.warm[500],
    marginBottom: Spacing.md,
  },
  helperHint: {
    fontSize: 12,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: Spacing.md,
  },
  bodyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.warm[200],
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
  bodyText: { fontSize: 14, lineHeight: 22, color: Colors.warm[800] },
  signature: {
    fontStyle: "italic",
    fontWeight: "600",
    color: Colors.lavender[600],
    marginTop: Spacing.md,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: Spacing.md,
  },
  chip: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 120,
  },
  chipActive: {
    backgroundColor: Colors.lavender[500],
    borderColor: Colors.lavender[500],
  },
  chipIcon: { fontSize: 18, color: Colors.warm[800] },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.warm[800],
    marginTop: 2,
  },
  chipTextActive: { color: "white" },
  counterText: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: Spacing.md,
    textAlign: "right",
  },
  moodCard: {
    width: "31%",
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: "center",
    gap: 6,
  },
  moodCardActive: {
    backgroundColor: Colors.warm[900],
    borderColor: Colors.warm[900],
  },
  moodSwatch: { height: 28, width: 28, borderRadius: 14 },
  moodLabel: { fontSize: 13, fontWeight: "600", color: Colors.warm[800] },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: Colors.warm[500],
    marginBottom: 6,
  },
  nameInput: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.warm[900],
  },
  voiceCard: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.lg,
  },
  voiceCardActive: {
    backgroundColor: Colors.lavender[50],
    borderColor: Colors.lavender[400],
  },
  voiceRadio: {
    height: 18,
    width: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.warm[400],
    alignItems: "center",
    justifyContent: "center",
  },
  voiceRadioActive: { borderColor: Colors.lavender[500] },
  voiceRadioDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: Colors.lavender[500],
  },
  voiceLabel: { fontSize: 14, fontWeight: "700", color: Colors.warm[900] },
  voiceHint: { fontSize: 12, color: Colors.warm[500], marginTop: 2 },
  recommendationCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    overflow: "hidden",
    marginTop: Spacing.md,
  },
  recommendationCover: {
    height: 140,
    justifyContent: "flex-end",
    padding: Spacing.md,
  },
  recommendationAuthor: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.85)",
  },
  recommendationTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  recommendationWhy: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.warm[700],
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  recommendationWhyLead: { fontWeight: "700", color: Colors.lavender[600] },
  recommendationPreview: {
    fontStyle: "italic",
    fontSize: 12,
    color: Colors.warm[600],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.lavender[300],
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  altsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: Spacing.md,
  },
  altChip: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  altChipActive: {
    backgroundColor: Colors.warm[900],
    borderColor: Colors.warm[900],
  },
  altChipText: { fontSize: 12, fontWeight: "600", color: Colors.warm[700] },
  errorText: {
    color: "#B91C1C",
    fontSize: 12.5,
    marginTop: Spacing.md,
  },
  footer: { marginTop: Spacing.xl },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
  },
  primaryButtonText: { color: "white", fontWeight: "700", fontSize: 14 },
  secondaryText: {
    color: Colors.warm[500],
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  backText: { color: Colors.warm[600], fontSize: 13, fontWeight: "600" },
  skipText: { color: Colors.warm[500], fontSize: 13, fontWeight: "600" },
});
