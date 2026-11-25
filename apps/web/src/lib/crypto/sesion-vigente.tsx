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
 * CÓMO. Cada panel escribe una marca de su cuenta en `localStorage` cuando el
 * servidor la CONFIRMA, y el acceso y el registro la mueven a un valor que no es
 * de nadie: al abrirse y, otra vez, en cuanto vuelve lo que enviaron. Las demás
 * pestañas reciben el evento `storage`; si la marca ya no es la suya dejan de
 * entregar claves y preguntan. Además se compara al volver a la pestaña, porque
 * una congelada o recuperada con «atrás» no recibe eventos. Y lo que no puede
 * depender de que otra pestaña avise —juntar la llave del panel con el token de
 * una pantalla— se compara en la propia pantalla (`SoloDeEstaCuenta`).
 *
 * AL MONTAR, LA IDENTIDAD ESTÁ PENDIENTE. El panel que llega trae en su HTML la
 * cuenta que tenía la sesión al pedirlo, y pudo tardar: sólo una marca que ya es
 * la suya —escrita por otra pestaña confirmada— la da por buena sin preguntar.
 * Sin marca, o con otra, no se entregan claves, no se abre la reja, no se toca
 * lo guardado en el dispositivo y no se anuncia nada hasta que el servidor diga.
 * Que la respuesta tarde, falle o se reintente no cambia eso. Reproducido con la
 * aplicación entera: B en el onboarding, una pestaña tardía de A escribía su
 * marca, se abría sola, y lo escrito quedaba en B bajo la llave de A.
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
 *
 * Una respuesta vale para el momento en que se preguntó. Si la marca se movió
 * mientras tanto, se vuelve a preguntar antes de creerla.
 *
 * Y la pregunta NO se corta: puede llevar dentro la renovación del token, y
 * abandonarla perdería las cookies nuevas, con lo que la siguiente usaría un
 * refresco ya gastado y cerraría una sesión buena. Esperar cerrada es seguro.
 */

const CLAVE_MARCA = "psico:cuenta";
const RUTA = "/dashboard/cuenta-vigente";
/** Cada cuánto se vuelve a preguntar si no hubo respuesta. */
const REINTENTO_MS = 5_000;

const SesionVigenteContext = createContext(true);
/** La cuenta del panel. null: sin panel por encima, o no se sabe de quién es. */
const MarcaDelPanelContext = createContext<string | null>(null);

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
  try {
    const res = await porTurno(() =>
      fetch(RUTA, {
        cache: "no-store",
        credentials: "same-origin",
        // El middleware contesta con una redirección cuando no hay sesión.
        redirect: "manual",
      }),
    );
    if (res.type === "opaqueredirect") return null;
    if (!res.ok) return undefined;
    const cuerpo = (await res.json()) as { marca?: unknown };
    if (cuerpo.marca === null) return null;
    return typeof cuerpo.marca === "string" ? cuerpo.marca : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Las pestañas preguntan de una en una. A la vez, con el token vencido, cada una
 * renovaría el mismo refresco y todas menos la primera lo encontrarían gastado.
 */
async function porTurno(pregunta: () => Promise<Response>): Promise<Response> {
  // Sin ello —un navegador viejo, o una página sin HTTPS— se pregunta igual.
  const turnos: LockManager | undefined = navigator.locks;
  return turnos ? await turnos.request(CLAVE_MARCA, pregunta) : pregunta();
}

export function SesionVigenteProvider({
  marca,
  children,
}: {
  /** null: no se sabe de quién es la sesión, y entonces no se vigila nada. */
  marca: string | null;
  children: React.ReactNode;
}) {
  // Pendiente desde el primer render, y no desde el primer efecto: los hijos
  // corren los suyos antes, y uno de ellos restaura la llave recordada.
  const [vigente, setVigente] = useState(marca === null);

  useEffect(() => {
    if (marca === null) return;

    let vigilando = true;
    let enDuda = leerMarca() !== marca;
    let preguntando = false;
    let seMovio = false;
    let reintento: ReturnType<typeof setTimeout> | undefined;

    // Siempre con todo cerrado: sólo se llega aquí en duda.
    const preguntar = async () => {
      preguntando = true;
      seMovio = false;
      clearTimeout(reintento);
      const vista = leerMarca();

      const dicha = await marcaDelServidor();
      preguntando = false;
      if (!vigilando) return;

      if (dicha === undefined) {
        reintento = setTimeout(() => void preguntar(), REINTENTO_MS);
      } else if (dicha !== marca) {
        // Otra cuenta, o ninguna. Una carga nueva y no un refresco: se lleva la
        // memoria de esta pestaña, y ninguna navegación la puede descartar.
        window.location.replace("/dashboard");
      } else if (seMovio || leerMarca() !== vista) {
        // Contestó de antes: entretanto alguien más entró o salió.
        void preguntar();
      } else {
        enDuda = false;
        // Si ya no se puede escribir, no se vuelve a comparar: daría siempre no.
        if (!escribirMarca(marca)) vigilando = false;
        setVigente(true);
      }
    };
    const comparar = () => {
      if (!vigilando) return;
      if (!enDuda && leerMarca() === marca) return;
      enDuda = true;
      setVigente(false);
      if (!preguntando) void preguntar();
    };
    const alGuardar = (e: StorageEvent) => {
      // `key` null es un `clear()`: se lo llevó todo, la marca incluida.
      if (e.key !== CLAVE_MARCA && e.key !== null) return;
      seMovio = true;
      comparar();
    };
    window.addEventListener("storage", alGuardar);
    window.addEventListener("focus", comparar);
    window.addEventListener("pageshow", comparar);
    document.addEventListener("visibilitychange", comparar);

    if (enDuda) void preguntar();
    else setVigente(true);

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
    <MarcaDelPanelContext.Provider value={marca}>
      <SesionVigenteContext.Provider value={vigente}>
        {children}
      </SesionVigenteContext.Provider>
    </MarcaDelPanelContext.Provider>
  );
}

/**
 * Una pantalla que llegó con la sesión de otra cuenta no se monta.
 *
 * App Router conserva el panel al navegar y trae sólo la pantalla, con el token
 * de quien tenga la sesión al pedirla. El aviso de las demás pestañas no basta
 * para que la llave del panel no se junte con un token ajeno: llega cuando la
 * página que entró consigue ejecutar su código, y su respuesta puede quedarse
 * parada después de haber dejado ya la cookie. Reproducido reteniéndola justo
 * ahí: la marca seguía siendo la de A y lo escrito quedaba en B.
 *
 * Aquí se comparan las dos cosas que se van a juntar, sin esperar a nadie. Si no
 * son de la misma cuenta se carga de nuevo, que es lo que decide el servidor.
 */
export function SoloDeEstaCuenta({
  marca,
  children,
}: {
  /** De quién era la sesión cuando se pidió esta pantalla. */
  marca: string | null;
  children: React.ReactNode;
}) {
  const delPanel = useContext(MarcaDelPanelContext);
  const ajena = marca !== null && delPanel !== null && marca !== delPanel;

  useEffect(() => {
    if (ajena) window.location.reload();
  }, [ajena]);

  return ajena ? null : <>{children}</>;
}

/**
 * Un valor que no es la marca de nadie y no se repite. Se escribe en vez de
 * borrar: borrar lo que ya no está no se nota, y una respuesta de antes pasaría
 * por buena.
 */
function moverMarca(): void {
  const unico = `nadie:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    window.localStorage.setItem(CLAVE_MARCA, unico);
  } catch {
    // Sin almacenamiento no hay marca que mover.
  }
}

/**
 * En el acceso y el registro, que sólo se alcanzan SIN sesión —el middleware
 * devuelve al panel a quien la tiene—. Las otras pantallas de `(auth)` se abren
 * también con sesión, así que ahí no va: cerraría el Diario de las demás
 * pestañas por abrir el enlace de verificación.
 */
export function RetirarMarcaDeCuenta() {
  useEffect(() => {
    moverMarca();
  }, []);
  return null;
}

/**
 * Envía un acceso —entrar, registrarse, Google— y deja pendiente la identidad de
 * las demás pestañas en cuanto vuelve, ANTES de navegar y sin preguntar nada.
 *
 * EL FALLO QUE ESTO IMPIDE. Un acceso enviado sin sesión puede volver cuando en
 * otro formulario ya entró A y abrió su Diario. La respuesta trae la cookie de B
 * y la marca sigue siendo la de A. Antes se preguntaba al salir del formulario y
 * sólo entonces se movía: si la pregunta tardaba o fallaba, la marca se quedaba;
 * y si lo que tardaba era el destino, ni siquiera se preguntaba, porque el
 * formulario seguía montado. Reproducido con la aplicación entera: lo que A
 * escribía quedaba en la cuenta de B bajo la llave de A.
 *
 * Aquí no se pregunta de quién es la sesión: eso lo hace cada panel, protegido y
 * con sus reintentos. Sólo un rechazo claro —`{ error }`— deja la marca, porque
 * entonces no se abrió ninguna sesión. Si la acción lanza no se sabe, y se mueve.
 *
 * Y si la página se va con el envío en el aire, también: ya no habrá quién avise.
 */
export async function enviarAcceso<R extends { error: string } | undefined>(
  enviar: () => Promise<R>,
): Promise<R> {
  let rechazado = false;
  window.addEventListener("pagehide", moverMarca);
  try {
    const r = await enviar();
    rechazado = Boolean(r?.error);
    return r;
  } finally {
    window.removeEventListener("pagehide", moverMarca);
    if (!rechazado) moverMarca();
  }
}
