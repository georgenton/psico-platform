#!/bin/sh
# Detector de AUSENCIA del respaldo de FeelVerse — instalado 2026-11-07.
#
# Afirma PRESENCIA de una fila correcta, no «ningún fallo»: un respaldo que
# falla deja fila y uno que no corrió no deja nada, y el modo de fallo de este
# proyecto es el segundo (hueco del 29-10-2026).
#
# Se ata a la programación de FeelVerse por el NOMBRE de su base, no por un id:
# hay nueve programaciones en esta caja y el id puede cambiar. La ventana es
# 05:00 UTC porque Coolify evalúa el cron en America/Guayaquil, así que
# `0 0 * * *` es medianoche de Ecuador.
#
# Sólo lectura por `default_transaction_read_only` de sesión — comprobado: un
# CREATE por esa misma vía responde «cannot execute CREATE TABLE in a read-only
# transaction». Lo único que escribe es su propio registro.
#
# Para retirarlo:  sudo rm -f /etc/cron.d/feelverse-backup-check /usr/local/bin/feelverse-backup-check.sh
set -u
LOG=/var/log/feelverse-backup-check.log
DIA=$(date -u -d 'yesterday' +%Y-%m-%d)

# Sólo lectura por OPCIÓN de sesión, no por BEGIN/ROLLBACK: con `-tAc` y varias
# sentencias, psql devuelve también la salida de BEGIN y de ROLLBACK, y el
# recuento llegaba como «BEGIN1ROLLBACK». Lo vio la prueba en seco antes de
# enganchar el cron — sin ella, esto habría gritado FALTA todos los días, que
# es peor que no avisar: enseña a no mirar.
SQL="SELECT count(*) FILTER (WHERE e.status = 'success')
  FROM scheduled_database_backup_executions e
  JOIN scheduled_database_backups s ON s.id = e.scheduled_database_backup_id
 WHERE s.databases_to_backup = 'feelverse_staging'
   AND e.created_at::date = '${DIA}'
   AND e.created_at::time BETWEEN '04:50' AND '05:10';"

N=$(docker exec -e PGOPTIONS='-c default_transaction_read_only=on' \
      coolify-db psql -U coolify -d coolify -tAc "$SQL" 2>/dev/null | tr -d '[:space:]')

# Se registra SIEMPRE, también cuando todo está bien. Un detector que sólo
# habla cuando algo falla no se distingue de uno que dejó de correr — que es
# precisamente cómo pasó inadvertido el hueco del 29-10.
if [ "$N" = "1" ]; then
  echo "$(date -u +%FT%TZ) OK        respaldo de $DIA presente y correcto" >> "$LOG"
  exit 0
elif [ -z "$N" ]; then
  echo "$(date -u +%FT%TZ) INDETERM  no se pudo consultar coolify-db para $DIA" >> "$LOG"
  exit 2
else
  echo "$(date -u +%FT%TZ) FALTA     respaldo de $DIA ausente (filas correctas=$N)" >> "$LOG"
  exit 1
fi
