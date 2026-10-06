# FeelVerse Mobile — entornos

## El problema que esto resuelve

`apps/mobile/.env` existe en la máquina de cada quien, no está versionado, y hoy
apunta a la **API de Railway**, que es infraestructura congelada de producción
([ADR 0024](../../docs/adr/0024-migracion-a-coolify-syntavera.md)). Eso quiere
decir que la forma por defecto de arrancar la app —`pnpm start`— era también la
forma de hacer QA contra producción, y nada en pantalla lo decía.

La respuesta natural, editar `.env` entre sesiones, convierte la pregunta «¿a qué
API estoy hablando?» en «a lo que escribí la última vez y olvidé».

## Correr contra Coolify staging

```bash
pnpm --filter @psico/mobile start:staging
# o, desde la raíz:
pnpm mobile:staging
```

Imprime su postura antes de arrancar y no imprime nada sensible:

```
  environment: staging
  api origin:  https://api-staging.feelverse.app
  web origin:  https://staging.feelverse.app
  (profile values apply to this run only — .env is untouched)
```

Acepta argumentos de Expo detrás de `--`:

```bash
pnpm --filter @psico/mobile start:staging -- --android
pnpm --filter @psico/mobile start:staging -- --ios --clear
```

### Tu `.env` no se toca

El wrapper lanza Expo con las variables del perfil en el entorno **del proceso
hijo**. Verificado contra el `@expo/env@0.4.2` instalado: guarda
`userDefinedEnvironment = {...process.env}` y una clave ya presente ahí **no la
sobrescribe** ningún fichero `.env`. Así que el perfil gana, tu `.env` nunca se
lee ni se escribe, y cualquier variable que el perfil **no** declare sigue
viniendo de tu `.env` como siempre.

No se persiste nada: ningún fichero escrito, ningún valor exportado a tu shell.

### Por qué no hay `.env.staging`

Expo no lo cargaría. Su modo de dotenv sale de `NODE_ENV` y está restringido a
`development | test | production`; «staging» no es un modo, y forzarlo registra
_«non-conventional and might cause development code to run in production»_.
Además `.gitignore` cubre `.env`, `.env.local`, `.env.*.local`,
`.env.development` y `.env.production` pero **no** `.env.staging`, así que el
fichero quedaría a un `git add -A` de acabar commiteado.

## Identidad del entorno

`EXPO_PUBLIC_APP_ENV` es `development | staging | production`. Es la identidad
**de la app**, no de una plataforma de hosting: Sentry tomaba su `environment`
de `EXPO_PUBLIC_VERCEL_ENV`, que es un detalle de despliegue de una plataforma
donde este cliente no corre y que hoy es un respaldo congelado.

Ausente, equivale a `development`, que es la postura con **menos** poderes: la
única que admite `http` o una dirección de LAN, y la que no afirma nada sobre
qué base de datos alcanza. El perfil de staging pone la variable
explícitamente, así que «sin definir» nunca puede significar «staging».

## Contrato de la URL de la API

Un solo sitio parsea y valida: [`src/config/environment.ts`](src/config/environment.ts).
Antes se leía `EXPO_PUBLIC_API_URL` en tres lugares, cada uno con su propio
`?? ""` — y con la variable sin definir la app arrancaba normal y luego fallaba
cada petición como un error de red opaco, porque React Native no tiene origen de
documento contra el que resolver una URL relativa.

|                  | staging                                  | production               | development                       |
| ---------------- | ---------------------------------------- | ------------------------ | --------------------------------- |
| requerida        | sí                                       | sí                       | sí                                |
| esquema          | solo `https`                             | solo `https`             | `http` o `https`                  |
| host             | **fijado** a `api-staging.feelverse.app` | explícito, sin fijar aún | cualquiera, incl. `localhost`/LAN |
| Railway / Vercel | **rechazado**                            | **rechazado**            | permitido                         |
| path (`/api`)    | rechazado                                | rechazado                | rechazado                         |
| barra final      | normalizada                              | normalizada              | normalizada                       |

El segmento `/api` lo añade el cliente compartido (`apiClient.configure`), así
que incluirlo aquí produce `/api/api` y un 404 que se lee como un endpoint que
falta.

## Producción: falla cerrada, a propósito

No hay perfil de producción todavía. Coolify production no tiene dominio, y la
única API de producción que existe hoy es el host congelado de Railway; apuntar
un perfil móvil ahí convertiría un respaldo deliberado en un destino. El perfil
existe y se niega con esa explicación, que es más honesto que no tenerlo.

Cuando Coolify production tenga dominio: rellenar `PROFILES.production` en
[`scripts/start-profile.mjs`](scripts/start-profile.mjs) y fijar el host en
`environment.ts` como está fijado staging.

## Deuda conocida

- **El CI no empaqueta esta app.** `ci.yml` excluye mobile del `build` («built
  via EAS»), así que Metro nunca se ejercita y un hueco de dependencias puede
  sobrevivir a la revisión — es exactamente lo que pasó con `@babel/runtime`,
  que está en el store de pnpm pero no lo declaraba ningún `package.json`, así
  que la app **no empaquetaba en absoluto**.
- **Versiones desalineadas con el SDK 52.** Expo avisa de `expo-router@3.5.24`
  (espera `~4.0.22`), `@expo/metro-runtime@3.2.3` (`~4.0.1`),
  `react-native@0.76.1` (`0.76.9`) y `expo-status-bar@1.12.1` (`~2.0.1`).
  Alinearlas puede cambiar comportamiento y merece su propio trabajo.
- **`lint` solo cubre `app/`**, no `src/`, así que `src/config/` no se lintea.
- **Sin EAS.** No hay `eas.json` versionado y este ciclo no lo añade: aporta
  valor para builds instalables, ninguno para un `expo start` local, y sumaría
  una dependencia de servicio a lo que se quiere mantener simple.
