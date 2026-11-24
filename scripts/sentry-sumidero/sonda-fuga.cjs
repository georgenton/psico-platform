/**
 * Precarga del control negativo por lotes (`--fuga=…`): deja salir un señuelo a
 * propósito, en UN solo sobre.
 *
 * Lo añade al texto del error cuando los bytes ya van hacia el socket, después de
 * las dos puertas del proceso. Llega al receptor como habría llegado una fuga de
 * verdad, y lo mira la comprobación de siempre: aquí no se comprueba nada.
 */
const http = require("node:http");
const { SONDA_FUGA_MARCA: marca, SONDA_FUGA_VALOR: valor } = process.env;

if (marca && valor) {
  const original = http.ClientRequest.prototype.write;
  http.ClientRequest.prototype.write = function (trozo, ...resto) {
    let sale = trozo;
    if (/\/envelope\//.test(this.path ?? "")) {
      const texto = Buffer.from(trozo).toString("utf8");
      // La marca está en la pila: es lo que identifica de qué error es el sobre.
      if (texto.includes(marca)) {
        sale = texto.replace('"value":"', `"value":"${valor} `);
      }
    }
    return original.call(this, sale, ...resto);
  };
}
