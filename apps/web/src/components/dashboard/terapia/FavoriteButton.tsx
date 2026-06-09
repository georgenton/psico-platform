"use client";

import { useState, useTransition } from "react";
import { toggleTherapistFavoriteAction } from "@/actions/terapia";

export function FavoriteButton({
  therapistId,
  initial,
}: {
  therapistId: string;
  initial: boolean;
}) {
  const [isFavorite, setIsFavorite] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        const res = await toggleTherapistFavoriteAction(therapistId);
        setIsFavorite(res.isFavorite);
      } catch {
        // swallow — UX revierte porque el state no cambia
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={isFavorite ? "Quitar de favoritos" : "Guardar como favorito"}
      className="rounded-full border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
      style={{
        borderColor: isFavorite
          ? "var(--color-rose-300)"
          : "var(--color-warm-300)",
        color: isFavorite ? "var(--color-rose-700)" : "var(--color-warm-700)",
      }}
    >
      {isFavorite ? "♥ Guardado" : "♡ Guardar"}
    </button>
  );
}
