/**
 * The therapist catalog pass, in its own module.
 *
 * Not in `seed.ts` because `seed.ts` INVOKES the seed at module scope — importing
 * it from a test would run `dotenv/config`, build a client and seed whatever
 * `DATABASE_URL` happened to point at. `seed-guard.spec.ts` already carries that
 * warning about `seed-test.ts`; this is the same hazard, so the testable part
 * lives where importing it is inert.
 */

/**
 * Exactly the surface `seedTherapists` is allowed to touch.
 *
 * Narrowed on purpose rather than taking `PrismaClient`. It is the type-level
 * half of the rule the spec enforces at runtime: there is no `delete` or
 * `deleteMany` in here, so restoring the destructive version of the availability
 * pass does not merely fail a test — it fails to compile.
 */
export interface TherapistSeedClient {
  therapist: {
    upsert(args: unknown): Promise<unknown>;
  };
  therapistAvailability: {
    count(args: { where: { therapistId: string } }): Promise<number>;
    create(args: {
      data: {
        therapistId: string;
        dayOfWeek: number;
        startMin: number;
        endMin: number;
        timezone: string;
      };
    }): Promise<unknown>;
  };
}

/**
 * Therapists and their weekly availability.
 *
 * Extracted from `main()` so the preservation rule below can be OBSERVED rather
 * than asserted in prose: `therapist-availability.spec.ts` runs this against a
 * recording client and fails if a delete ever reappears. The destructive version
 * it replaced passed review precisely because nothing watched the call sequence.
 *
 * Takes the client as a parameter for the same reason — the test needs to hand
 * it a fake, and a module-level `prisma` would have forced a connection.
 */
export async function seedTherapists(
  prisma: TherapistSeedClient,
): Promise<void> {
  const therapists = [
    {
      id: "t_marina",
      name: "Marina Quintana",
      initials: "MQ",
      title: "Psicóloga clínica · Senior Eco",
      licenseNumber: "PSI-EC-2031",
      licenseVerified: true,
      coverToken: "warm",
      bioShort:
        "Acompaño procesos de ansiedad, duelo y reconfiguración de identidad después de cambios grandes.",
      bioLong:
        "Soy psicóloga clínica formada en la PUCE con maestría en psicoanálisis. Trabajo desde un enfoque integrador con foco en lo somático y en la narrativa.",
      approach: "Integrativo · somático · narrativo",
      specialties: ["ansiedad", "duelo", "identidad"],
      modalities: ["INDIVIDUAL", "COUPLE"] as (
        | "INDIVIDUAL"
        | "COUPLE"
        | "FAMILY"
      )[],
      languages: ["es-EC"],
      genderId: "femenino",
      priceUsd: 45,
      acceptsInsurance: false,
      avgRating: 4.8,
      reviewsCount: 47,
      popularity: 100,
      firstSessionPolicy: "Primera sesión sin cargo si decides no continuar.",
      cancellationPolicy: "Hasta 24h antes sin costo.",
    },
    {
      id: "t_andrea",
      name: "Andrea Ortiz",
      initials: "AO",
      title: "Psicóloga · Pareja y familia",
      licenseNumber: "PSI-EC-1885",
      licenseVerified: true,
      coverToken: "lavender",
      bioShort:
        "Especializada en terapia de pareja y vínculos familiares. Trabajo desde el enfoque sistémico.",
      bioLong:
        "Soy psicóloga sistémica con 12 años de experiencia. Acompaño a parejas y familias en procesos de reconciliación, redefinición de roles y crisis.",
      approach: "Sistémico · centrado en soluciones",
      specialties: ["pareja", "familia", "comunicación"],
      modalities: ["COUPLE", "FAMILY"] as (
        | "INDIVIDUAL"
        | "COUPLE"
        | "FAMILY"
      )[],
      languages: ["es-EC"],
      genderId: "femenino",
      priceUsd: 55,
      acceptsInsurance: true,
      avgRating: 4.6,
      reviewsCount: 31,
      popularity: 80,
      firstSessionPolicy:
        "Primera sesión: anamnesis + co-construcción de objetivos.",
      cancellationPolicy: "Hasta 48h antes sin costo.",
    },
    {
      id: "t_diego",
      name: "Diego Velasco",
      initials: "DV",
      title: "Psicólogo · Adultos jóvenes",
      licenseNumber: "PSI-EC-2104",
      licenseVerified: true,
      coverToken: "mixed",
      bioShort:
        "Trabajo con jóvenes adultos en transiciones de carrera, vínculos y proyectos de vida.",
      bioLong:
        "Psicólogo formado en la UCE con especialidad en TCC. Mi foco son las transiciones de los 20–35 años.",
      approach: "Terapia cognitivo-conductual · TCC",
      specialties: ["ansiedad", "vocacional", "proyecto-de-vida"],
      modalities: ["INDIVIDUAL"] as ("INDIVIDUAL" | "COUPLE" | "FAMILY")[],
      languages: ["es-EC", "en"],
      genderId: "masculino",
      priceUsd: 35,
      acceptsInsurance: false,
      avgRating: 4.5,
      reviewsCount: 19,
      popularity: 70,
      firstSessionPolicy:
        "Primera sesión enfocada en establecer foco terapéutico.",
      cancellationPolicy: "Hasta 24h antes sin costo.",
    },
    {
      id: "t_lucia",
      name: "Lucía Pérez",
      initials: "LP",
      title: "Psicóloga · Trauma y abuso",
      licenseNumber: "PSI-EC-1992",
      licenseVerified: true,
      coverToken: "cool",
      bioShort:
        "Especialista en trauma complejo y supervivientes de abuso. Enfoque seguro y a tu ritmo.",
      bioLong:
        "Psicóloga formada en EMDR e ISST-D. Acompaño procesos de elaboración de trauma con técnicas validadas y a tu ritmo.",
      approach: "EMDR · trauma-focused CBT",
      specialties: ["trauma", "duelo", "abuso", "TEPT"],
      modalities: ["INDIVIDUAL"] as ("INDIVIDUAL" | "COUPLE" | "FAMILY")[],
      languages: ["es-EC"],
      genderId: "femenino",
      priceUsd: 60,
      acceptsInsurance: true,
      avgRating: 4.9,
      reviewsCount: 64,
      popularity: 95,
      firstSessionPolicy: "Sesión 0 gratuita para evaluar fit y seguridad.",
      cancellationPolicy: "Hasta 72h antes sin costo.",
    },
    {
      id: "t_eduardo",
      name: "Eduardo Salinas",
      initials: "ES",
      title: "Psicólogo · Adicciones",
      licenseNumber: "PSI-EC-1721",
      licenseVerified: true,
      coverToken: "warm",
      bioShort:
        "20 años trabajando en adicciones químicas y conductuales. Enfoque cognitivo-conductual y mindfulness.",
      bioLong:
        "Psicólogo formado en Argentina, especializado en adicciones. Trabajé en CRA Quito durante 12 años.",
      approach: "TCC + mindfulness · 12 pasos cuando aplica",
      specialties: ["adicciones", "ansiedad", "depresión"],
      modalities: ["INDIVIDUAL", "FAMILY"] as (
        | "INDIVIDUAL"
        | "COUPLE"
        | "FAMILY"
      )[],
      languages: ["es-EC"],
      genderId: "masculino",
      priceUsd: 50,
      acceptsInsurance: true,
      avgRating: 4.7,
      reviewsCount: 38,
      popularity: 85,
      firstSessionPolicy: "Evaluación inicial: motivacional + sistémica.",
      cancellationPolicy: "Hasta 48h antes sin costo.",
    },
    {
      id: "t_camila",
      name: "Camila Torres",
      initials: "CT",
      title: "Psicóloga · Adolescentes y juventud",
      licenseNumber: "PSI-EC-2240",
      licenseVerified: true,
      coverToken: "lavender",
      bioShort:
        "Trabajo con adolescentes y jóvenes en temas de identidad, ansiedad social, autoestima y bullying.",
      bioLong:
        "Magíster en psicología infantojuvenil. 8 años de experiencia en consultorio + colegios.",
      approach: "Terapia narrativa + arte-terapia",
      specialties: [
        "adolescentes",
        "autoestima",
        "ansiedad-social",
        "bullying",
      ],
      modalities: ["INDIVIDUAL", "FAMILY"] as (
        | "INDIVIDUAL"
        | "COUPLE"
        | "FAMILY"
      )[],
      languages: ["es-EC", "en"],
      genderId: "femenino",
      priceUsd: 40,
      acceptsInsurance: false,
      avgRating: 4.7,
      reviewsCount: 25,
      popularity: 75,
      firstSessionPolicy:
        "Primera sesión con padres + adolescente para alinear objetivos.",
      cancellationPolicy: "Hasta 24h antes sin costo.",
    },
  ];

  let seededSchedules = 0;
  let preservedSchedules = 0;

  for (const t of therapists) {
    await prisma.therapist.upsert({
      where: { id: t.id },
      create: {
        ...t,
        isActive: true,
        currency: "USD",
      },
      update: {
        ...t,
        isActive: true,
        currency: "USD",
      },
    });

    // Default weekly availability — Mon/Wed/Fri 09:00–13:00 + 15:00–19:00
    // Tue/Thu 14:00–19:00. Tunable per therapist later via ops UI.
    const defaultSlots = [
      { dayOfWeek: 1, startMin: 540, endMin: 780 },
      { dayOfWeek: 1, startMin: 900, endMin: 1140 },
      { dayOfWeek: 3, startMin: 540, endMin: 780 },
      { dayOfWeek: 3, startMin: 900, endMin: 1140 },
      { dayOfWeek: 5, startMin: 540, endMin: 780 },
      { dayOfWeek: 5, startMin: 900, endMin: 1140 },
      { dayOfWeek: 2, startMin: 840, endMin: 1140 },
      { dayOfWeek: 4, startMin: 840, endMin: 1140 },
    ];
    // ── An existing schedule owns itself ─────────────────────────────────
    //
    // This used to `deleteMany({ therapistId })` and reinsert the canonical
    // eight slots, in the name of idempotence. It is idempotent against the
    // constants above and destructive against everything else: the comment four
    // lines up says availability is "tunable per therapist via ops UI", so the
    // rerun discarded exactly the thing ops is expected to change. Stable row
    // counts across two runs hid it, because the counts are stable whether the
    // rows are preserved or replaced.
    //
    // Same principle as the ChapterBlock pass further down: content and
    // operational state that already exist own themselves, and the seed fills
    // gaps rather than asserting a shape.
    //
    // A PARTIAL schedule (1..7 rows) is also preserved, deliberately. There is
    // no metadata that distinguishes "an interrupted seed" from "ops deleted the
    // Friday afternoon slot", and guessing wrong in the completing direction
    // silently reinstates a slot somebody removed on purpose. Repairing a
    // genuinely broken schedule is a separate, explicit administrative
    // operation — not a side effect of running the seed.
    const existingSlots = await prisma.therapistAvailability.count({
      where: { therapistId: t.id },
    });

    if (existingSlots > 0) {
      preservedSchedules += 1;
      // The therapist's name, not a row or an id: enough for an operator to see
      // which schedules were left alone.
      console.log(
        `   ↩︎ TherapistAvailability ${t.name}: existing operational schedule preserved (${existingSlots} slot(s))`,
      );
      continue;
    }

    for (const s of defaultSlots) {
      await prisma.therapistAvailability.create({
        data: {
          therapistId: t.id,
          dayOfWeek: s.dayOfWeek,
          startMin: s.startMin,
          endMin: s.endMin,
          timezone: "America/Guayaquil",
        },
      });
    }
    seededSchedules += 1;
  }
  console.log(
    `✅  Therapists: ${therapists.length} terapeutas · ${seededSchedules} schedule(s) seeded · ${preservedSchedules} preserved`,
  );
}
