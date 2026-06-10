import type { Metadata } from "next";
import { VideoRoom } from "@/components/dashboard/terapia/VideoRoom";

export const metadata: Metadata = { title: "Sala · Terapia" };
export const dynamic = "force-dynamic";

export default async function SalaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <VideoRoom
      sessionId={id}
      backHref={`/dashboard/terapia/sesiones/${id}`}
    />
  );
}
