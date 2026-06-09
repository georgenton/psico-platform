/**
 * IVideoProvider — abstrahe la integración con Daily.co / Whereby /
 * LiveKit. ADR 0014 documenta la decisión Daily.co.
 *
 * Sprint S65: ships ConsoleVideoProvider stub. Real DailyVideoProvider
 * llega cuando DAILY_API_KEY se provisione (Apple-Developer-style flow).
 */
export interface IVideoProvider {
  readonly name: string;

  /** Whether the provider has real credentials wired. */
  isConfigured(): boolean;

  /**
   * Crea una sala efímera para una sesión. La URL retornada se persiste
   * en `TherapySession.roomUrl` y se reusa entre joins.
   *
   * `expiresInSec` typically 2h — generous buffer sobre la sesión de 50 min.
   */
  createRoom(opts: {
    sessionId: string;
    expiresInSec: number;
  }): Promise<{ roomUrl: string; expiresAt: Date }>;

  /**
   * Emite un token de join short-lived para que el cliente abra la sala.
   * Los tokens van firmados con el secret del provider. El cliente NUNCA
   * los persiste — se piden bajo demanda al entrar.
   *
   * `isOwner: true` da privilegios de admin (echar a otros, etc). Para
   * un terapeuta en su propia sesión = true; para el paciente = false.
   */
  createJoinToken(opts: {
    roomUrl: string;
    userName: string;
    isOwner: boolean;
    expiresInSec: number;
  }): Promise<{ joinToken: string; expiresAt: Date }>;

  /**
   * Cierra una sala antes del expire automático. Se llama al cancelar
   * o completar una sesión para liberar slots del provider.
   */
  destroyRoom(roomUrl: string): Promise<void>;
}
