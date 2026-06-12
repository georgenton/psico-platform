import { IsIn, IsOptional, IsString, Length } from "class-validator";
import type { CrisisTrigger } from "@psico/types";

/**
 * Body for `POST /api/terapia/crisis/log` — Sprint S62.
 *
 * Privacy-preserving audit of crisis surface usage. Records ONLY
 * categorical metadata — never user text, never emotional state,
 * never the message that triggered Eco's safety layer. Lets ops
 * understand which paths drive crisis contact without invading
 * privacy.
 *
 * The endpoint itself is PUBLIC (no auth) per the ethical decision:
 * someone in crisis shouldn't have to log in to get the hotline.
 * If the user IS authenticated the row is attributed; otherwise
 * stored anonymously.
 */
export class CrisisLogDto {
  /**
   * Where the crisis surface was triggered from:
   * - `ECO_SAFETY_LAYER` — Eco's layer-1 regex / layer-2 LLM sentinel
   *   fired and we routed the user to the hotline.
   * - `HOME_BUTTON` — explicit "Necesito ayuda" tile on the home screen.
   * - `PROFILE_LINK` — link in the profile / settings menu.
   * - `THERAPIST_SUGGESTION` — a therapist's reply suggested the
   *   user contact a hotline.
   *
   * Plugin emits the enum in OpenAPI.
   */
  @IsIn([
    "ECO_SAFETY_LAYER",
    "HOME_BUTTON",
    "PROFILE_LINK",
    "THERAPIST_SUGGESTION",
  ])
  trigger!: CrisisTrigger;

  /**
   * Optional ID of the hotline the user tapped to call/visit from
   * the crisis screen's list. Useful to know which lines are
   * effective for which countries. Up to 64 chars to allow opaque
   * catalog IDs.
   */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  contactedLineId?: string;

  /**
   * ISO 3166-1 alpha-2 country code, 2 chars. Inferred client-side
   * from the user's profile / IP geolocation. Drives which set of
   * hotlines was shown at the moment of the event.
   */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}
