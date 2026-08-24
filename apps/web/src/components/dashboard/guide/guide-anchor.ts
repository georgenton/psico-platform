/**
 * GR-3 — the reader anchor of Guide V1.
 *
 * The locator and its resolver live in `@psico/types` so the pg-spec that
 * ingests the canonical chapter can exercise the SAME function this panel
 * uses. Re-exported here because the reader surface is where it is consumed.
 */
export {
  GUIDE_READER_ANCHOR,
  PAREJAS_READER_ANCHOR,
  GuideAnchorRegistry,
  guideAnchorRegistry,
  resolveGuideAnchor,
  type AnchorCandidateBlock,
  type GuideAnchorPin,
  type GuideAnchorResolution,
  type GuideReaderAnchorLocator,
} from "@psico/types";
