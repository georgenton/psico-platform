import { registerDecorator, type ValidationOptions } from "class-validator";

import {
  passwordPolicyMessage,
  passwordPolicyProblem,
} from "@psico/types";

/**
 * Valida una contraseña NUEVA contra la política compartida.
 *
 * Sustituye al par `@MinLength(8) @MaxLength(72)` que llevaban los DTO, y no
 * es un cambio cosmético: `@MaxLength` cuenta **caracteres** mientras bcrypt
 * ignora todo lo que pase de 72 **bytes**. Con ASCII coinciden y nadie lo
 * nota; con acentos o emoji, no. La política comprueba bytes y rechaza, en
 * vez de dejar que el verificador trunque en silencio.
 *
 * Sólo para contraseñas nuevas. La comprobación de una contraseña EXISTENTE
 * —iniciar sesión, confirmar la actual antes de cambiarla— no pasa por aquí:
 * aplicarle el mínimo nuevo dejaría fuera de su cuenta a quien se registró
 * bajo la regla anterior.
 */
export function IsNewPassword(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isNewPassword",
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return (
            typeof value === "string" && passwordPolicyProblem(value) === null
          );
        },
        defaultMessage(args) {
          const v = args?.value;
          if (typeof v !== "string") return "La contraseña es obligatoria.";
          const problem = passwordPolicyProblem(v);
          return problem
            ? passwordPolicyMessage(problem)
            : "La contraseña no cumple la política.";
        },
      },
    });
  };
}
