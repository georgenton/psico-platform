/**
 * What a book's units are EDITORIALLY, as opposed to where they sit.
 *
 * `Chapter.order` / `RevisionUnit.order` is a platform ordering key: it says
 * where a unit falls in the reading sequence and nothing else. «Parejas que
 * perduran» puts its front matter at `order = 1`, so its printed chapter 1
 * sits at `order = 2` and every surface that printed the order told the reader
 * a number the book never used — «Capítulo 1 … Capítulo 9» for a book with
 * eight chapters.
 *
 * `lector/chapter-label.ts` settled the presentation rule for that and recorded
 * what was still missing: `EDITORIAL_LABEL_METADATA_PRESENT=false`. This module
 * is that metadata. It is the storage half of the chain that file describes.
 *
 * ── Why a code-owned catalog ───────────────────────────────────────────────
 *
 * The same reason `CHAPTER_CONCEPTS` and `ECO_CHAPTER_PROMPTS` are code-owned:
 * this is editorial data, it is reviewed in a diff, and it needs no migration
 * or write path to change. It also has to be readable by web AND mobile, and
 * both already import this package — so a book's structure needs no endpoint,
 * no transport and no per-surface fetch.
 *
 * ── Opt-in, never imposed ──────────────────────────────────────────────────
 *
 * A book absent from `BOOK_EDITORIAL_STRUCTURES` behaves exactly as before:
 * `bookOutline` returns every unit as an unlabelled chapter row, in order, and
 * `declared` is false. That is deliberate. «Emociones en Construcción» has no
 * introduction yet and one is expected later; nothing here obliges a book to
 * have a dedication, a preface, an introduction, an epilogue or a bibliography,
 * and nothing invents one that the book does not print.
 *
 * ── What it does NOT do ────────────────────────────────────────────────────
 *
 * It does not touch canonical text. A section is addressed by the verbatim
 * heading the edition already prints, so declaring structure can never edit,
 * reorder or renumber a single block. If a heading here stopped matching the
 * text, the row would simply describe a section the book no longer has — which
 * is why the headings below were each measured against the published revision
 * before being written down, exactly once.
 */

/** What a unit is in the printed edition. */
export type EditorialUnitRole = "FRONT_MATTER" | "CHAPTER" | "BACK_MATTER";

/**
 * A named section that lives INSIDE a unit.
 *
 * Front matter and back matter do not always get a unit of their own. In
 * «Parejas que perduran» the dedication, preface and introduction share one
 * unit, and the epilogue, author pages and bibliography sit at the tail of the
 * last chapter's unit. Splitting the units to match would mean re-ingesting the
 * canonical text — rewriting block identities that highlights and annotations
 * hang off — to fix a labelling problem. So the structure describes them
 * instead.
 */
export interface EditorialSection {
  /** The heading verbatim as the edition prints it. Identity, not display. */
  readonly heading: string;
  /** What the reader sees in navigation. */
  readonly label: string;
  readonly role: "FRONT_MATTER" | "BACK_MATTER";
}

export interface EditorialUnit {
  /** PLATFORM order of the unit — `Chapter.order` / `RevisionUnit.order`. */
  readonly order: number;
  readonly role: EditorialUnitRole;
  /**
   * The number the edition prints for this chapter. Only meaningful for
   * `CHAPTER`, and never derived from `order`: a derived number is a guess
   * that happens to be right for one book.
   */
  readonly number?: number;
  /** Label for a unit that is not a numbered chapter. */
  readonly label?: string;
  /** Named sections inside this unit, in reading order. */
  readonly sections?: readonly EditorialSection[];
}

export interface BookEditorialStructure {
  readonly bookSlug: string;
  /**
   * The edition as the reader should see it named.
   *
   * `Book.subtitle` and `Edition.label` still read «Edición de prueba OCR» in
   * production — true of the OCR edition that was replaced, false of the
   * printed one that is served now, and there is no supported write path for
   * either column on a platform book (the author surface writes `AuthorBook`,
   * a different model). Declaring the visible name here stops the stale value
   * from being shown without inventing a migration or a write endpoint for it.
   */
  readonly editionLabel?: string;
  /**
   * True when the stored `Book.description` is not a description at all.
   *
   * «Parejas que perduran» stores «Edición de prueba OCR · OCR_UNFINALIZED»
   * there: edition metadata for the edition this one replaced, shown to the
   * reader under «Sobre este libro». Declaring it stale keeps it off the page
   * without string-matching «OCR» anywhere, and without hiding a real blurb
   * from any other book. It is per book and defaults to false.
   */
  readonly storedBlurbIsStaleEditionMetadata?: boolean;
  readonly units: readonly EditorialUnit[];
}

/**
 * «Parejas que perduran» — the printed edition, `PQP_PRINTED_v1.0_TEXT_LOCKED`.
 *
 * Nine units, eight chapters. Unit 1 is the front matter; units 2–9 are the
 * printed chapters 1–8; the back matter sits at the tail of unit 9.
 *
 * Every heading below was measured against published revision #10 as present
 * exactly once before it was written here. «Conclusión final: El amor que se
 * construye cada día» is deliberately NOT among them: it is the narrative close
 * of chapter 8 in this edition, not a ninth chapter and not back matter, so it
 * stays inside its chapter where the edition puts it.
 *
 * There is no «Agradecimientos» section in this edition, and none is invented.
 */
const PAREJAS_QUE_PERDURAN: BookEditorialStructure = {
  bookSlug: "parejas-que-perduran",
  editionLabel: "Edición impresa canónica",
  storedBlurbIsStaleEditionMetadata: true,
  units: [
    {
      order: 1,
      role: "FRONT_MATTER",
      label: "Preliminares",
      sections: [
        { heading: "Dedicatoria", label: "Dedicatoria", role: "FRONT_MATTER" },
        { heading: "Prefacio", label: "Prefacio", role: "FRONT_MATTER" },
        // The edition prints the heading with its colon; the label does not
        // need to carry the punctuation into navigation.
        {
          heading: "Introducción:",
          label: "Introducción",
          role: "FRONT_MATTER",
        },
      ],
    },
    { order: 2, role: "CHAPTER", number: 1 },
    { order: 3, role: "CHAPTER", number: 2 },
    { order: 4, role: "CHAPTER", number: 3 },
    { order: 5, role: "CHAPTER", number: 4 },
    { order: 6, role: "CHAPTER", number: 5 },
    { order: 7, role: "CHAPTER", number: 6 },
    { order: 8, role: "CHAPTER", number: 7 },
    {
      order: 9,
      role: "CHAPTER",
      number: 8,
      sections: [
        {
          heading: "Epílogo: Amar es elegir, cada día",
          label: "Epílogo: Amar es elegir, cada día",
          role: "BACK_MATTER",
        },
        {
          heading: "Sobre el autor",
          label: "Sobre el autor",
          role: "BACK_MATTER",
        },
        {
          heading: "Mensaje del autor a los lectores",
          label: "Mensaje del autor a los lectores",
          role: "BACK_MATTER",
        },
        { heading: "Bibliografía", label: "Bibliografía", role: "BACK_MATTER" },
      ],
    },
  ],
};

/** Keyed by `Book.slug`. A book absent from here declares nothing. */
export const BOOK_EDITORIAL_STRUCTURES: Readonly<
  Record<string, BookEditorialStructure>
> = {
  "parejas-que-perduran": PAREJAS_QUE_PERDURAN,
};

export function bookEditorialStructure(
  bookSlug: string,
): BookEditorialStructure | null {
  return BOOK_EDITORIAL_STRUCTURES[bookSlug] ?? null;
}

/** The edition name to show, when the book declares one. */
export function bookEditionLabel(bookSlug: string): string | null {
  return bookEditorialStructure(bookSlug)?.editionLabel ?? null;
}

/**
 * The label for one unit — «Capítulo 3», «Preliminares», or null.
 *
 * Null means "this book says nothing about this unit", and every caller must
 * then fall back to the title alone. It never invents a number from `order`.
 */
export function chapterEditorialLabel(
  bookSlug: string,
  order: number,
): string | null {
  const unit = bookEditorialStructure(bookSlug)?.units.find(
    (u) => u.order === order,
  );
  if (!unit) return null;
  if (unit.role === "CHAPTER") {
    return unit.number == null ? null : `Capítulo ${unit.number}`;
  }
  return unit.label ?? null;
}

/** One navigable row of a book's table of contents. */
export interface BookOutlineEntry<T> {
  /** A whole unit, or a named section inside one. */
  readonly kind: "UNIT" | "SECTION";
  readonly role: EditorialUnitRole;
  /** «Capítulo 3» for numbered chapters; null when the book declares nothing. */
  readonly label: string | null;
  /** The row's main text. */
  readonly title: string;
  /** The chapter row this navigates to — a section opens its containing unit. */
  readonly target: T;
}

export interface BookOutline<T> {
  readonly frontMatter: readonly BookOutlineEntry<T>[];
  readonly chapters: readonly BookOutlineEntry<T>[];
  readonly backMatter: readonly BookOutlineEntry<T>[];
  /** False when the book declares no structure — the legacy flat list. */
  readonly declared: boolean;
}

/**
 * Group a book's units into what the edition actually contains.
 *
 * `chapters` is whatever the detail screen already has: rows carrying at least
 * a platform order (`n`) and a title. The rows themselves are handed back as
 * `target` so navigation keeps using each row's own identity — this function
 * decides how a row is PRESENTED, never where it points.
 *
 * An undeclared book gets every unit back as an unlabelled chapter row, in
 * order, which is exactly the list it had before this module existed.
 */
export function bookOutline<T extends { n: number; title: string }>(
  bookSlug: string,
  chapters: readonly T[],
): BookOutline<T> {
  const structure = bookEditorialStructure(bookSlug);
  if (!structure) {
    return {
      frontMatter: [],
      chapters: chapters.map((c) => ({
        kind: "UNIT" as const,
        role: "CHAPTER" as const,
        label: null,
        title: c.title,
        target: c,
      })),
      backMatter: [],
      declared: false,
    };
  }

  const frontMatter: BookOutlineEntry<T>[] = [];
  const chapterRows: BookOutlineEntry<T>[] = [];
  const backMatter: BookOutlineEntry<T>[] = [];

  for (const row of chapters) {
    const unit = structure.units.find((u) => u.order === row.n);
    // A unit the structure does not mention is still a real unit somebody can
    // read. It keeps its place as an unlabelled chapter row rather than
    // vanishing from the table of contents.
    if (!unit) {
      chapterRows.push({
        kind: "UNIT",
        role: "CHAPTER",
        label: null,
        title: row.title,
        target: row,
      });
      continue;
    }

    if (unit.role === "CHAPTER") {
      chapterRows.push({
        kind: "UNIT",
        role: "CHAPTER",
        label: unit.number == null ? null : `Capítulo ${unit.number}`,
        title: row.title,
        target: row,
      });
    }
    // A FRONT_MATTER / BACK_MATTER unit with named sections is represented BY
    // those sections: listing both the container and its parts would show the
    // preliminaries twice. Without sections it appears once, under its label.
    else if (!unit.sections?.length) {
      const bucket = unit.role === "FRONT_MATTER" ? frontMatter : backMatter;
      bucket.push({
        kind: "UNIT",
        role: unit.role,
        label: null,
        title: unit.label ?? row.title,
        target: row,
      });
    }

    for (const section of unit.sections ?? []) {
      const entry: BookOutlineEntry<T> = {
        kind: "SECTION",
        role: section.role,
        label: null,
        title: section.label,
        target: row,
      };
      if (section.role === "FRONT_MATTER") frontMatter.push(entry);
      else backMatter.push(entry);
    }
  }

  return { frontMatter, chapters: chapterRows, backMatter, declared: true };
}

/**
 * Whether the stored blurb still describes this edition.
 *
 * True for every book that declares nothing, so no existing description
 * disappears because this module was added.
 */
export function showsStoredBlurb(bookSlug: string): boolean {
  return !bookEditorialStructure(bookSlug)?.storedBlurbIsStaleEditionMetadata;
}

/** How many numbered chapters the edition prints, or null if undeclared. */
export function numberedChapterCount(bookSlug: string): number | null {
  const structure = bookEditorialStructure(bookSlug);
  if (!structure) return null;
  return structure.units.filter((u) => u.role === "CHAPTER").length;
}
