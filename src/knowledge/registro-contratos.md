# Reglas de Negocio — Registro Maestro de Contratos

## Clasificación
- **RN1 (Duplicado)**: Coincide `id_contrato` + `valor` + `fecha_inicio` + `fecha_fin` con el maestro. No se escribe.
- **RN2 (Actualización / Otrosí)**: Coincide `id_contrato` (o `nit_cliente` + similitud de `objeto` >= 0.9) con cambios en fechas, valor o pólizas, o el documento indica explícitamente ser un otrosí/adenda. Actualiza fila existente y guarda diff en `historial.jsonl`.
- **RN3 (Nuevo)**: Sin coincidencia previa. Inserta fila nueva.
- **RN4 (Rechazado)**: Sin adjunto contractual o texto sin partes/objeto identificables.

## Umbrales y Pólizas
- **RN5 (Confianza)**: Todo campo con `confianza < 0.8` dispara `requiere_revision`. Contratos por demanda (`valor = 0`) o plazos calculados en meses requieren validación humana antes de persistir.
- **Estado de póliza**: Si `requiere_poliza = true` en un contrato nuevo, `estado_poliza` inicia como `pendiente`. Si `requiere_poliza = false`, inicia como `no_aplica`.