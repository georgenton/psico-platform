import { Suspense } from "react";
import type { Metadata } from "next";

import LoginForm from "./_LoginForm";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
