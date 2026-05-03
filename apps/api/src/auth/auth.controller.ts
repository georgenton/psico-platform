import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
<<<<<<< HEAD
import type { AuthService } from "./auth.service";
=======
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthService } from "./auth.service";
>>>>>>> origin/main
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RefreshDto } from "./dto/refresh.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { AuthenticatedUser } from "./strategies/jwt.strategy";

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto, @Req() _req: Request) {
    return this.authService.register(dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    const userAgent = req.headers["user-agent"];
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress;
    return this.authService.refresh(dto.refreshToken, userAgent, ipAddress);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  logout(@Body() dto: RefreshDto, @Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.userId, dto.refreshToken);
  }
}
