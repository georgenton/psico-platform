import { Suspense } from "react";
import type { Metadata } from "next";
import VerifyEmailFlow from "./_VerifyEmailFlow";

export const metadata: Metadata = { title: "Confirmar correo" };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailFlow />
    </Suspense>
  );
}
