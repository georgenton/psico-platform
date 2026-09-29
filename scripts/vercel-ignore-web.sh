#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# ¿Tiene que construirse @psico/web en este commit?
#
# Lo ejecuta Vercel como Ignored Build Step, declarado en `apps/web/vercel.json`
# para que la regla viva en el repositorio y no en el dashboard: quien revisa un
# PR tiene que poder ver qué decide si Web se despliega (#725).
#
# CÓDIGOS DE SALIDA — LA POLARIDAD ES LO ÚNICO QUE NO SE PUEDE EQUIVOCAR:
#
#   exit 0  →  Vercel ABORTA el build. El deployment queda CANCELED.
#   exit 1  →  Vercel CONSTRUYE.
#
# Es al revés de lo que sugiere la intuición de «0 = todo bien», y una inversión
# aquí es un incidente: o dejas de desplegar cambios reales, o despliegas en cada
# commit. Hay una prueba que lo fija en `scripts/__tests__/`.
#
# QUÉ DECIDE. `turbo query affected` recorre el grafo del workspace, así que
# responde por @psico/web y por todo lo que Web importa —hoy @psico/api-client,
# @psico/crypto, @psico/types y @psico/ui, más lo que ellos importen— sin que
# nadie mantenga una lista de carpetas a mano. Un cambio en `docs/` o en el
# CLAUDE.md no pertenece a ningún workspace y `turbo.json` no declara
# `globalDependencies`, así que no afecta a nada.
#
# FAIL OPEN. Si no podemos DEMOSTRAR que Web no está afectada, se construye.
# Un despliegue de más cuesta unos minutos; uno de menos deja producción atrás
# sin que nadie se entere. Por eso todo lo que no sea un «no afectada» rotundo
# —base ausente, historia insuficiente, turbo que falla, salida inesperada—
# termina en exit 1.
# ─────────────────────────────────────────────────────────────────────────────
set -u

CONSTRUIR=1
OMITIR=0

raiz=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$raiz" || exit "$CONSTRUIR"

decir() { echo "[ignore-web] $*" >&2; }

# ── 1 · el turbo que haya ─────────────────────────────────────────────────────
# En el build de Vercel turbo está disponible globalmente. En local sale de
# node_modules. Si no hay ninguno, no podemos demostrar nada: se construye.
if [ -x "./node_modules/.bin/turbo" ]; then
  TURBO="./node_modules/.bin/turbo"
elif command -v turbo >/dev/null 2>&1; then
  TURBO="turbo"
else
  decir "sin turbo disponible — se construye por precaución"
  exit "$CONSTRUIR"
fi

# ── 2 · contra qué comparamos ────────────────────────────────────────────────
# `VERCEL_GIT_PREVIOUS_SHA` es el commit del último deployment de esta rama, que
# es la comparación correcta: entre dos deployments de Web pueden haber pasado
# varios commits, y `HEAD^` sólo vería el último.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -n "$base" ] && ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  decir "la base $base no está en este clon (¿clon superficial?) — se construye"
  exit "$CONSTRUIR"
fi

# Sin base —primer deployment de una rama— hay que compararse con la rama de
# producción. Pero Vercel clona UNA sola rama y superficialmente, así que aquí no
# existe ni `origin/main` ni su historia: hay que traerla antes de preguntar.
if [ -z "$base" ]; then
  produccion="${VERCEL_GIT_REPO_DEFAULT_BRANCH:-main}"

  # Primero por si ya está (clon completo: desarrollo local, o CI que sí clona
  # todo). Si no, se trae acotada: 200 commits cubren de sobra la vida de una
  # rama de PR, y si el punto de divergencia queda más atrás se construye.
  for ref in "origin/$produccion" "$produccion"; do
    if git rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then
      punta=$(git rev-parse "$ref")
      break
    fi
  done

  if [ -z "${punta:-}" ]; then
    # HAY QUE PROFUNDIZAR LAS DOS RAMAS, NO SÓLO TRAER PRODUCCIÓN. `turbo query
    # affected` calcula un merge base por dentro, y en un clon superficial la
    # historia está cortada: avisa «no merge base found», asume que cambió TODO
    # y responde que Web está afectada siempre. Traer producción sin profundizar
    # esta rama no arregla nada, porque el antepasado común sigue sin enlazar.
    # 200 commits cubren de sobra la vida de una rama de PR.
    # DE DÓNDE SE TRAE. El clon de Vercel NO tiene remoto `origin` configurado
    # —`fatal: 'origin' does not appear to be a git repository`—, así que hay que
    # nombrar el repositorio. Vercel expone de qué repo viene el build, y para uno
    # público basta con HTTPS sin credenciales. Si algún día deja de serlo, el
    # fetch fallará y se construirá: fail open, como debe ser.
    remoto=""
    if git remote get-url origin >/dev/null 2>&1; then
      remoto="origin"
    elif [ -n "${VERCEL_GIT_REPO_OWNER:-}" ] && [ -n "${VERCEL_GIT_REPO_SLUG:-}" ]; then
      remoto="https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}.git"
    fi

    if [ -z "$remoto" ]; then
      decir "no hay remoto ni forma de nombrar el repositorio — se construye"
      exit "$CONSTRUIR"
    fi

    # Las DOS ramas: sin profundizar la actual, `turbo query affected` no encuentra
    # merge base, avisa «assuming all files have changed» y responde que Web está
    # afectada siempre.
    rama_actual="${VERCEL_GIT_COMMIT_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)}"
    if [ -f "$(git rev-parse --git-dir)/shallow" ] && [ "$rama_actual" != "HEAD" ]; then
      if ! salida=$(git fetch --no-tags --quiet --depth=200 "$remoto" "$rama_actual" 2>&1); then
        decir "no se pudo profundizar $rama_actual: ${salida:-sin mensaje}"
      fi
    fi

    # El error se REPORTA. Silenciarlo dejó un «sin base con la que comparar» sin
    # explicación en los logs de Vercel, y costó varios despliegues averiguar que
    # el problema era el remoto ausente y no la lógica.
    if salida=$(git fetch --no-tags --quiet --depth=200 "$remoto" "$produccion" 2>&1); then
      punta=$(git rev-parse FETCH_HEAD 2>/dev/null || true)
      if [ -n "$punta" ]; then
        decir "el clon no traía $produccion; se trajo acotada a 200 commits"
      else
        decir "se trajo $produccion pero FETCH_HEAD no resuelve"
      fi
    else
      decir "no se pudo traer $produccion: ${salida:-sin mensaje}"
    fi
  fi

  if [ -n "${punta:-}" ]; then
    # El punto de divergencia es la comparación exacta de un PR. Si la historia
    # sigue sin alcanzar, se usa la punta de producción: puede contar de más —y
    # construir de más—, que es el lado seguro del error.
    if base=$(git merge-base "$punta" HEAD 2>/dev/null) && [ -n "$base" ]; then
      decir "sin base previa; se compara con el punto de divergencia de $produccion"
    else
      base="$punta"
      decir "sin punto de divergencia alcanzable; se compara con la punta de $produccion"
    fi
  fi
fi

if [ -z "$base" ]; then
  decir "sin base con la que comparar — se construye"
  exit "$CONSTRUIR"
fi

# ── 3 · la política se despliega a sí misma ──────────────────────────────────
# Estos dos ficheros DEFINEN cuándo se construye Web, y viven fuera de todo
# workspace, así que el grafo no los ve: un cambio en ellos daba «nada afectado».
# Pero si se cambia la regla y Web no se reconstruye, no hay forma de comprobar
# que la regla nueva funciona. No es una lista de carpetas —es imposible derivar
# del grafo algo que está fuera de él—, y son exactamente dos.
for fichero in "scripts/vercel-ignore-web.sh" "apps/web/vercel.json"; do
  if git diff --name-only "$base" HEAD -- "$fichero" 2>/dev/null | grep -q .; then
    decir "cambió $fichero, que decide esto mismo — se construye"
    exit "$CONSTRUIR"
  fi
done

# ── 4 · la pregunta ──────────────────────────────────────────────────────────
# --exit-code: 1 si hay paquetes afectados, 0 si no, 2 si algo falló.
"$TURBO" query affected --base="$base" --packages @psico/web --exit-code >/dev/null 2>&1
codigo=$?

case "$codigo" in
  0)
    decir "@psico/web no está afectada desde $base — se omite"
    exit "$OMITIR"
    ;;
  1)
    decir "@psico/web está afectada desde $base — se construye"
    exit "$CONSTRUIR"
    ;;
  *)
    decir "turbo terminó con $codigo, que no es una respuesta — se construye"
    exit "$CONSTRUIR"
    ;;
esac
