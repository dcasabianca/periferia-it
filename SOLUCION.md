# SOLUCION.md — Agente Registro de Contratos Vigentes

## 1. Problema y a quién le duele
El registro maestro de contratos vigentes lleva congelado más de tres meses por depender de una sola persona, generando ceguera ejecutiva sobre vencimientos próximos y exposición legal/financiera por pólizas sin constituir[cite: 7]. Le duele directamente a la **Analista Administrativa** (operación manual fragmentada), a **Gerencia** (falta de visibilidad de riesgo) y al **Área Comercial** (fricción en el cierre)[cite: 7].

## 2. Arquitectura
- **Front (`web/index.html`)**: Interfaz de chat desacoplada que renderiza llamadas a herramientas y bloqueos de confirmación[cite: 7].
- **Backend (`src/server.ts` + `src/agent-loop.ts`)**: Ciclo agéntico con control de iteraciones (`MAX_ITERATIONS=25`), presupuesto de tokens y validación Zod[cite: 7].
- **Comportamiento (`agent/prompt.md`)** separado del **Conocimiento (`src/knowledge/registro-contratos.md`)** y de la **Ejecución (`src/tools/contratos.ts`)**[cite: 7].
- **Persistencia local y Docker**: Carpeta `fixtures/` montada en solo lectura (`:ro`); toda escritura ocurre en `out/` montado en lectura/escritura (`out/sharepoint/` con `maestro-contratos.csv`, `historial.jsonl` y carpetas por año/cliente, además de `procesados.json`, `alertas.md` y `log.jsonl`)[cite: 7].

## 3. Ciclo del agente
El bucle `AgentRunner.runTurn` envía el historial y los esquemas JSON de las herramientas al adaptador LLM[cite: 7]. Si el modelo solicita `tool_calls`, el servidor valida los argumentos contra `zod`, ejecuta la función determinista y devuelve el JSON serializado al modelo[cite: 7]. Si `contratos_validar` detecta `requiere_revision.length > 0`, se marca `needsConfirmation = true` y el agente detiene la escritura hasta recibir confirmación explícita en el siguiente turno del usuario[cite: 7].

## 4. Elección del modelo
- **Proveedor / Modelo**: Instancia local de **Ollama** (configurable vía `LLM_BASE_URL=http://host.docker.internal:11434/v1` y `LLM_MODEL`, compatible también con OpenAI u otros proveedores OpenAI-compatible)[cite: 7].
- **Justificación**: Ejecución local sin costo por token, privacidad de los documentos contractuales y soporte de *function calling* / respuestas estructuradas desde el contenedor Docker.
- **Costo estimado**: **$0.00 USD** en ejecución local con Ollama (consumo únicamente de cómputo/VRAM local en el host).

## 5. Estrategia de extracción y confianza
Extracción determinista mediante expresiones regulares y parsers de fechas/montos en `contratos_extraer`[cite: 7]:
- **ID, partes y NIT**: Extracción de códigos `CT-/CM-`, razón social del contratante y NIT/RUC/RTN normalizado (`confianza` de `0.95` a `0.98`).
- **Valor y Plazo**: Si el texto indica contrato sin valor determinado / por demanda, asigna `valor = 0` con `confianza = 0.65`. Si `fecha_fin` no es explícita pero existe duración en meses junto con fecha de inicio, la calcula y asigna `confianza = 0.72`[cite: 7].
- **Rol del modelo**: Orquesta el flujo, interpreta el lenguaje natural del analista y presenta discrepancias; **nunca** escribe ni modifica el CSV directamente sin pasar por `contratos_registrar`[cite: 7].

## 6. Propuesta de Regla de Gobierno (1 Página)
1. **Canal único**: Buzón corporativo `contratos@periferia-it.com`, administrado operativamente por la **Analista Administrativa** (dueña del maestro ante ausencia de área legal interna)[cite: 7].
2. **Obligación del comercial**: Todo contrato cerrado (con o sin póliza), otrosí o acta de terminación debe enviarse en PDF firmado dentro de los **2 días hábiles** siguientes a la firma[cite: 7]. Asunto obligatorio: `[CONTRATO | OTROSI] - <NIT> - <Nombre Cliente> - <ID Contrato>`[cite: 7].
3. **Acuse automático**: En menos de **5 minutos**, el agente responde al correo con el número de radicado, los datos extraídos y, si aplica, la solicitud de constitución de póliza o subsanación de campos dudosos[cite: 7].
4. **Excepciones y escalamiento**: Contratos sin firma o sin valor definido quedan en estado `En Revisión` sin ingresar al maestro activo[cite: 7]. Si en 48 horas el comercial no subsana, el agente escala automáticamente al **Director Comercial** y bloquea la habilitación de facturación en ERP para ese proyecto[cite: 7].
5. **Cierre del gap (Junio – Agosto 2026)**: Campaña única de amnistía de 5 días hábiles liderada por Administración junto a los Gerentes de Cuenta: cada comercial exporta sus contratos firmados en ese trimestre hacia una carpeta temporal de carga masiva, procesada por el agente en modo lote (`fuente = migracion`) con validación de duplicados por NIT[cite: 7].
6. **Indicador clave (KPI)**: **Índice de Cobertura Contractual Facturada** = `(Contratos activos en facturación registrados en el maestro / Total contratos facturados en el mes) × 100`[cite: 7]. Meta: **100%** (medido mensualmente antes del cierre contable)[cite: 7].

## 7. Decisiones y Trade-offs
1. **Extracción determinista en herramienta vs. extracción directa por LLM**: Se eligió regex/heurísticas en TypeScript para evitar alucinaciones numéricas[cite: 7]. Trade-off: requiere mantener patrones si cambian formatos, pero garantiza 100% de determinismo en `demo.ts`[cite: 7].
2. **Adaptador HTTP nativo (`fetch`) vs. SDK pesado**: Se implementó `OpenAICompatibleAdapter` con `fetch` estándar y `AbortController` configurable (`LLM_TIMEOUT_MS`, por defecto `90000` ms para modelos locales)[cite: 7]. Elimina dependencias externas y permite cambiar entre Ollama, OpenAI u otros endpoints vía variables de entorno[cite: 7].
3. **Frontend autocontenido sin bundler**: Un único `web/index.html` servido por `Bun.serve` elimina pasos de compilación y garantiza arranque rápido en contenedor[cite: 7].

## 8. Supuestos
- Los contratos adjuntos vienen en texto plano (`contrato.txt`, `otrosi.txt`) o texto extraíble[cite: 7].
- En actualizaciones (otrosíes), los campos no mencionados en la adenda heredan el valor vigente del maestro[cite: 7].
- El corte histórico de alertas se evalúa contra `2026-05-30` y la fecha de referencia (`hoy`) indicada en la consulta[cite: 7].

## 9. Cobertura de Historias de Usuario
| HU | Descripción | Estado | Qué falta para producción |
|---|---|---|---|
| HU-1 | Leer buzón y filtrar procesados | Hecho | Conector IMAP / Microsoft Graph API real |
| HU-2 | Extracción estructurada con confianza | Hecho | Pipeline OCR (PaddleOCR / Textract) para PDFs escaneados |
| HU-3 | Validación y clasificación RN1-RN4 | Hecho | Fuzzy matching fonético adicional para razones sociales |
| HU-4 | Registro CSV, SharePoint e historial | Hecho | Conector SharePoint REST API y locks distribuidos |
| HU-5 | Reporte de alertas `alertas.md` | Hecho | Envío automático por correo/Teams a Gerencia |
| HU-6 | Manejo resiliente de errores | Hecho | Cola de reintentos (Dead Letter Queue) |

## 10. Uso de IA
- **Asistente utilizado**: Gemini (Google) para estructuración arquitectónica, generación del esqueleto TypeScript de las herramientas con Zod, calibración de extractores, configuración Docker/Ollama y redacción de documentación[cite: 7].
- **Descartado y por qué**: Se descartó usar frameworks pesados como LangChain/LlamaIndex para el ciclo del agente, optando por un bucle propio en `src/agent-loop.ts` con control explícito de iteraciones, confirmación humana y cero dependencias innecesarias[cite: 7].

## 11. Riesgos en Producción y Mitigación
- **Concurrencia en escritura CSV**: Múltiples analistas escribiendo simultáneamente corromperían el archivo[cite: 7]. *Mitigación*: Migrar el almacenamiento del maestro a PostgreSQL o listas de SharePoint con control de concurrencia optimista[cite: 7].
- **PDFs escaneados sin texto**: La extracción regex fallaría por texto vacío[cite: 7]. *Mitigación*: Integrar una etapa previa de OCR antes de invocar `contratos_extraer`[cite: 7].
- **Incumplimiento comercial del buzón único**: Si envían contratos por WhatsApp o correo directo, el agente no los ve[cite: 7]. *Mitigación*: Exigir el `id_contrato` validado en el maestro como prerequisito obligatorio para emitir facturas[cite: 7].
- **Disponibilidad o latencia de Ollama en el host**: Si Ollama está detenido o el modelo tarda en cargar, las llamadas del chat pueden fallar o superar el timeout. *Mitigación*: Verificar `ollama list` y el estado del modelo antes de usar el chat, y ajustar `LLM_TIMEOUT_MS` según el hardware disponible.