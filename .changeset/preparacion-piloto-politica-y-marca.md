---
"@psico/types": minor
"@psico/api-client": patch
---

Tres datos que estaban repetidos pasan a tener una sola fuente, y el cliente
se regenera contra el contrato que resulta.

**`password-policy`** — había cuatro mínimos para la misma pregunta (8 en
registro, 8 en restablecer, 8 en cambio, 10 en recifrado). Ahora uno, de 15
caracteres, sin reglas de composición. El tope se mide en **bytes**, no en
caracteres, que es donde bcrypt trunca: cuarenta «ñ» son 40 caracteres y 80
bytes, pasaban la validación, y el verificador se quedaba callado con los
primeros 72. Donde más importaba era el recifrado, porque la misma contraseña
alimenta bcrypt (72 bytes) y Argon2id (sin tope), así que una más larga habría
derivado la clave del diario de la cadena entera y el hash de acceso sólo de
su prefijo. Las contraseñas existentes siguen entrando: la política no se
consulta al verificar.

**`data-export-scope`** — lo que la exportación trae y lo que no, en palabras
que una persona entienda, atado por una prueba al inventario real de modelos.

**`brand`** — el nombre del producto. Eco se presentaba con el anterior, y el
armazón de los correos lo llevaba en cabecera, título y pie, incluido el de
restablecimiento de contraseña.

En `@psico/api-client`, `generated.ts` pierde los `minLength`/`maxLength` de
los cuatro campos de contraseña, porque la validación dejó de ser declarativa,
y sus descripciones dejan de anunciar límites que ya no rigen.
