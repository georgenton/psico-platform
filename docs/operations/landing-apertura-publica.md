# Apertura pública de la landing — qué falta y qué no bloquea

La home de `/` implementa la referencia aprobada el 27-09-2026 con su ajuste 2.1.
Que esté construida y verificada **no la abre al público**: publicar la rama no es
desplegar, y desplegar no es abrir. Este documento fija qué condiciones bloquean esa
apertura y cuáles no, para que nadie tenga que deducirlo de una conversación.

No es una política de despliegue. Cuándo se construye Web lo decide
[web-deployment-policy.md](web-deployment-policy.md); esto es otra cosa: qué tiene que
estar resuelto antes de que la página se ofrezca a personas de fuera.

## Bloquean la apertura

### 1 · Los cinco destinos del pie no existen

El pie los marca «En preparación» y **no son enlaces**, a propósito: un `href="#"`
aparentaría navegación y publicar un documento jurídico generado como si estuviera
aprobado sería peor. Pero una web pública con estos huecos no está lista:

- [ ] **Privacidad** — documento autorizado, no generado. Es el más serio de los
      cinco: la plataforma trata diario y conversaciones cifradas de extremo a extremo
      (ADR 0007), registros de ánimo y actividad compartida. Abrir sin él es ofrecer un
      servicio que recoge datos personales sin decir cómo.
- [ ] **Términos de uso** — autorizados, con las condiciones reales.
- [ ] **Contacto** — un canal verificado que alguien atienda. La página dice hoy que
      «el canal de contacto se publicará junto con la web».
- [ ] **Sobre FeelVerse** y **Autoría y contenidos**.

Mientras falten, quedan **expresamente fuera del gate**: no se sustituyen por textos
provisionales, ni por enlaces a terceros, ni por una página vacía.

### 2 · La oferta no está decidida

Los importes de la página son los de la maqueta —hipótesis del documento de negocio— y
se muestran con «Propuesta de precios · No disponible para compra», sin pasarela y sin
pedir ningún dato. Antes de abrir cobros hacen falta las seis condiciones que la propia
página lista como «Por definir»: duración del acceso, cuota de Eco, modalidades y
participantes de Dúo y Círculos, renovación, cancelación e impuestos.

Y antes que todas ellas, **D-ORD**: un evento de suscripción viejo reentregado después
revive el plan de alguien que canceló. Está reproducido contra PostgreSQL real en
`apps/api/src/subscription/billing-events.pg-spec.ts` y sigue abierto.

D-ORD bloquea **cobros reales**, no la revisión visual ni el despliegue de una página
que no cobra.

### 3 · No hay audio ni video publicados

Ninguna obra tiene audio ni video: los archivos no están subidos. El lector ya lo dice
en su sitio («Audio en producción»), y la landing se ajustó para no prometerlos —ni en
el hero, ni en los metadatos, ni en la rejilla de formatos, ni en las preguntas—.

Esto **no bloquea** la apertura: la página es honesta sobre ello. Queda aquí para que,
cuando los archivos se suban, alguien recuerde revisar esos cuatro textos en lugar de
dejarlos desactualizados en la otra dirección.

## No bloquean

- **El catálogo de tres obras.** Es el confirmado. Dos de las tres aún no se pueden
  leer, y la página lo dice obra por obra: «Aún no disponible».
- **Dúo y Círculos.** Aparecen como piloto restringido a personas adultas, que es su
  estado real.
- **El espejo de diseño en `docs/design/`.** Es referencia versionada del repositorio,
  no superficie pública.

## Lo que sí está listo

Reflujo a 320 px, zoom al 200 %, espaciado de texto ampliado, teclado y foco, diálogos
con Escape y retorno del foco, objetivo táctil de 44×44 en los controles principales, y
los dos temas sin pérdida de estado. Se comprueba con:

```bash
node apps/web/scripts/landing/verificar.mjs http://127.0.0.1:3000
```

Construye y arranca **antes** de ejecutarlo: un servidor que sirve un build anterior al
del disco pasa las comprobaciones estáticas y falla las de interacción sin decir por
qué. La comprobación 0 del script lo detecta y lo nombra.
