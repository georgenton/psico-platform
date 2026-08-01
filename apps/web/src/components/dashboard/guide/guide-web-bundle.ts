/**
 * GR-4 — everything the web needs to render ONE pinned guide, resolved
 * together or not at all.
 *
 * The pin comes from the server. This resolver turns it into the two local
 * halves that must agree — the step presentation and the reader copy — and
 * refuses to hand back a half:
 *
 *   UNKNOWN_PIN_BUNDLE=null
 *   PARTIAL_PIN_BUNDLE=null
 *   FALLBACK_TO_EEC=false
 *
 * A partial bundle is the more dangerous of the two. Presentation without copy
 * would render a panel narrating the wrong chapter; copy without presentation
 * would render buttons that send no command. Both fail closed, so a guide that
 * is half-registered is simply not offered.
 */

import { guidePinKey, type GuidePin } from "./guide-pin";
import {
  guidePresentationRegistry,
  type GuidePresentation,
  type GuidePresentationRegistry,
} from "./guide-presentation";
import {
  guideReaderCopyRegistry,
  type GuideReaderCopy,
  type GuideReaderCopyRegistry,
} from "./guide-reader-copy";

export interface GuideWebBundle {
  pin: GuidePin;
  presentation: GuidePresentation;
  copy: GuideReaderCopy;
}

export interface GuideWebRegistries {
  presentations: GuidePresentationRegistry;
  copy: GuideReaderCopyRegistry;
}

const PRODUCTION_REGISTRIES: GuideWebRegistries = {
  presentations: guidePresentationRegistry,
  copy: guideReaderCopyRegistry,
};

/**
 * The exact bundle for a pin, or `null`.
 *
 * `registries` is injectable so a test can prove the partial case without
 * having to half-register a real guide.
 */
export function resolveGuideWebBundle(
  pin: GuidePin,
  registries: GuideWebRegistries = PRODUCTION_REGISTRIES,
): GuideWebBundle | null {
  const key = guidePinKey(pin);
  if (key === null) return null;

  const presentation = registries.presentations.getExact(pin);
  if (!presentation) return null;

  const copy = registries.copy.getExact(pin);
  if (!copy) return null;

  // Normalized: every downstream `bundle.pin` is the canonical pair, not
  // whatever extra fields the caller's object happened to carry.
  return {
    pin: { guideKey: presentation.guideKey, guideVersion: presentation.guideVersion },
    presentation,
    copy,
  };
}
