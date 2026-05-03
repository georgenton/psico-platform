import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, ForbiddenException } from "@nestjs/common";
<<<<<<< HEAD
import type { Reflector } from "@nestjs/core";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from "@nestjs/core";
>>>>>>> origin/main
import { REQUIRED_ROLE_KEY } from "./required-role.decorator";
import type { AuthenticatedUser } from "../../auth";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const { role } = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>().user;

    if (role !== required) {
      throw new ForbiddenException("Acceso restringido a administradores");
    }

    return true;
  }
}
