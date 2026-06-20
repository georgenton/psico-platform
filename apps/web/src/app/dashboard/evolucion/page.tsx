import { PlaceholderCard } from "@/components/dashboard/shell/PlaceholderCard";

export const metadata = { title: "Mi Evolución" };

export default function EvolucionPage() {
  return (
    <PlaceholderCard
      icon="📈"
      subtitle="Próximamente"
      title="Mi Evolución"
      body={
        <p>
          Aquí verás tu progreso a lo largo del tiempo: hitos alcanzados,
          hábitos que se consolidan y rachas largas. Llega en Sprint C.
        </p>
      }
    />
  );
}
