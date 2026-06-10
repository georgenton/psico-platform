import { Suspense } from "react";
import type { Metadata } from "next";
import ResetPasswordForm from "./_ResetPasswordForm";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
