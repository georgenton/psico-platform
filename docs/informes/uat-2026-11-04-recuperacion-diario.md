# La recuperación del Diario, recorrida de extremo a extremo — 2026-11-04

La frase de palabras es la **única** vía de recuperación del Diario cifrado: el
ADR 0007 no contempla ninguna otra, y el servidor no puede ayudar porque nunca
tiene la clave. Si esa vía no funciona, lo que alguien escribió se pierde sin
remedio. Hasta hoy estaba cubierta por pruebas unitarias del paquete de cripto,
que responden «la matemática cierra» — no «una persona recupera su diario
contra el servidor real».

Eso es lo que se recorrió.

## Cómo

|            |                                                                        |
| ---------- | ---------------------------------------------------------------------- |
| Entorno    | `api-staging.feelverse.app` · API `19fcc261`                           |
| Cuenta     | sintética `@psico.test`, contraseña generada y guardada en sesión      |
| Escrituras | una entrada de prueba, **retirada al terminar** (HTTP 200)             |
| Cripto     | el paquete construido del repositorio, el mismo que ejecuta el cliente |

## Los ocho pasos, y lo que acredita cada uno

| Paso                                                     | Resultado                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1 · Entrar y leer la sal que guarda el servidor          | sesión abierta · sal de 22 caracteres                                                       |
| 2 · Derivar la clave maestra de la contraseña (Argon2id) | 16 bytes en **2,2 s**                                                                       |
| 3 · Cifrar una reflexión y guardarla                     | entrada creada · el servidor recibe **sólo** ciphertext + nonce                             |
| 4 · Producir la frase y validarla                        | **12 palabras** en español · el validador la acepta                                         |
| 5 · **Olvidar la contraseña**                            | la clave y la subclave se borran de memoria; se recupera la maestra **sólo** desde la frase |
| 6 · Leer del servidor y descifrar                        | descifrada y **exacta**, carácter por carácter                                              |
| 7 · Control negativo                                     | otra frase **no** abre la entrada — el AEAD autentica                                       |
| 8 · Retirar la prueba                                    | HTTP 200                                                                                    |

**Veredicto: funciona.** El paso 5 es el que importa: la clave derivada de la
contraseña se destruye antes de intentar la recuperación, así que el paso 6 no
puede estar aprovechándola por descuido. Y sin el paso 7 el recorrido no
probaría nada: un cifrado que acepta cualquier clave «descifraría» siempre.

## Dos expectativas mías que eran falsas, y no del código

Conviene dejarlas escritas porque vienen de documentación vieja de este mismo
repositorio, y el próximo que lea el log de sesión tropezará igual.

1. **La frase es de 12 palabras, no de 24.** La clave maestra mide **16 bytes**
   por diseño —`MASTER_KEY_LEN = 16`, «128 bits = 12 palabras BIP39»,
   `MASTER_KEY_VERSION = 2`— y `masterKeyToSeedPhrase` rechaza cualquier otra
   longitud sin truncar en silencio. El log de sesión describe el diseño
   anterior de 32 bytes y 24 palabras; **manda el código**.
2. **El orden de los argumentos es `encryptString(texto, clave)`** y
   `decryptString({ciphertext, nonce}, clave)`. Invertirlo da
   `CRYPTO_INVALID_KEY_LENGTH`, que es un mensaje honesto: una cadena no es una
   clave de 32 bytes. El rechazo fue correcto; el error era del arnés.

La subclave del diario sale de `HKDF-Expand(maestra, "diary-v1")` y mide 32
bytes, que es lo que pide XChaCha20-Poly1305. Expandir 16 a 32 es correcto por
el RFC 5869 §3.3 cuando la entrada ya es pseudoaleatoria, y Argon2id la deja
así.

## Privacidad (ADR 0007 intacto)

El servidor recibió y devolvió **sólo** `textCiphertext` y `textNonce`. El texto
en claro existió únicamente en el proceso del recorrido, y la clave derivada de
la contraseña se sobrescribió con ceros antes de la recuperación. Ninguna frase
ni clave queda escrita en este informe.

## Qué no cubre

El recorrido ejercita el **contrato**: cripto real, servidor real, ida y vuelta
completa. No ejercita la **pantalla** — el formulario donde una persona escribe
sus doce palabras, sus mensajes de error y su modo de recuperación. Esa parte
tiene pruebas de interfaz y entra en la revisión visual agrupada.
