import { getSessionUser } from "@/lib/api.server";
import { DashboardShell } from "./_DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = getSessionUser();

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
