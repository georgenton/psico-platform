import type {
  VoiceTranscribeResponse,
  VoiceUsageReportResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * voiceApi — Sprint S8 surface.
 *
 * `transcribe` takes a Blob (browser) or Buffer (Node-side test) and sends
 * it multipart to `/api/voz/transcribe`. Audio is NOT stored — only the
 * transcript comes back. Quota errors come through as `ApiError` with the
 * status code preserved (402 for VOICE_QUOTA_EXCEEDED, 403 for VOICE_REQUIRES_PRO).
 *
 * The audio Blob's MIME type matters: the server checks against an allow-list
 * (audio/webm, audio/ogg, audio/mp4, ...). When recording with the
 * MediaRecorder API, pass the same mimeType you used to construct the
 * recorder so the upload matches.
 */
export const voiceApi = {
  transcribe: (audio: Blob, options?: { language?: string }) => {
    const form = new FormData();
    form.append("audio", audio, "audio");
    const qs = options?.language
      ? `?language=${encodeURIComponent(options.language)}`
      : "";
    // apiClient.post auto-JSON-stringifies object bodies, so we go through
    // a lower-level call that preserves FormData. This works because the
    // client passes the body straight to fetch.
    return apiClient.postFormData<VoiceTranscribeResponse>(
      `/voz/transcribe${qs}`,
      form,
    );
  },

  /**
   * Optional reconciliation call from the client after a successful
   * transcription. The server already counted seconds — this returns the
   * authoritative remaining minutes value so the client can sync its UI.
   */
  reportUsage: (secondsUsed: number) =>
    apiClient.post<VoiceUsageReportResponse>("/voz/usage", { secondsUsed }),
};
