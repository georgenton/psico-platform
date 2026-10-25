"use client";

import { useState } from "react";

import { DATA_EXPORT_SCOPE } from "@psico/types";

/**
 * DataExportCard — pedir, seguir y descargar la exportación de datos.
 *
 * Hasta ahora el recorrido existía sólo por API: se podía pedir y descargar
 * con `curl`, pero una persona no tenía por dónde. Esta tarjeta lo pone donde
 * se busca —cuenta y privacidad— sin ampliar lo que el archivo contiene.
 *
 * ── Dos decisiones que conviene no deshacer ────────────────────────────────
 *
 * 1. **El alcance se lee ANTES de pedir.** Un archivo que dice llamarse «tus
 *    datos» y llega sin el diario defrauda a quien lo abre. La lista de lo
 *    que NO viaja está arriba del botón, no en una nota al pie, y nombra las
 *    categorías una por una.
 *
 * 2. **La URL firmada se abre tal cual.** El endpoint devuelve la URL en vez
 *    de redirigir, precisamente para que la cabecera `Authorization` no viaje
 *    a R2. Aquí se respeta: se pide con el token a nuestra API, y lo que se
 *    abre es la URL que ella entrega, sin cabeceras nuestras.
 *
 * El estado sale de los códigos del endpoint de descarga, que ya los
 * distingue: 200 lista, 409 preparándose, 410 caducada, 404 ninguna. No hace
 * falta un endpoint de estado aparte, y `latest` evita tener que conocer el
 * id de la fila.
 */

type Fase =
  | { t: "inicio" }
  | { t: "consultando" }
  | { t: "pidiendo" }
  | { t: "preparando"; desde?: string }
  | { t: "lista"; url: string; expiraEnSec: number }
  | { t: "caducada" }
  | { t: "no-descargable" }
  | { t: "ninguna" }
  | { t: "enfriamiento"; mensaje: string }
  | { t: "error"; mensaje: string };

/**
 * El 409 de la descarga lleva DOS códigos que significan cosas opuestas, y
 * tratarlos igual es decirle a alguien que espere algo que no va a llegar:
 *
 *   - `DATA_EXPORT_NOT_READY` — todavía se está preparando. Esperar sirve.
 *   - `DATA_EXPORT_UNAVAILABLE` — esa exportación **nunca** podrá descargarse
 *     (su fila guarda una URL que ningún navegador puede abrir). Esperar no
 *     sirve: hay que pedir otra.
 *
 * Y un 409 que no traiga código, o traiga uno que no conocemos, tampoco se
 * convierte en «la estamos preparando»: eso es una promesa, y no la podemos
 * sostener sin saber qué pasó.
 */
async function leerCodigo(res: Response): Promise<string | null> {
  try {
    const cuerpo = (await res.json()) as unknown;
    if (cuerpo && typeof cuerpo === "object" && "code" in cuerpo) {
      const code = (cuerpo as { code: unknown }).code;
      return typeof code === "string" ? code : null;
    }
    return null;
  } catch {
    // Cuerpo ausente o no-JSON: no hay código que leer.
    return null;
  }
}

export function DataExportCard({
  apiBase,
  token,
  solicitadaEl,
}: {
  apiBase: string;
  token: string | null;
  /** De `/user/me`: cuándo se pidió la última, si se pidió alguna. */
  solicitadaEl: string | null;
}) {
  const [fase, setFase] = useState<Fase>(
    solicitadaEl ? { t: "preparando", desde: solicitadaEl } : { t: "inicio" },
  );

  const cabeceras = { Authorization: `Bearer ${token ?? ""}` };

  async function consultar() {
    if (!token) return;
    setFase({ t: "consultando" });
    try {
      const res = await fetch(`${apiBase}/user/data-export/latest/download`, {
        headers: cabeceras,
      });
      if (res.status === 200) {
        const j = (await res.json()) as { url: string; expiresInSec: number };
        setFase({ t: "lista", url: j.url, expiraEnSec: j.expiresInSec });
        return;
      }
      if (res.status === 409) {
        const code = await leerCodigo(res);
        if (code === "DATA_EXPORT_NOT_READY") {
          return setFase({ t: "preparando" });
        }
        if (code === "DATA_EXPORT_UNAVAILABLE") {
          return setFase({ t: "no-descargable" });
        }
        // Un 409 que no sabemos leer NO se convierte en «se está preparando».
        return setFase({
          t: "error",
          mensaje:
            "No pudimos consultar el estado de tu exportación. Vuelve a intentarlo; si sigue pasando, pide una nueva.",
        });
      }
      if (res.status === 410) return setFase({ t: "caducada" });
      if (res.status === 404) return setFase({ t: "ninguna" });
      setFase({
        t: "error",
        mensaje: `No pudimos consultarlo (${res.status}).`,
      });
    } catch {
      setFase({
        t: "error",
        mensaje: "No pudimos consultarlo. Revisa tu conexión.",
      });
    }
  }

  async function pedir() {
    if (!token) return;
    setFase({ t: "pidiendo" });
    try {
      const res = await fetch(`${apiBase}/user/data-export`, {
        method: "POST",
        headers: cabeceras,
      });
      if (res.status === 202) return setFase({ t: "preparando" });
      if (res.status === 429) {
        // El cuerpo trae la fecha exacta de reintento; se muestra tal cual
        // porque «vuelve más tarde» no le sirve a nadie.
        const texto = await res.text();
        const fecha = texto.match(/after ([\dT:.Z-]+)/)?.[1];
        setFase({
          t: "enfriamiento",
          mensaje: fecha
            ? `Ya pediste una hace poco. Puedes pedir otra a partir del ${new Date(fecha).toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" })}.`
            : "Ya pediste una hace poco. Puedes pedir otra más adelante.",
        });
        return;
      }
      if (res.status === 409) {
        setFase({
          t: "error",
          mensaje:
            "Tu cuenta está pendiente de baja. Cancela esa solicitud antes de pedir una exportación.",
        });
        return;
      }
      setFase({ t: "error", mensaje: `No pudimos pedirla (${res.status}).` });
    } catch {
      setFase({
        t: "error",
        mensaje: "No pudimos pedirla. Revisa tu conexión.",
      });
    }
  }

  const ocupado = fase.t === "consultando" || fase.t === "pidiendo";

  return (
    <section className="card" style={{ padding: 22, marginBottom: 18 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
        Descargar tus datos
      </h2>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fv-muted)" }}>
        Preparamos un archivo con lo que guardamos de ti y te damos un enlace
        para descargarlo. Tarda unos minutos y el enlace caduca.
      </p>

      {/* El alcance, antes del botón. */}
      <div
        style={{
          margin: "14px 0 18px",
          padding: "12px 14px",
          borderRadius: 10,
          background: "var(--color-warm-100)",
          fontSize: 12.5,
          lineHeight: 1.6,
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 4 }}>Qué incluye</p>
        <p style={{ color: "var(--fv-muted)", marginBottom: 10 }}>
          {DATA_EXPORT_SCOPE.incluye.join(" · ")}
        </p>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>Qué NO incluye</p>
        <p style={{ color: "var(--fv-muted)" }}>
          {DATA_EXPORT_SCOPE.noIncluye.join(" · ")}
        </p>
        {/*
          El texto anterior decía que no podemos leer tus mensajes a Eco y que
          POR ESO no pueden ir en el archivo. Las dos mitades fallan.

          Primero, mezcla dos cosas: el mensaje que escribes a Eco viaja en
          claro para que el modelo pueda responderte (ADR 0007 §C — el cifrado
          de Eco es híbrido, no de punta a punta), y lo que queda cifrado es su
          copia almacenada. «No podemos leerlo» no describe el mensaje; describe
          la copia.

          Y segundo, aunque fuera cierto, no sería el motivo: el archivo podría
          llevar el ciphertext. No lo lleva porque el alcance de la exportación
          no los incluye — una decisión nuestra, no un límite de la criptografía.
          Atribuirlo al cifrado convierte una decisión en una imposibilidad.
        */}
        <p style={{ color: "var(--fv-muted)", marginTop: 10 }}>
          Esta exportación no incluye tu Diario ni las conversaciones con Eco,
          tampoco sus copias cifradas. Es una limitación de su alcance actual.
        </p>
      </div>

      {fase.t === "lista" ? (
        <a
          className="btn btn-primary"
          href={fase.url}
          // La URL firmada es de otro host: se abre sin nuestras cabeceras.
          rel="noopener noreferrer"
          target="_blank"
          style={{ display: "inline-block" }}
        >
          Descargar el archivo
        </a>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={pedir}
          disabled={ocupado || !token}
        >
          {fase.t === "pidiendo" ? "Pidiéndola…" : "Pedir mi exportación"}
        </button>
      )}

      <button
        type="button"
        className="btn btn-ghost"
        onClick={consultar}
        disabled={ocupado || !token}
        style={{ marginLeft: 10 }}
      >
        {fase.t === "consultando" ? "Consultando…" : "Consultar estado"}
      </button>

      <p
        role="status"
        style={{
          fontSize: 12.5,
          lineHeight: 1.6,
          marginTop: 12,
          color: "var(--fv-muted)",
        }}
      >
        {fase.t === "preparando" &&
          "La estamos preparando. Suele tardar unos minutos; vuelve a consultar en un rato."}
        {fase.t === "lista" &&
          `Lista. El enlace caduca en ${Math.max(1, Math.round(fase.expiraEnSec / 60))} minutos; si caduca, vuelve a consultar.`}
        {fase.t === "caducada" &&
          "Aquella exportación ya se borró: guardamos el archivo un tiempo limitado y después lo eliminamos. Pide una nueva cuando quieras."}
        {fase.t === "no-descargable" &&
          "Esa exportación no se puede descargar: se preparó con un formato que ya no sirve para entregártela. No hace falta esperar — pide una nueva y la generamos otra vez."}
        {fase.t === "ninguna" && "Todavía no has pedido ninguna."}
        {fase.t === "enfriamiento" && fase.mensaje}
        {fase.t === "error" && fase.mensaje}
      </p>
    </section>
  );
}
