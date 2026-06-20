import { PlaceholderCard } from "@/components/dashboard/shell/PlaceholderCard";

export const metadata = { title: "Mapa Emocional" };

export default function MapaPage() {
  return (
    <PlaceholderCard
      icon="🗺️"
      subtitle="Próximamente"
      title="Mapa Emocional"
      body={
        <p>
          El radar de 6 ejes que verás en la pantalla principal del rediseño,
          ahora a tamaño completo y con histórico. Aterriza en Sprint D, cuando
          Claude Design termine la pantalla flagship.
        </p>
      }
    />
  );
}
