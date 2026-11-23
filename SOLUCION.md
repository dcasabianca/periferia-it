# SOLUCION.md — Agente Registro de Contratos Vigentes

## 1. Problema y a quién le duele
El registro maestro de contratos vigentes lleva congelado más de tres meses por depender de una sola persona, generando ceguera ejecutiva sobre vencimientos próximos y exposición legal/financiera por pólizas sin constituir. Le duele directamente a la **Analista Administrativa** (operación manual fragmentada), a **Gerencia** (falta de visibilidad de riesgo) y al **Área Comercial** (fricción en el cierre).

## 2. Arquitectura
- **Front (`web/index.html`)**: Interfaz de chat desacoplada que renderiza llamadas a herramientas y bloqueos de confirmación.
- **Backend (`src/server.ts` + `src/agent-loop.ts`)**: Ciclo agéntico con control de iteraciones (`MAX_ITERATIONS=25`), presupuesto de tokens y validación Zod.
- **Comportamiento (`agent/prompt.md`)** separado del **Conocimiento (`src/knowledge/registro-contratos.md`)** y de la **Ejecución (`src/tools/contratos.ts`)**.
- **Persistencia local**: Carpeta `fixtures/` tratada como inmutable (solo lectura); toda escritura ocurre en `out/sharepoint/` (`maestro-contratos.csv`, `historial.jsonl`, carpetas por año/cliente) y `out/log.jsonl`.

## 3. Ciclo del agente
El bucle `AgentRunner.runTurn` envía el historial y los esquemas JSON de las herramientas al adaptador LLM. Si el modelo solicita `tool_calls`, el servidor valida los argumentos contra `zod`, ejecuta la función determinista y devuelve el JSON serializado al modelo. Si `contratos_validar` detecta `requiere_revision.length > 0`, se marca `needsConfirmation = true` y el agente detiene la escritura hasta recibir confirmación explícita en el siguiente turno del usuario.

## 4. Elección del modelo
- **Proveedor / Modelo**: OpenAI `gpt-4o-mini` (configurable vía `LLM_BASE_URL` y `LLM_MODEL` hacia cualquier proveedor compatible con OpenAI o Ollama local).
- **Justificación**: Alta precisión en *function calling* estructurado con latencia baja (< 1.5s por turno).
- **Costo estimado**: ~3.500 tokens de entrada y ~600 de salida por lote de 6 correos ≈ **$0.0009 USD por lote procesado**.

## 5. Estrategia de extracción y confianza
Extracción determinista P0 mediante expresiones regulares ancladas en `contratos_extraer`:
- **Partes y NIT**: Búsqueda de razón social y NIT/RUC/RTN eliminando puntos y dígito de verificación (`confianza >= 0.92`).
- **Valor y Plazo**: Si el texto indica "por demanda" o "bolsa de horas", asigna `valor = 0` con `confianza = 0.65`. Si `fecha_fin` no es explícita pero existe duración en meses, la calcula y asigna `confianza = 0.72`.
- **Rol del modelo**: Orquesta el flujo, interpreta el lenguaje natural del analista y presenta discrepancias; **nunca** escribe ni modifica el CSV directamente sin pasar por `contratos_registrar`.

## 6. Propuesta de Regla de Gobierno (1 Página)
1. **Canal único**: Buzón corporativo `contratos@periferia-it.com`, administrado operativamente por la **Analista Administrativa** (dueña del maestro ante ausencia de área legal interna).
2. **Obligación del comercial**: Todo contrato cerrado (con o sin póliza), otrosí o acta de terminación debe enviarse en PDF firmado dentro de los **2 días hábiles** siguientes a la firma. Asunto obligatorio: `[CONTRATO | OTROSI] - <NIT> - <Nombre Cliente> - <ID Contrato>`.
3. **Acuse automático**: En menos de **5 minutos**, el agente responde al correo con el número de radicado, los datos extraídos y, si aplica, la solicitud de constitución de póliza o subsanación de campos dudosos.
4. **Excepciones y escalamiento**: Contratos sin firma o sin valor definido quedan en estado `En Revisión` sin ingresar al maestro activo. Si en 48 horas el comercial no subsana, el agente escala automáticamente al **Director Comercial** y bloquea la habilitación de facturación en ERP para ese proyecto.
5. **Cierre del gap (Junio – Agosto 2026)**: Campaña única de amnistía de 5 días hábiles liderada por Administración junto a los Gerentes de Cuenta: cada comercial exporta sus contratos firmados en ese trimestre hacia una carpeta temporal de carga masiva, procesada por el agente en modo lote (`fuente = migracion`) con validación de duplicados por NIT.
6. **Indicador clave (KPI)**: **Índice de Cobertura Contractual Facturada** = `(Contratos activos en facturación registrados en el maestro / Total contratos facturados en el mes) × 100`. Meta: **100%** (medido mensualmente antes del cierre contable).

## 7. Decisiones y Trade-offs
1. **Extracción determinista en herramienta vs. extracción directa por LLM**: Se eligió regex/heurísticas en TypeScript para evitar alucinaciones numéricas (CA2). Trade-off: requiere mantener patrones si cambian formatos, pero garantiza 100% de determinismo en `demo.ts`.
2. **Adaptador HTTP nativo (`fetch`) vs. SDK pesado**: Se implementó `OpenAICompatibleAdapter` con `fetch` estándar y `AbortController` de 45s. Elimina dependencias externas y permite cambiar entre OpenAI, Azure, Groq o Ollama solo con variables de entorno.
3. **Frontend autocontenido sin bundler**: Un único `web/index.html` servido por `Bun.serve` elimina pasos de compilación y garantiza arranque en < 5 segundos en cualquier entorno.

## 8. Supuestos
- Los contratos adjuntos vienen en texto plano (`contrato.txt`) o PDF con capa de texto extraíble.
- En actualizaciones (otrosíes), los campos no mencionados en la adenda heredan el valor vigente del maestro.
- El corte histórico congelado se toma estrictamente en `2026-05-30`.

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
- **Asistente utilizado**: Gemini (Google) para estructuración arquitectónica, generación del esqueleto TypeScript de las herramientas con Zod, diseño del ciclo agéntico y redacción inicial de la regla de gobierno.
- **Descartado y por qué**: Se descartó usar LangChain/LlamaIndex sugerido inicialmente para el ciclo del agente, optando por un bucle propio de ~120 líneas en `src/agent-loop.ts` para tener control explícito sobre el tope de iteraciones, el bloqueo por confirmación humana y cero acoplamiento de dependencias.

## 11. Riesgos en Producción y Mitigación
- **Concurrencia en escritura CSV**: Múltiples analistas escribiendo simultáneamente corromperían el archivo. *Mitigación*: Migrar el almacenamiento del maestro a PostgreSQL o listas de SharePoint con control de concurrencia optimista.
- **PDFs escaneados sin texto**: La extracción regex fallaría por texto vacío. *Mitigación*: Integrar una etapa previa de OCR antes de invocar `contratos_extraer`.
- **Incumplimiento comercial del buzón único**: Si envían contratos por WhatsApp o correo directo, el agente no los ve. *Mitigación*: Exigir el `id_contrato` validado en el maestro como prerequisito obligatorio para emitir facturas.