# 17 · Pulso (back-office)

Ver documento completo en [`../pulso/HANDOFF.md`](../pulso/HANDOFF.md).

Resumen rápido:

- 6 vistas + companion móvil
- 15 endpoints bajo `/api/pulso/*`
- Acceso requiere `requireRole('admin')`
- Datos agregados nocturnamente a `pulso_snapshots`
- Decisiones de write (override de Terapia, publicar episodio) auditadas en `pulso_audit_log`
