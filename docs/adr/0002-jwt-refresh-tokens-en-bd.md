# ADR 0002 — JWT con refresh tokens almacenados en base de datos

**Fecha:** 2026-04-26  
**Estado:** Aceptado  
**Autores:** Jorge Quizamanchuro

---

## Contexto

Psico Platform necesita un mecanismo de autenticación que equilibre seguridad, experiencia de usuario y complejidad de implementación. Los usuarios interactúan con contenido de salud mental sensible, por lo que el control de sesiones es un requisito de producto, no solo técnico.

Se evaluaron tres enfoques:

| Enfoque                           | Descripción                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| **A — Sesiones server-side**      | Token opaco almacenado en Redis; el servidor valida en cada request                             |
| **B — JWT stateless puro**        | Access token de larga duración (ej. 7 días); sin refresh token                                  |
| **C — JWT + refresh token en BD** | Access token corto (15 min) + refresh token de larga duración almacenado hasheado en PostgreSQL |

---

## Decisión

Adoptamos el **Enfoque C**: JWT de corta duración + refresh tokens persistidos en base de datos como hashes SHA-256.

### Flujo de autenticación

```
1. POST /auth/login
   → Servidor valida credenciales
   → Genera access token JWT (15 min) + refresh token aleatorio (64 bytes)
   → Almacena SHA-256(refresh token) en tabla RefreshToken
   → Devuelve ambos tokens al cliente

2. Cada request autenticado
   → Cliente envía access token en header Authorization: Bearer <token>
   → Servidor valida firma JWT (sin consulta a BD)

3. POST /auth/refresh (cuando access token expira)
   → Cliente envía refresh token
   → Servidor calcula SHA-256(refresh token recibido)
   → Busca en BD el hash; verifica que no esté revocado ni expirado
   → Emite nuevos access + refresh tokens (rotación de token)
   → Revoca el refresh token usado (revokedAt = now())

4. POST /auth/logout
   → Servidor revoca el refresh token activo del cliente
   → El access token expira naturalmente (máx. 15 min)
```

### Por qué SHA-256 del refresh token (no plaintext, no bcrypt)

- **No plaintext:** si la BD se filtra, los tokens en texto plano permiten secuestrar todas las sesiones activas sin conocer el password.
- **No bcrypt:** bcrypt está diseñado para passwords cortos y predecibles (fuerza bruta feasible). Un refresh token de 64 bytes aleatorios tiene ~512 bits de entropía — no existe diccionario útil para atacarlo. SHA-256 es suficiente y órdenes de magnitud más rápido.
- **SHA-256:** determinista, colisión-resistente, suficiente para tokens de alta entropía generados con `crypto.randomBytes`.

---

## Consecuencias

### Positivas

- **Revocación inmediata:** cambio de password, suspensión por pago vencido, o "cerrar todas las sesiones" son O(1) — se marcan los tokens como revocados en BD.
- **Visibilidad de sesiones activas:** la tabla `RefreshToken` almacena `userAgent` e `ipAddress`, lo que permite mostrar al usuario sus dispositivos conectados (feature de alto valor en apps de salud).
- **Stateless para requests normales:** el access token de 15 min no requiere consulta a BD en cada request, manteniendo la escalabilidad horizontal.
- **Rotación de tokens:** cada refresh emite un token nuevo y revoca el anterior, limitando la ventana de explotación si un token es interceptado.

### Negativas / trade-offs

- **Una consulta a BD por refresh:** cada vez que el access token expira (cada 15 min en uso activo), hay una consulta a PostgreSQL. Aceptable para la escala actual.
- **Complejidad de implementación:** mayor que JWT stateless puro. Mitigado porque es un patrón bien documentado y esta misma implementación servirá para toda la vida del producto.
- **No se invalida el access token antes de su expiración natural:** si un access token de 15 min es robado, el atacante tiene hasta 15 min de ventana. Aceptable para el nivel de riesgo del producto (no es banca).

---

## Alternativas descartadas

**Enfoque A (sesiones en Redis):** Requiere que Redis esté disponible en cada request autenticado. Agrega una dependencia de disponibilidad crítica y complica el despliegue. El patrón JWT + refresh token da las mismas garantías de revocación con menos acoplamiento.

**Enfoque B (JWT stateless puro):** Inaceptable para este producto. No hay forma de revocar un token antes de su expiración. Un token robado o una cuenta suspendida seguiría siendo válida por días.

---

## Referencias

- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [RFC 6749 — OAuth 2.0 Token Refresh](https://datatracker.ietf.org/doc/html/rfc6749#section-6)
