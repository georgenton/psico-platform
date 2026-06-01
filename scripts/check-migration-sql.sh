#!/usr/bin/env bash
# check-migration-sql.sh
#
# Guards against a class of bug where Prisma CLI stdout leaks into the
# generated `migration.sql` file. When that happens, `prisma migrate deploy`
# tries to run the leaked text as SQL and Postgres rejects it with a syntax
# error — the failed entry then sits in `_prisma_migrations` blocking every
# subsequent migration (error P3009).
#
# Real incident on 2026-06-01: two migrations (s5_books_... and
# s6_diary_e2e_encryption) had `Loaded Prisma config from prisma.config.ts.`
# as their literal first line. Production deploy failed silently for 8m
# until someone manually ran `prisma migrate resolve --rolled-back` against
# the public Postgres proxy and dedupe-d the broken state.
#
# This script runs in pre-commit. For every staged `migration.sql` file it:
#   1. Confirms the first non-empty line begins with a valid SQL token:
#      `--`, `/*`, or an SQL keyword (CREATE, ALTER, DROP, INSERT, ...).
#   2. Rejects the commit otherwise, with a hint to clean the file.
#
# Run standalone with:
#   bash scripts/check-migration-sql.sh apps/api/prisma/migrations/<name>/migration.sql

set -euo pipefail

# Files to check — argv if provided, otherwise git's staged set.
# (Using `while read` instead of `mapfile` for bash 3 / macOS compatibility.)
files=()
if [[ $# -gt 0 ]]; then
  for arg in "$@"; do
    files+=("$arg")
  done
else
  while IFS= read -r f; do
    files+=("$f")
  done < <(git diff --cached --name-only --diff-filter=ACMR | grep -E 'prisma/migrations/.*/migration\.sql$' || true)
fi

if [[ ${#files[@]} -eq 0 ]]; then
  exit 0
fi

bad=()

for f in "${files[@]}"; do
  [[ -f "$f" ]] || continue

  # Read first non-empty line (skip blanks).
  first_line=""
  while IFS= read -r line; do
    if [[ -n "${line//[[:space:]]/}" ]]; then
      first_line="$line"
      break
    fi
  done < "$f"

  if [[ -z "$first_line" ]]; then
    # Empty migration file — let Prisma's own validation catch it.
    continue
  fi

  # Allowed: SQL line-comment `--`, block-comment `/*`, or a SQL keyword.
  case "$first_line" in
    --*|/\**) ;;
    [Cc][Rr][Ee][Aa][Tt][Ee]*) ;;
    [Aa][Ll][Tt][Ee][Rr]*) ;;
    [Dd][Rr][Oo][Pp]*) ;;
    [Ii][Nn][Ss][Ee][Rr][Tt]*) ;;
    [Uu][Pp][Dd][Aa][Tt][Ee]*) ;;
    [Dd][Ee][Ll][Ee][Tt][Ee]*) ;;
    [Bb][Ee][Gg][Ii][Nn]*) ;;
    [Cc][Oo][Mm][Mm][Ii][Tt]*) ;;
    [Ss][Ee][Tt]*) ;;
    [Gg][Rr][Aa][Nn][Tt]*) ;;
    [Rr][Ee][Vv][Oo][Kk][Ee]*) ;;
    *)
      bad+=("$f|$first_line")
      ;;
  esac
done

if [[ ${#bad[@]} -gt 0 ]]; then
  echo ""
  echo "✖ migration.sql files contain non-SQL leading content"
  echo ""
  echo "  Each migration.sql must start with valid SQL — a comment (-- or /*)"
  echo "  or a statement keyword (CREATE, ALTER, INSERT, ...). The files below"
  echo "  start with something else, likely Prisma CLI stdout that leaked into"
  echo "  the file. See docs/informes/deploy-2026-06-01-incident.md."
  echo ""
  for entry in "${bad[@]}"; do
    file="${entry%%|*}"
    line="${entry#*|}"
    echo "  • $file"
    echo "      first line: $line"
  done
  echo ""
  echo "  To fix, remove the leading non-SQL lines:"
  echo "    sed -i.bak '/^Loaded Prisma config from prisma.config.ts.\$/d' <file>"
  echo "    rm <file>.bak"
  echo ""
  exit 1
fi

exit 0
