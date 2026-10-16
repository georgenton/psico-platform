"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { OBRAS, type Obra } from "./datos";
import { desplazarA, SELECTOR_PASO_VISIBLE } from "./navegacion";

/**
 * Estado compartido de la landing.
 *
 * En la referencia esto es el objeto `S = {book, period}` de `home-f21.js`, y
 * se comparte porque dos sitios distintos lo tocan: desde la ficha de un libro,
 * «Acceso a este libro» elige la obra y lleva a Planes; y en Planes, el pase
 * muestra esa misma elección. Si cada sección guardara la suya, la elección se
 * perdería al navegar entre ellas —que es justo lo que el ajuste 2.1 pide
 * conservar.
 *
 * La apariencia vive aquí por el mismo motivo: hay dos controles, uno en el
 * menú y otro en el pie, y los dos tienen que reflejar lo mismo.
 */

export type Apariencia = "contemporary" | "renaissance";
export type Periodicidad = "mensual" | "anual";
export type ModoLibro = "leer" | "guia";

/** La microguía de muestra tiene cinco pasos: contexto → … → cierre. */
export const PASOS_GUIA = 5;

/**
 * Clave propia de la web pública.
 *
 * Es la de la referencia, a propósito: el encargo dice que esta preferencia no
 * toca el producto autenticado, que mantiene sus propios ajustes.
 */
export const CLAVE_APARIENCIA = "feelverse-web-publica:apariencia";

export const APARIENCIA_POR_OMISION: Apariencia = "contemporary";

function esApariencia(v: unknown): v is Apariencia {
  return v === "contemporary" || v === "renaissance";
}

interface EstadoLanding {
  readonly apariencia: Apariencia;
  readonly fijarApariencia: (a: Apariencia) => void;
  readonly obra: Obra | null;
  readonly fijarObra: (id: string | null) => void;
  readonly periodicidad: Periodicidad;
  readonly fijarPeriodicidad: (p: Periodicidad) => void;
  /** Lectura o modo guiado en el escenario de muestra. */
  readonly modo: ModoLibro;
  readonly paso: number;
  /**
   * Abre el escenario en un modo y, opcionalmente, en un paso.
   *
   * Vive en el estado compartido porque lo invocan sitios de toda la página —la
   * cabecera, el hero, la ficha de un libro, el cierre y el pie—, y todos
   * tienen que acabar en el mismo escenario y no cada uno en el suyo.
   */
  readonly abrirEscenario: (modo: ModoLibro, paso?: number) => void;
  readonly fijarPaso: (paso: number) => void;
}

const Contexto = createContext<EstadoLanding | null>(null);

export function ProveedorLanding({ children }: { children: ReactNode }) {
  // El atributo `data-theme` del envoltorio NO está enlazado a React: lo fija
  // el script en línea antes de pintar y lo cambia `fijarApariencia`, igual que
  // en la referencia. Enlazarlo sería pedir problemas — el HTML servido dice
  // siempre «contemporary», así que al hidratar React podría revertir la
  // preferencia que el script acababa de aplicar. Aquí el estado sólo sirve
  // para saber qué botón va marcado y para redibujar el radar, que lee sus
  // colores de variables CSS y cambia con el tema.
  const [apariencia, setApariencia] = useState<Apariencia>(
    APARIENCIA_POR_OMISION,
  );
  const [obraId, setObraId] = useState<string | null>(null);
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>("mensual");
  const [modo, setModo] = useState<ModoLibro>("guia");
  const [paso, setPaso] = useState(0);

  // Al montar, el estado se pone de acuerdo con lo que ya está aplicado.
  //
  // El orden importa: primero el atributo del envoltorio, que es lo que el
  // script en línea acaba de fijar y por tanto lo que se está viendo; y sólo si
  // ahí no hay nada válido, lo guardado. Leer primero el almacenamiento podría
  // discrepar de lo pintado. No depende de `apariencia` a propósito: corre una
  // vez y a partir de entonces manda `fijarApariencia`.
  useEffect(() => {
    const aplicada = document.getElementById("fh")?.getAttribute("data-theme");
    if (esApariencia(aplicada)) {
      setApariencia(aplicada);
      return;
    }
    try {
      const guardada = window.localStorage.getItem(CLAVE_APARIENCIA);
      if (esApariencia(guardada)) setApariencia(guardada);
    } catch {
      // Sin almacenamiento —ventana privada, permisos— se queda la de omisión.
    }
  }, []);

  const fijarApariencia = useCallback((a: Apariencia) => {
    document.getElementById("fh")?.setAttribute("data-theme", a);
    setApariencia(a);
    try {
      window.localStorage.setItem(CLAVE_APARIENCIA, a);
    } catch {
      // Guardar es un extra: la página funciona igual sin poder recordarlo.
    }
  }, []);

  const fijarObra = useCallback((id: string | null) => {
    setObraId(id);
  }, []);

  const fijarPaso = useCallback((p: number) => {
    setPaso(Math.max(0, Math.min(PASOS_GUIA - 1, p)));
  }, []);

  const abrirEscenario = useCallback(
    (m: ModoLibro, p?: number) => {
      setModo(m);
      if (typeof p === "number") fijarPaso(p);
      desplazarA("#guiado", m === "leer" ? "#rd-t" : SELECTOR_PASO_VISIBLE);
    },
    [fijarPaso],
  );

  const valor = useMemo<EstadoLanding>(
    () => ({
      apariencia,
      fijarApariencia,
      obra: obraId ? (OBRAS.find((o) => o.id === obraId) ?? null) : null,
      fijarObra,
      periodicidad,
      fijarPeriodicidad: setPeriodicidad,
      modo,
      paso,
      abrirEscenario,
      fijarPaso,
    }),
    [
      apariencia,
      fijarApariencia,
      obraId,
      fijarObra,
      periodicidad,
      modo,
      paso,
      abrirEscenario,
      fijarPaso,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useLanding(): EstadoLanding {
  const v = useContext(Contexto);
  if (!v) throw new Error("useLanding fuera de ProveedorLanding");
  return v;
}

/**
 * Aplica la apariencia guardada ANTES de que el navegador pinte.
 *
 * Va inmediatamente después de la etiqueta de apertura del envoltorio: el
 * analizador es síncrono, así que cuando este script corre el elemento ya
 * existe y el pintado todavía no ha ocurrido. Sin esto, quien eligió
 * Renacimiento vería un destello de Contemporary en cada carga.
 *
 * No hay CSP con nonce en esta ruta: la estricta se aplica sólo a Círculos.
 */
export function AparienciaSinDestello() {
  const codigo =
    `try{var t=localStorage.getItem(${JSON.stringify(CLAVE_APARIENCIA)});` +
    `if(t==="renaissance"||t==="contemporary"){` +
    `document.getElementById("fh").setAttribute("data-theme",t)}}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: codigo }} />;
}
