"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * ¿La sesión del navegador sigue siendo la de la persona que abrió ESTA pestaña?
 *
 * EL FALLO QUE ESTO IMPIDE. La cookie de sesión es del navegador entero; el
 * panel, de cada pestaña. Si en otra se sale y se entra con otra cuenta, ésta no
 * se entera: sigue enseñando lo descifrado y conserva las claves. Y no hace falta
 * que refresque nada para que sea grave: App Router conserva el layout al
 * navegar, así que ir a Eco y volver trae las entradas y el token de la segunda
 * cuenta bajo las claves de la primera. Reproducido en un navegador: lo escrito
 * ahí quedaba en la cuenta B y sólo se abría con la clave de A.
 *
 * CÓMO. Cada panel escribe al montarse una marca de su cuenta en `localStorage`,
 * y el acceso y el registro la retiran. Las demás pestañas reciben el evento
 * `storage`; si la marca ya no es la suya dejan de entregar claves y preguntan.
 * Además se compara al volver a la pestaña, porque una congelada o recuperada
 * con «atrás» no recibe eventos.
 *
 * La marca es un resumen corto del identificador de la cuenta, calculado en el
 * servidor (`lib/marca-de-cuenta.server.ts`). No es un secreto ni autoriza nada:
 * sólo permite preguntar «¿es la misma?». No hay nada legible de la persona en
 * el almacenamiento.
 *
 * QUIÉN DECIDE. El servidor, siempre, y se le pregunta DIRECTAMENTE
 * (`/dashboard/cuenta-vigente`). Antes se refrescaba el layout y se daba por
 * contestado cuando la transición acababa, y no es lo mismo: en Next una
 * navegación descarta el refresco que aún espera su primer byte, la transición
 * termina igual y nadie había contestado nada. Reproducido: volver a la pestaña
 * pulsando un enlace dejaba la sesión de B dada por buena bajo el panel de A.
 *
 * Una marca distinta no prueba que la sesión cambiara —puede haberla escrito
 * tarde una pestaña que aún estaba cargando—. Si el servidor dice que sigue
 * siendo ésta, se recupera la marca y se sigue; lo que se pierde es teclear la
 * contraseña una vez. Si es otra, o ninguna, la pestaña se va: una carga nueva,
 * que no deja nada de la anterior en memoria. Y si no contesta, sigue cerrada
 * hasta que lo haga.
 */

const CLAVE_MARCA = "psico:cuenta";
const RUTA = "/dashboard/cuenta-vigente";
/** Cada cuánto se vuelve a preguntar si no hubo respuesta. */
const REINTENTO_MS = 5_000;
/** Una pregunta que no contesta no puede dejar la pestaña esperando siempre. */
const ESPERA_MS = 10_000;

const SesionVigenteContext = createContext(true);

/** Sin proveedor por encima, la respuesta es sí: no hay con quién compararse. */
export function useSesionVigente(): boolean {
  return useContext(SesionVigenteContext);
}

function leerMarca(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_MARCA);
  } catch {
    return null;
  }
}

/** Escribe la marca y dice si quedó. Sin almacenamiento no hay qué comparar. */
function escribirMarca(marca: string): boolean {
  try {
    window.localStorage.setItem(CLAVE_MARCA, marca);
  } catch {
    // Modo privado o cuota: se contesta con lo que haya quedado de verdad.
  }
  return leerMarca() === marca;
}

/**
 * La marca de la sesión según el servidor; `null` si no hay sesión, y
 * `undefined` si no se pudo saber, que es otra cosa y no abre nada.
 */
async function marcaDelServidor(): Promise<string | null | undefined> {
  const corte = new AbortController();
  const limite = setTimeout(() => corte.abort(), ESPERA_MS);
  try {
    const res = await fetch(RUTA, {
      cache: "no-store",
      credentials: "same-origin",
      // El middleware contesta con una redirección cuando no hay sesión.
      redirect: "manual",
      signal: corte.signal,
    });
    if (res.type === "opaqueredirect") return null;
    if (!res.ok) return undefined;
    const cuerpo = (await res.json()) as { marca?: unknown };
    if (cuerpo.marca === null) return null;
    return typeof cuerpo.marca === "string" ? cuerpo.marca : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(limite);
  }
}

export function SesionVigenteProvider({
  marca,
  children,
}: {
  /** null: no se sabe de quién es la sesión, y entonces no se vigila nada. */
  marca: string | null;
  children: React.ReactNode;
}) {
  const [vigente, setVigente] = useState(true);

  useEffect(() => {
    if (marca === null || !escribirMarca(marca)) return;

    let vigilando = true;
    let enDuda = false;
    let preguntando = false;
    let reintento: ReturnType<typeof setTimeout> | undefined;

    const preguntar = async () => {
      preguntando = true;
      enDuda = true;
      setVigente(false);

      const dicha = await marcaDelServidor();
      preguntando = false;
      if (!vigilando) return;

      if (dicha === undefined) {
        reintento = setTimeout(comparar, REINTENTO_MS);
      } else if (dicha === marca) {
        enDuda = false;
        // Si ya no se puede escribir, no se vuelve a comparar: daría siempre no.
        if (!escribirMarca(marca)) vigilando = false;
        setVigente(true);
      } else {
        // Otra cuenta, o ninguna. Una carga nueva y no un refresco: se lleva la
        // memoria de esta pestaña, y ninguna navegación la puede descartar.
        window.location.replace("/dashboard");
      }
    };
    const comparar = () => {
      if (!vigilando || preguntando) return;
      if (enDuda || leerMarca() !== marca) void preguntar();
    };
    const alGuardar = (e: StorageEvent) => {
      // `key` null es un `clear()`: se lo llevó todo, la marca incluida.
      if (e.key === CLAVE_MARCA || e.key === null) comparar();
    };
    window.addEventListener("storage", alGuardar);
    window.addEventListener("focus", comparar);
    window.addEventListener("pageshow", comparar);
    document.addEventListener("visibilitychange", comparar);
    return () => {
      vigilando = false;
      clearTimeout(reintento);
      window.removeEventListener("storage", alGuardar);
      window.removeEventListener("focus", comparar);
      window.removeEventListener("pageshow", comparar);
      document.removeEventListener("visibilitychange", comparar);
    };
  }, [marca]);

  return (
    <SesionVigenteContext.Provider value={vigente}>
      {children}
    </SesionVigenteContext.Provider>
  );
}

/**
 * En el acceso y el registro, que sólo se alcanzan SIN sesión —el middleware
 * devuelve al panel a quien la tiene—. Las otras pantallas de `(auth)` se abren
 * también con sesión, así que ahí no va: cerraría el Diario de las demás
 * pestañas por abrir el enlace de verificación.
 */
export function RetirarMarcaDeCuenta() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(CLAVE_MARCA);
    } catch {
      // Sin almacenamiento no hay marca que retirar.
    }
  }, []);
  return null;
}
