import type { Metadata } from "next";
import Link from "next/link";
import type { OnboardingIntro } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { skipOnboarding } from "@/actions/onboarding";

export const metadata: Metadata = { title: "Bienvenida" };
export const dynamic = "force-dynamic";

// Fallback rendered when /api/onboarding/intro is unreachable. Kept in sync
// with the canonical copy in `apps/api/src/onboarding/constants.ts` so the
// experience is the same offline vs online.
const FALLBACK: OnboardingIntro = {
  title: "Empecemos.",
  subtitle: "Antes de leer, queremos conocerte un poco.",
  body: "Te haremos tres preguntas cortas para entender qué te trae aquí y cómo te sientes hoy. Con eso vas a recibir una recomendación de por dónde empezar a leer. Si prefieres saltar este paso, puedes hacerlo y explorar a tu ritmo.",
  signature: "— Psico Platform",
  avatarUrl: null,
};

export default async function OnboardingWelcomePage() {
  let intro: OnboardingIntro;
  try {
    intro = await serverFetch<OnboardingIntro>("/onboarding/intro");
  } catch (err) {
    if (isNextThrow(err)) throw err;
    intro = FALLBACK;
  }

  return (
    <OnboardingShell currentStep={0} onSkip={skipOnboarding}>
      <div className="flex flex-1 flex-col justify-center">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          Bienvenida
        </p>
        <h1
          className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          {intro.title}
        </h1>
        <p
          className="mt-3 text-[15px] font-semibold"
          style={{ color: "var(--color-warm-600)" }}
        >
          {intro.subtitle}
        </p>
        <div
          className="mt-6 rounded-3xl border-[1.5px] bg-white p-6 sm:p-8"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <p
            className="whitespace-pre-line text-[14.5px] leading-relaxed"
            style={{ color: "var(--color-warm-800)" }}
          >
            {intro.body}
          </p>
          <p
            className="mt-4 text-[13.5px] font-semibold italic"
            style={{ color: "var(--color-lavender-700)" }}
          >
            {intro.signature}
          </p>
        </div>
      </div>

      <footer className="mt-8 flex flex-col items-stretch gap-3">
        <Link
          href="/onboarding/motivos"
          className="inline-flex items-center justify-center rounded-2xl px-6 py-3.5 text-[14px] font-semibold text-white"
          style={{ background: "var(--color-lavender-500)" }}
        >
          Empezar →
        </Link>
        <p
          className="text-center text-[11.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Tarda 60 segundos. Puedes saltarlo cuando quieras.
        </p>
      </footer>
    </OnboardingShell>
  );
}
