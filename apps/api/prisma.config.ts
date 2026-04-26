import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // env("DATABASE_URL") would throw at load-time in CI/schema commands;
    // runtime startup validation is handled by Zod in ConfigModule instead.
    url: process.env.DATABASE_URL ?? "",
  },
});
