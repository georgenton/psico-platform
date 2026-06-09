import { Injectable, Logger } from "@nestjs/common";
import type { IVideoProvider } from "./video-provider.interface";

/**
 * ConsoleVideoProvider — Sprint S65 default.
 *
 * Logs requests + returns fake room URLs. Útil para:
 *  - Tests (paridad con APNs stub).
 *  - Local dev cuando ops no quiere tráfico real al provider.
 *  - Producción ANTES de provisionar Daily.co — el cliente recibe URL
 *    "fake-room://" y muestra UI de "video aún no configurado" en lugar
 *    de romperse.
 */
@Injectable()
export class ConsoleVideoProvider implements IVideoProvider {
  readonly name = "console";
  private readonly logger = new Logger("ConsoleVideoProvider");

  isConfigured(): boolean {
    return false;
  }

  async createRoom(opts: {
    sessionId: string;
    expiresInSec: number;
  }): Promise<{ roomUrl: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + opts.expiresInSec * 1000);
    const roomUrl = `fake-room://session-${opts.sessionId}`;
    this.logger.log(
      `[video stub] createRoom session=${opts.sessionId} expiresAt=${expiresAt.toISOString()}`,
    );
    return { roomUrl, expiresAt };
  }

  async createJoinToken(opts: {
    roomUrl: string;
    userName: string;
    isOwner: boolean;
    expiresInSec: number;
  }): Promise<{ joinToken: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + opts.expiresInSec * 1000);
    const joinToken = `fake-token-${opts.userName}-${opts.isOwner ? "owner" : "guest"}`;
    this.logger.log(
      `[video stub] createJoinToken room=${opts.roomUrl} user=${opts.userName} owner=${opts.isOwner}`,
    );
    return { joinToken, expiresAt };
  }

  async destroyRoom(roomUrl: string): Promise<void> {
    this.logger.log(`[video stub] destroyRoom room=${roomUrl}`);
  }
}
