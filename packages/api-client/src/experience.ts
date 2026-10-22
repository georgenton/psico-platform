import type {
  ChapterExperienceDiscoveryResponse,
  ChapterExperiencePublicView,
} from "@psico/types";
import { apiClient } from "./client";

/** The one code a locally-rejected reading context reports. */
export const EXPERIENCE_DISCOVERY_PARAMS_INVALID =
  "EXPERIENCE_DISCOVERY_PARAMS_INVALID";

/**
 * The SAME canonical grammar the server applies to the path segments: trim,
 * lowercase, kebab-case of alphanumeric words.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * experienceApi — GR-6, the read that lets the browser render a journey it
 * did not compile in.
 *
 * There is exactly one method, and it is concrete. No generic query, no
 * filters, no pagination: a chapter has as many published journeys as it has,
 * and that number is small. When the CMS lands, this call keeps its shape —
 * what changes is where the server reads the definitions from.
 */
export const experienceApi = {
  /**
   * Zero to many PUBLISHED definitions at exact immutable versions.
   *
   * An empty list is a real answer. Malformed input is rejected locally for
   * the same reason discovery rejects it: an empty list caused by a typo would
   * be indistinguishable from "this chapter has no journey", and those are
   * different facts.
   */
  listPublishedForChapter: ({
    bookSlug,
    chapterOrder,
  }: {
    bookSlug: string;
    chapterOrder: number;
  }) => {
    const slug =
      typeof bookSlug === "string" ? bookSlug.trim().toLowerCase() : "";
    if (
      !SLUG_RE.test(slug) ||
      !Number.isInteger(chapterOrder) ||
      chapterOrder <= 0
    ) {
      // The rejected value is NOT echoed: untrusted input does not travel into
      // an error message that something will eventually log.
      return Promise.reject(new Error(EXPERIENCE_DISCOVERY_PARAMS_INVALID));
    }
    return apiClient.get<ChapterExperienceDiscoveryResponse>(
      `/experiences/discovery/${encodeURIComponent(slug)}/${chapterOrder}`,
    );
  },

  /**
   * B3 — la experiencia que ESTA persona ya empezó, por identidad exacta.
   *
   * Existe porque el descubrimiento era el único origen de una definición, y
   * eso dejaba sin camino a quien tenía un recorrido en una experiencia que el
   * capítulo ya no ofrece. Lo que autoriza es la propiedad, comprobada en el
   * servidor; sin sesión propia responde 404, igual que si no existiera.
   *
   * No empieza nada: `POST /guide/sessions` sigue siendo el único camino para
   * abrir una sesión, y sigue negando los pines retirados.
   */
  getOwnByPin: ({
    experienceKey,
    experienceVersion,
  }: {
    experienceKey: string;
    experienceVersion: number;
  }) => {
    const key =
      typeof experienceKey === "string"
        ? experienceKey.trim().toLowerCase()
        : "";
    if (
      !SLUG_RE.test(key) ||
      !Number.isInteger(experienceVersion) ||
      experienceVersion <= 0
    ) {
      return Promise.reject(new Error(EXPERIENCE_DISCOVERY_PARAMS_INVALID));
    }
    return apiClient.get<{ experience: ChapterExperiencePublicView }>(
      `/experiences/mine/${encodeURIComponent(key)}/${experienceVersion}`,
    );
  },
};
