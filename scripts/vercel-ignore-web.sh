#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Vercel no vuelve a construir Web. Nunca.
#
# FeelVerse se aloja, ejecuta y despliega EXCLUSIVAMENTE en OVH con Coolify,
# en staging y en producción. Vercel y Railway quedan retiradas del plan
# operativo: no son destino de despliegue, ni de pruebas alojadas, ni de
# contingencia, ni de retorno a una versión anterior.
#
# Este guión es el ÚNICO control de esa decisión que vive en el repositorio.
# Vercel lo ejecuta como Ignored Build Step, declarado en `apps/web/vercel.json`,
# y su respuesta cancela el deployment antes de instalar nada.
#
# CÓDIGOS DE SALIDA — LA POLARIDAD SIGUE SIENDO LO ÚNICO QUE NO SE PUEDE
# EQUIVOCAR, y ahora sólo se usa una de las dos:
#
#   exit 0  →  Vercel ABORTA el build. El deployment queda CANCELED.  ← siempre
#   exit 1  →  Vercel CONSTRUYE.                                      ← nunca
#
# Es al revés de lo que sugiere «0 = todo bien». Un `exit 1` aquí, por
# cualquier camino, devuelve a FeelVerse a una plataforma retirada.
#
# POR QUÉ NO SE BORRA `vercel.json` NI ESTE FICHERO. Porque borrarlos consigue
# lo contrario de lo que parece: sin `ignoreCommand`, Vercel construye en CADA
# commit de la rama conectada. La integración Git vive en la cuenta de Vercel y
# no se desactiva desde aquí; lo que sí se puede desde el repositorio es
# responder «no construyas» a todo lo que pregunte. Eso es esto.
#
# LO QUE ESTO NO HACE. No borra el proyecto, ni la cuenta, ni ningún dominio o
# variable suya. La retirada del plan ya está decidida y no depende de ninguna
# eliminación irreversible.
#
# QUÉ HABÍA ANTES (#725). Hasta el 2026-11-05 este guión recorría el grafo del
# workspace con `turbo query affected` para construir Web sólo cuando Web —o
# algo que Web importa— había cambiado, y fallaba «abierto»: ante cualquier
# duda, construía. Esa lógica tenía sentido mientras Vercel era un destino
# real. Con la plataforma retirada, «fallar abierto» significa desplegar donde
# no se debe, así que el guión ya no pregunta nada: la duda no existe.
#
# Historia completa en `docs/operations/web-deployment-policy.md`.
# Autoridad de la decisión: ADR 0024 y el corte vigente de `CLAUDE.md`.
# ─────────────────────────────────────────────────────────────────────────────
set -u

# No hay ramas, ni consultas al grafo, ni variables de entorno que consultar.
# Cualquier condición sería una forma de volver a construir, y no hay ninguna
# condición bajo la que construir en Vercel sea lo correcto.
echo "[ignore-web] FeelVerse se despliega sólo en OVH/Coolify — Vercel no construye" >&2
exit 0
