"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

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
 * `storage`; si la marca ya no es la suya dejan de entregar claves y refrescan
 * el layout. Además se compara al volver a la pestaña, porque una congelada o
 * recuperada con «atrás» no recibe eventos.
 *
 * La marca es un resumen corto del identificador de la cuenta, calculado en el
 * servidor (`lib/marca-de-cuenta.server.ts`). No es un secreto ni autoriza nada:
 * sólo permite preguntar «¿es la misma?». No hay nada legible de la persona en
 * el almacenamiento.
 *
 * QUIÉN DECIDE. El servidor, siempre. Una marca distinta no prueba que la sesión
 * cambiara —puede haberla escrito tarde una pestaña que aún estaba cargando—,
 * así que aquí sólo se cierra y se pregunta: si tras refrescar el layout sigue
 * diciendo que la cuenta es ésta, se vuelve a escribir la marca y se sigue. Lo
 * que se pierde en ese caso es teclear la contraseña una vez.
 */

const CLAVE_MARCA = "psico:cuenta";

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

export function SesionVigenteProvider({
  marca,
  children,
}: {
  /** null: no se sabe de quién es la sesión, y entonces no se vigila nada. */
  marca: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // Por referencia: volver a correr el efecto de abajo reescribe la marca, y eso
  // sólo puede pasar cuando la marca cambia.
  const routerRef = useRef(router);
  routerRef.current = router;
  const [vigente, setVigente] = useState(true);
  const [refrescando, refrescar] = useTransition();
  const preguntado = useRef(false);

  useEffect(() => {
    if (marca === null || !escribirMarca(marca)) return;

    const comparar = () => {
      if (preguntado.current || leerMarca() === marca) return;
      preguntado.current = true;
      setVigente(false);
      refrescar(() => routerRef.current.refresh());
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
      window.removeEventListener("storage", alGuardar);
      window.removeEventListener("focus", comparar);
      window.removeEventListener("pageshow", comparar);
      document.removeEventListener("visibilitychange", comparar);
    };
  }, [marca]);

  // El refresco terminó y seguimos aquí: el servidor dice que la sesión es la de
  // esta marca —la misma, o la que acaba de traer—. Sin sesión, el middleware ya
  // nos habría sacado. Si no se pudo escribir, no se vuelve a comparar.
  useEffect(() => {
    if (refrescando || marca === null || !preguntado.current) return;
    preguntado.current = !escribirMarca(marca);
    setVigente(true);
  }, [refrescando, marca]);

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
