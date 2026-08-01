/**
 * GR-4 — the pins and bundles the web tests exercise.
 *
 * The EEC constants live here so the regression suites can keep asserting the
 * exact published experience without every file re-deriving it, and so the
 * ratchet that forbids singleton imports in RUNTIME code has one obvious,
 * declared place where test fixtures may name a guide.
 */

import { guidePresentationRegistry } from "./guide-presentation";
import { guideReaderCopyRegistry } from "./guide-reader-copy";
import type { GuidePin } from "./guide-pin";
import {
  resolveGuideWebBundle,
  type GuideWebBundle,
} from "./guide-web-bundle";

export const EEC_PIN: GuidePin = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
};

export const PQP_PIN: GuidePin = {
  guideKey: "pqp-c1-contacto-sostenido",
  guideVersion: 1,
};

function required(pin: GuidePin): GuideWebBundle {
  const bundle = resolveGuideWebBundle(pin);
  // A fixture that silently became `null` would turn every assertion below it
  // into a vacuous pass, so it throws here instead.
  if (!bundle) throw new Error(`missing guide bundle for ${pin.guideKey}`);
  return bundle;
}

export const EEC_BUNDLE: GuideWebBundle = required(EEC_PIN);
export const PQP_BUNDLE: GuideWebBundle = required(PQP_PIN);

export const EEC_PRESENTATION = EEC_BUNDLE.presentation;
export const PQP_PRESENTATION = PQP_BUNDLE.presentation;

export const eecPresentation = () => guidePresentationRegistry.getExact(EEC_PIN);
export const eecCopy = () => guideReaderCopyRegistry.getExact(EEC_PIN);
