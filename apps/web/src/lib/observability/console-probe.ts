/**
 * Los errores que Next ya registró.
 *
 * Next 14.2 no tiene un gancho para los errores de servidor (`onRequestError`
 * llega en la 15). Lo que sí hace, en todos los casos que no atrapa la
 * aplicación —un componente de servidor, uno anidado, una acción de servidor,
 * un manejador de ruta, una excepción o una promesa que nadie atrapó—, es
 * escribir el error con `console.error`. En el navegador, React hace lo mismo
 * con lo que atrapa una frontera de error.
 *
 * Así que esto escucha ahí. Sólo mira los argumentos que SON un error: el texto
 * que los acompaña no se lee. Y primero se escribe, como siempre: la consola de
 * quien opera el servicio no cambia.
 */
export function probeConsole(report: (error: unknown) => void): () => void {
  const original = console.error;
  const probe = (...args: unknown[]): void => {
    original.apply(console, args);
    const error = args.find(isErrorLike);
    if (error === undefined) return;
    try {
      report(error);
    } catch {
      // Quien escribe en la consola no tiene por qué enterarse.
    }
  };
  console.error = probe;
  return () => {
    // Si alguien envolvió la consola después, no se le quita lo suyo.
    if (console.error === probe) console.error = original;
  };
}

/** Un error, también si nació en otro contexto (el de Edge, por ejemplo). */
export function isErrorLike(value: unknown): value is Error {
  return (
    value instanceof Error ||
    Object.prototype.toString.call(value) === "[object Error]"
  );
}
