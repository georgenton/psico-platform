import type { AuthResponse } from "@psico/types";
import { apiClient } from "./client";

export const authApi = {
  register: (name: string, email: string, password: string) =>
    apiClient.post<AuthResponse>("/auth/register", { name, email, password }),

  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>("/auth/login", { email, password }),

  logout: (refreshToken: string) =>
    apiClient.post<void>("/auth/logout", { refreshToken }),
};
