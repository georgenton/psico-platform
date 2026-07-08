import * as LocalAuthentication from "expo-local-authentication";

/**
 * Thin wrapper over expo-local-authentication used to gate the persisted
 * diary/Eco key behind Face ID / Touch ID / fingerprint (with device-passcode
 * fallback).
 *
 * This is a UX gate, not a hardware-backed key wrap: the subkey still lives in
 * SecureStore and is loaded into JS memory after a successful prompt. Per the
 * product decision (2026-07, "Face ID para abrir") that trade-off is
 * acceptable — the goal is a fast, friendly re-entry, and the phone's own lock
 * screen remains the primary defense for a stolen device.
 */

export interface BiometricCapability {
  available: boolean;
  /** Human label for the primary modality: "Face ID", "huella", etc. */
  label: string;
}

/**
 * Is biometric (or device passcode) usable on this device right now?
 * Requires both hardware AND at least one enrolled credential.
 */
export async function getBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return {
      available: hasHardware && enrolled,
      label: labelForTypes(types),
    };
  } catch {
    // Some simulators / stripped builds throw — treat as unavailable.
    return { available: false, label: "biometría" };
  }
}

function labelForTypes(
  types: LocalAuthentication.AuthenticationType[],
): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
    return "Face ID";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
    return "huella";
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS))
    return "iris";
  return "biometría";
}

/**
 * Prompt the user for biometric confirmation. Returns true on success.
 * Device-passcode fallback stays enabled so a user whose Face ID failed can
 * still get in without their app password.
 */
export async function promptBiometric(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Usar contraseña",
      fallbackLabel: "Usar código del dispositivo",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
