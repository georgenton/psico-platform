import { PlaceholderCard } from "@/components/dashboard/shell/PlaceholderCard";

export const metadata = { title: "Exploraciones" };

export default function ExploracionesPage() {
  return (
    <PlaceholderCard
      icon="🧭"
      subtitle="Próximamente"
      title="Exploraciones"
      body={
        <p>
          Rutas guiadas que combinan libros, audios y reflexiones en torno a un
          tema. Llega en Sprint B5 con el backend de Journeys y un primer set
          curado.
        </p>
      }
    />
  );
}
