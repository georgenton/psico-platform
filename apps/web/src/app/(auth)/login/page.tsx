import { Suspense } from "react";
import type { Metadata } from "next";

import { RetirarMarcaDeCuenta } from "@/lib/crypto/sesion-vigente";
import LoginForm from "./_LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <>
      <RetirarMarcaDeCuenta />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </>
  );
}
