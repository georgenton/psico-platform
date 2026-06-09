import type { Metadata } from "next";
import ForgotPasswordForm from "./_ForgotPasswordForm";

export const metadata: Metadata = { title: "Restablecer contraseña" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
