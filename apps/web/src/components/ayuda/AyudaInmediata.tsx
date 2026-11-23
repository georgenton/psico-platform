import {
  CRISIS_COUNTRIES,
  CRISIS_COUNTRY_NAMES,
  CRISIS_FALLBACK,
  dialableHotline,
  getCrisisFor,
  type CrisisCountry,
  type CrisisLine,
} from "@psico/types";

import { FeelVerseLockup } from "@/components/brand/FeelVerse";
import { ANCLA_LINEAS, hrefAyuda, type OrigenAyuda } from "@/lib/ayuda";

/**
 * La pantalla de ayuda inmediata, sin estado y sin JavaScript propio.
 *
 * Todo son enlaces nativos (`<a>`, no `<Link>`): cambiar de país, llamar y
 * volver funcionan con el JavaScript desactivado o roto, y salir de aquí carga
 * un documento nuevo en vez de heredar la CSP estricta de esta página.
 *
 * El orden es el de la urgencia: el aviso de peligro inmediato, las líneas, y
 * sólo después lo demás. Los colores salen de los pares declarados en
 * `lib/design/color-contracts.ts`, para que aguanten en los dos temas.
 */

/** Los códigos del catálogo, dichos como los diría una persona. */
const IDIOMAS: Record<string, string> = { es: "español", en: "inglés" };

const nombreIdioma = (codigo: string) => IDIOMAS[codigo] ?? codigo;

const BOTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2.5 text-[16px] font-semibold no-underline";

const TARJETA = {
  background: "var(--fv-surface)",
  borderColor: "var(--fv-border-quiet)",
} as const;

export function AyudaInmediata({
  pais,
  desde,
  vuelta,
}: {
  pais: CrisisCountry;
  desde: OrigenAyuda | null;
  vuelta: { readonly href: string; readonly texto: string };
}) {
  const datos = getCrisisFor(pais);
  const nombrePais = CRISIS_COUNTRY_NAMES[pais];

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-12 pt-4 sm:px-6 sm:pt-6"
      style={{ color: "var(--fg-body)" }}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <a
          href="/"
          aria-label="FeelVerse, ir a la portada"
          className="inline-flex min-h-[44px] items-center no-underline"
          style={{ color: "var(--fg-heading)" }}
        >
          <FeelVerseLockup size={20} />
        </a>
        <a
          href={vuelta.href}
          className="inline-flex min-h-[44px] items-center text-[15px] font-semibold underline underline-offset-4"
          style={{ color: "var(--fg-link-strong)" }}
        >
          <span aria-hidden="true">←&nbsp;</span>
          {vuelta.texto}
        </a>
      </header>

      <main className="mt-4 flex-1 sm:mt-8">
        <h1 className="text-[30px] sm:text-[36px]">Ayuda inmediata</h1>
        <p className="mt-3 text-[17px] leading-relaxed">
          Buscar ayuda está bien. Aquí tienes líneas de ayuda con su teléfono y
          su horario. No necesitas una cuenta.
        </p>

        <p
          className="mt-5 rounded-2xl border px-4 py-3.5 text-[16px] leading-relaxed"
          style={{
            background: "var(--color-error-bg)",
            borderColor: "var(--color-error-border)",
            color: "var(--color-error-text)",
          }}
        >
          <strong className="font-semibold">
            FeelVerse no es un servicio de emergencias.
          </strong>{" "}
          Si tú u otra persona están en peligro inmediato, llama ahora al número
          de emergencias de tu país.
        </p>

        <section
          id={ANCLA_LINEAS}
          aria-labelledby="titulo-lineas"
          className="mt-8 scroll-mt-4"
        >
          <h2 id="titulo-lineas" className="text-[22px] sm:text-[24px]">
            Líneas en {nombrePais}
          </h2>

          <nav aria-label="Elegir país" className="mt-3">
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {CRISIS_COUNTRIES.map((codigo) => (
                <li key={codigo}>
                  <EnlacePais
                    codigo={codigo}
                    activo={codigo === pais}
                    desde={desde}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <ul className="mt-4 list-none space-y-3 p-0">
            {datos.lines.map((linea) => (
              <li
                key={linea.id}
                className="rounded-2xl border p-4 sm:p-5"
                style={TARJETA}
              >
                <Linea linea={linea} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titulo-mientras" className="mt-8">
          <h2 id="titulo-mientras" className="text-[20px]">
            Mientras tanto
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-relaxed">
            {datos.safetyTipsShort.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titulo-pasos" className="mt-8">
          <h2 id="titulo-pasos" className="text-[20px]">
            Próximos pasos
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[16px] leading-relaxed">
            {datos.nextSteps.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </section>

        <OtrosPaises />
      </main>

      <footer
        className="mt-10 border-t pt-4 text-[14px] leading-relaxed"
        style={{
          borderColor: "var(--fv-border-quiet)",
          color: "var(--fg-muted)",
        }}
      >
        FeelVerse es psicoeducación y aprendizaje. No sustituye la atención
        profesional.
      </footer>
    </div>
  );
}

/**
 * Un país del catálogo. El activo se dice tres veces y ninguna es sólo color:
 * `aria-current`, una marca y el grosor del texto. Además cambia el título de
 * la sección y el de la pestaña.
 */
function EnlacePais({
  codigo,
  activo,
  desde,
}: {
  codigo: CrisisCountry;
  activo: boolean;
  desde: OrigenAyuda | null;
}) {
  return (
    <a
      href={`${hrefAyuda({ pais: codigo, desde })}#${ANCLA_LINEAS}`}
      aria-current={activo ? "page" : undefined}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center rounded-full border-2 px-3.5 text-[16px] no-underline sm:px-4 ${
        activo ? "font-bold" : "font-medium"
      }`}
      style={{
        background: activo ? "var(--fv-selected-bg)" : "var(--fv-surface)",
        borderColor: activo
          ? "var(--fv-selected-border)"
          : "var(--fv-border-quiet)",
        color: "var(--fv-text)",
      }}
    >
      {activo ? <span aria-hidden="true">✓&nbsp;</span> : null}
      {CRISIS_COUNTRY_NAMES[codigo]}
    </a>
  );
}

/** Una línea del catálogo, con las formas de contacto que declare. */
export function Linea({ linea }: { linea: CrisisLine }) {
  // Derivado con el mismo criterio que el modal de Eco, no saneado a mano:
  // quitar todo lo que no sea dígito convierte «1800-4-SALUD (1800-472583)» en
  // un número que no existe.
  const marcable = dialableHotline(linea.phone);
  const whatsapp = linea.whatsapp?.replace(/[^0-9]/g, "");

  return (
    <>
      <h3 className="text-[18px]">{linea.name}</h3>
      <p
        className="mt-1 text-[15px] leading-relaxed"
        style={{ color: "var(--fv-muted)" }}
      >
        {linea.availability} · {linea.languages.map(nombreIdioma).join(", ")}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {marcable ? (
          <a
            href={`tel:${marcable}`}
            className={BOTON}
            style={{
              background: "var(--bg-action)",
              color: "var(--fg-on-action)",
            }}
          >
            Llamar al {linea.phone}
            <span className="sr-only"> ({linea.name})</span>
          </a>
        ) : (
          // Sin forma marcable no se finge un enlace: un `tel:` muerto en esta
          // pantalla parece ayuda y no hace nada.
          <p
            className="inline-flex min-h-[44px] items-center text-[16px] font-semibold"
            style={{ color: "var(--fv-text)" }}
          >
            Llama al {linea.phone}
          </p>
        )}

        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}`}
            className={`${BOTON} border`}
            style={{ ...TARJETA, color: "var(--fv-text)" }}
          >
            WhatsApp
            <span className="sr-only"> de {linea.name}</span>
          </a>
        ) : null}

        {linea.chatUrl ? (
          <a
            href={linea.chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${BOTON} border`}
            style={{ ...TARJETA, color: "var(--fv-text)" }}
          >
            Chat web
            <span className="sr-only">
              {" "}
              de {linea.name} (se abre en otra pestaña)
            </span>
          </a>
        ) : null}
      </div>
    </>
  );
}

/**
 * Para quien no está en un país del catálogo: el directorio que el propio
 * catálogo declara en su entrada internacional, y NADA más de ella.
 *
 * Esa entrada no es un país. Trae además un teléfono 1-800 y unas frases en
 * inglés que ninguna pantalla ha enseñado nunca; ponerlo aquí como un botón de
 * «Llamar» para cualquier país del mundo sería estrenarlo sin que nadie haya
 * comprobado que se puede marcar desde fuera. El modal de Eco ya remite a este
 * mismo directorio, y aquí se dice lo mismo.
 */
function OtrosPaises() {
  const url = CRISIS_FALLBACK.lines.find((l) => l.chatUrl)?.chatUrl;
  if (!url) return null;

  return (
    <section aria-labelledby="titulo-otros" className="mt-8">
      <h2 id="titulo-otros" className="text-[20px]">
        Si estás en otro país
      </h2>
      <p className="mt-3 text-[16px] leading-relaxed">
        Puedes buscar una línea cercana en este directorio internacional:
      </p>
      <p className="mt-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center text-[16px] font-semibold underline underline-offset-4"
          style={{ color: "var(--fg-link-strong)" }}
        >
          {new URL(url).hostname}
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </p>
    </section>
  );
}
