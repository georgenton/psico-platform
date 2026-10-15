const compartido = require("@psico/eslint-config");

/**
 * El config compartido, más las excepciones que son del repositorio y no de
 * los paquetes publicables.
 *
 * @type {import("eslint").Linter.Config}
 */
module.exports = {
  ...compartido,
  overrides: [
    ...(compartido.overrides ?? []),
    {
      // `apps/api/test/**` se carga con `node --require`, y ese mecanismo sólo
      // acepta CommonJS: un `import` ahí no se puede preargar. No es una
      // preferencia de estilo que se pueda ceder, así que la excepción se
      // declara aquí —acotada por ruta— en vez de silenciar la regla línea a
      // línea en el archivo, donde se perdería el motivo.
      //
      // Esta carpeta queda además fuera de `src/`, que es lo único que compila
      // el build, de modo que nada de aquí viaja a producción.
      files: ["apps/api/test/**/*.js"],
      rules: {
        "@typescript-eslint/no-var-requires": "off",
      },
    },
  ],
};
