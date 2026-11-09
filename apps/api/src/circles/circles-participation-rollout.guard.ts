import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CirclesRolloutService } from "./circles-rollout.service";
import { attachCircleActor, buildUserActor } from "./circles-actor";
import type { CircleActorRequest } from "./circles-actor";
import { circlesException } from "./circles-http-errors";

/**
 * La puerta de las rutas de PARTICIPACIÓN autenticadas.
 *
 * Idéntica a `CirclesRolloutGuard` salvo en la pregunta que hace: ésta
 * pregunta `isParticipationAvailable()` —¿está abierta la superficie?— y no
 * `isAvailable(userId)` —¿está esta persona en el padrón?—.
 *
 * El porqué está escrito en `isParticipationAvailable`, con la medición que lo
 * destapó: con `pilot`, una invitada **con cuenta** no podía abrir la sala que
 * la misma invitada **sin cuenta** abría entera. La participación cabalga sobre
 * la habilitación de quien invita, igual que la superficie de invitadas.
 *
 * Lo que esta puerta NO hace, y conviene que se vea en su propio archivo:
 *
 * - **No admite crear.** `POST /circles/duo` conserva `CirclesRolloutGuard`
 *   encima, y los dos guardianes corren: la creación sigue consultando el
 *   padrón. Crear un Círculo vive en otro controlador, también con el suyo.
 * - **No concede asiento.** Sólo construye el actor. Quien no tenga asiento en
 *   la actividad muere igual en `resolveAuthority`, que es donde se decide.
 * - **No abre nada con `off`.** Ahí sigue siendo 503 para todo el mundo.
 *
 * El 503 es igual de opaco que el de la otra puerta: nunca dice el modo, ni el
 * padrón, ni el motivo.
 */
@Injectable()
export class CirclesParticipationRolloutGuard implements CanActivate {
  constructor(private readonly rollout: CirclesRolloutService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<CircleActorRequest & { user?: AuthenticatedUser }>();
    const user = request.user;

    // Misma defensa que la otra puerta: `JwtAuthGuard` garantiza `user`, y si
    // faltara se falla cerrado en vez de confiar en una petición sin
    // identificar.
    if (!user || !this.rollout.isParticipationAvailable()) {
      throw circlesException("CIRCLES_UNAVAILABLE");
    }

    attachCircleActor(request, buildUserActor(user.userId));
    return true;
  }
}
