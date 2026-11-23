import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ToolContext {
  directory: string;
  sessionId: string;
}

export interface CampoExtraido<T> {
  valor: T | null;
  confianza: number;
}

export interface ContratoExtraido {
  id_contrato: CampoExtraido<string>;
  cliente: CampoExtraido<string>;
  nit_cliente: CampoExtraido<string>;
  pais: CampoExtraido<"CO" | "EC" | "PE" | "PA" | "HN">;
  objeto: CampoExtraido<string>;
  valor: CampoExtraido<number>;
  valor_indeterminado: boolean;
  moneda: CampoExtraido<"COP" | "USD" | "PEN" | "PAB" | "HNL">;
  fecha_inicio: CampoExtraido<string>;
  fecha_fin: CampoExtraido<string>;
  requiere_poliza: CampoExtraido<boolean>;
  tipo_poliza: CampoExtraido<string>;
  es_otrosi: boolean;
}

interface MaestroRow {
  id_contrato: string;
  cliente: string;
  nit_cliente: string;
  pais: string;
  objeto: string;
  valor: string;
  moneda: string;
  fecha_inicio: string;
  fecha_fin: string;
  requiere_poliza: string;
  tipo_poliza: string;
  estado_poliza: string;
  comercial: string;
  ruta_sharepoint: string;
  fecha_registro: string;
  fuente: string;
}

const CSV_HEADERS: (keyof MaestroRow)[] = [
  "id_contrato",
  "cliente",
  "nit_cliente",
  "pais",
  "objeto",
  "valor",
  "moneda",
  "fecha_inicio",
  "fecha_fin",
  "requiere_poliza",
  "tipo_poliza",
  "estado_poliza",
  "comercial",
  "ruta_sharepoint",
  "fecha_registro",
  "fuente",
];

const MESES_ES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

// --- Utilidades de sistema de archivos y CSV ---

function ensureOutEnvironment(rootDir: string) {
  const outDir = path.join(rootDir, "out");
  const spDir = path.join(outDir, "sharepoint");
  fs.mkdirSync(spDir, { recursive: true });

  const targetCsv = path.join(spDir, "maestro-contratos.csv");
  const fixtureCsv = path.join(rootDir, "fixtures", "reto-02", "maestro-contratos.csv");

  if (!fs.existsSync(targetCsv)) {
    if (fs.existsSync(fixtureCsv)) {
      fs.copyFileSync(fixtureCsv, targetCsv);
    } else {
      fs.writeFileSync(targetCsv, CSV_HEADERS.join(",") + "\n", "utf-8");
    }
  }

  const procesadosPath = path.join(outDir, "procesados.json");
  if (!fs.existsSync(procesadosPath)) {
    fs.writeFileSync(procesadosPath, JSON.stringify({}, null, 2), "utf-8");
  }
}

function logToolExecution(
  rootDir: string,
  herramienta: string,
  mensaje_id: string | null,
  ok: boolean,
  resumen: string
) {
  try {
    const outDir = path.join(rootDir, "out");
    fs.mkdirSync(outDir, { recursive: true });
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      herramienta,
      mensaje_id,
      ok,
      resumen,
    });
    fs.appendFileSync(path.join(outDir, "log.jsonl"), entry + "\n", "utf-8");
  } catch {
    // Nunca lanzar desde logger
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function escapeCsvField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function readMaestro(rootDir: string): MaestroRow[] {
  ensureOutEnvironment(rootDir);
  const csvPath = path.join(rootDir, "out", "sharepoint", "maestro-contratos.csv");
  const raw = fs.readFileSync(csvPath, "utf-8").trim();
  const lines = raw.split(/\r?\n/);
  if (lines.length <= 1) return [];

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {} as MaestroRow;
    CSV_HEADERS.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    return row;
  });
}

function writeMaestro(rootDir: string, rows: MaestroRow[]) {
  const csvPath = path.join(rootDir, "out", "sharepoint", "maestro-contratos.csv");
  const headerLine = CSV_HEADERS.join(",");
  const dataLines = rows.map((r) =>
    CSV_HEADERS.map((h) => escapeCsvField(String(r[h] ?? ""))).join(",")
  );
  fs.writeFileSync(csvPath, [headerLine, ...dataLines].join("\n") + "\n", "utf-8");
}

function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function addMonths(isoDate: string, months: number): string | null {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function parseSpanishDate(fragment: string): string | null {
  const numMatch = fragment.match(/\((\d{1,2})\)\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})/i);
  if (numMatch) {
    const day = numMatch[1].padStart(2, "0");
    const month = MESES_ES[numMatch[2].toLowerCase()];
    const year = numMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  const isoMatch = fragment.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return isoMatch ? isoMatch[1] : null;
}

function parseMoneyAmount(rawNum: string): number {
  const cleaned = rawNum.trim();
  if (/,\d{2}$/.test(cleaned)) {
    return Number(cleaned.replace(/,/g, ""));
  }
  if (/\.\d{3}/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, "").replace(/,/g, "."));
  }
  const fallback = Number(cleaned.replace(/,/g, ""));
  return isNaN(fallback) ? 0 : fallback;
}

// --- Herramientas Exportadas ---

export const leer_buzon = {
  description: "Lista los mensajes pendientes en el buzón de contratos que aún no han sido procesados.",
  args: {},
  async execute(_args: Record<string, never>, ctx: ToolContext): Promise<string> {
    try {
      ensureOutEnvironment(ctx.directory);
      const buzonDir = path.join(ctx.directory, "fixtures", "reto-02", "buzon");
      const procesadosPath = path.join(ctx.directory, "out", "procesados.json");
      const procesados = JSON.parse(fs.readFileSync(procesadosPath, "utf-8")) as Record<string, unknown>;

      if (!fs.existsSync(buzonDir)) {
        return JSON.stringify({ ok: false, error: "No existe el directorio fixtures/reto-02/buzon" });
      }

      const dirs = fs.readdirSync(buzonDir).sort();
      const mensajes = [];

      for (const dirName of dirs) {
        if (procesados[dirName]) continue;
        const correoPath = path.join(buzonDir, dirName, "correo.json");
        if (!fs.existsSync(correoPath)) continue;

        const correo = JSON.parse(fs.readFileSync(correoPath, "utf-8"));
        const adjuntos: string[] = Array.isArray(correo.adjuntos) ? correo.adjuntos : [];
        const tieneContrato = adjuntos.some((a) => /contrato|otrosi|adenda/i.test(a));

        mensajes.push({
          id: correo.id || dirName,
          de: correo.de,
          asunto: correo.asunto,
          fecha: correo.fecha,
          adjuntos,
          tiene_contrato: tieneContrato,
          motivo_rechazo: tieneContrato ? null : "Sin adjunto de contrato o adenda identificable (ej. cotización o consulta)",
        });
      }

      logToolExecution(ctx.directory, "contratos_leer_buzon", null, true, `Encontrados ${mensajes.length} mensajes pendientes`);
      return JSON.stringify({ ok: true, data: { mensajes } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logToolExecution(ctx.directory, "contratos_leer_buzon", null, false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};

export const extraer = {
  description: "Extrae de forma determinista los campos estructurados y niveles de confianza desde el contrato adjunto de un mensaje.",
  args: {
    mensaje_id: z.string().describe("Identificador del mensaje en el buzón (ej. msg-001)"),
  },
  async execute(args: { mensaje_id: string }, ctx: ToolContext): Promise<string> {
    try {
      const msgDir = path.join(ctx.directory, "fixtures", "reto-02", "buzon", args.mensaje_id);
      const correoPath = path.join(msgDir, "correo.json");
      if (!fs.existsSync(correoPath)) {
        return JSON.stringify({ ok: false, error: `Mensaje ${args.mensaje_id} no encontrado` });
      }

      const correo = JSON.parse(fs.readFileSync(correoPath, "utf-8"));
      const adjuntos: string[] = correo.adjuntos || [];
      const contratoFile = adjuntos.find((a) => /contrato|otrosi|adenda/i.test(a)) || adjuntos[0];

      if (!contratoFile) {
        return JSON.stringify({ ok: false, error: "El mensaje no tiene archivo adjunto" });
      }

      const filePath = path.join(msgDir, contratoFile);
      if (!fs.existsSync(filePath)) {
        return JSON.stringify({ ok: false, error: `Adjunto ${contratoFile} no encontrado en disco` });
      }

      const texto = fs.readFileSync(filePath, "utf-8").trim();
      if (!texto) {
        return JSON.stringify({ ok: false, error: "El texto del contrato está vacío" });
      }

      // 1. Detectar si es Otrosí
      const esOtrosi =
        /^\s*otros[ií]\b/i.test(texto) ||
        /\b(otros[ií]|adenda|modificatorio)\b/i.test(correo.asunto || "");

      // 2. ID de contrato
      const idMatch =
        texto.match(/\b((?:CT|CM)-\d{4}-\d{1,5})\b/i) ||
        texto.match(/(?:contrato|acuerdo)\s*(?:no\.?|n[úu]mero|#|:)?\s*([A-Z]{2,5}-\d{4}-\d{1,5})/i);
      const idContrato: CampoExtraido<string> = idMatch
        ? { valor: idMatch[1].toUpperCase(), confianza: 0.98 }
        : { valor: null, confianza: 0 };

      // 3. Cliente (contraparte EL CONTRATANTE, excluyendo PERIFERIA IT GROUP y encabezados)
      const clienteMatch = texto.match(
        /(?:Entre los suscritos,\s*|Entre\s+)([A-ZÁÉÍÓÚÑ0-9\s.&-]+?),\s*(?:identificad[ao]\s+con\s+)?(?:NIT|RUC|RTN)/i
      );
      let clienteVal = clienteMatch ? clienteMatch[1].trim().replace(/\s+/g, " ") : null;
      if (clienteVal) {
        const subMatch = clienteVal.match(
          /(?:suscritos,\s*|de\s+servicios\s+no\.\s*[A-Z0-9-]+\s+)([A-ZÁÉÍÓÚÑ0-9\s.&-]+)$/i
        );
        if (subMatch) {
          clienteVal = subMatch[1].trim();
        }
        if (/periferia\s+it\s+group/i.test(clienteVal)) {
          clienteVal = null;
        }
      }
      const cliente: CampoExtraido<string> = clienteVal
        ? { valor: clienteVal, confianza: 0.95 }
        : { valor: null, confianza: 0 };

      // 4. NIT / RUC / RTN del cliente
      const nitMatch = texto.match(/(?:NIT|RUC|RTN)\s*:?\s*([\d.]+)(?:-\d)?/i);
      const nitClean = nitMatch ? nitMatch[1].replace(/\./g, "") : null;
      const nitCliente: CampoExtraido<string> = nitClean
        ? { valor: nitClean, confianza: 0.95 }
        : { valor: null, confianza: 0 };

      // 5. País
      let paisVal: "CO" | "EC" | "PE" | "PA" | "HN" = "CO";
      let paisConf = 0.9;
      if (/\bPEN\b|Lima|Per[úu]|RUC\s+20/i.test(texto)) {
        paisVal = "PE";
        paisConf = 0.95;
      } else if (/\bUSD\b|Quito|Guayaquil|Ecuador|RUC\s+17/i.test(texto)) {
        paisVal = "EC";
        paisConf = 0.95;
      } else if (/\bPAB\b|Panam[áa]/i.test(texto)) {
        paisVal = "PA";
        paisConf = 0.95;
      } else if (/\bHNL\b|RTN|Honduras|Tegucigalpa/i.test(texto)) {
        paisVal = "HN";
        paisConf = 0.95;
      } else if (/\bCOP\b|Bogot[áa]|Medell[íi]n|Barranquilla|Colombia|NIT/i.test(texto)) {
        paisVal = "CO";
        paisConf = 0.95;
      }

      // 6. Objeto
      const objMatch = texto.match(
        /(?:PRIMERA\.\s*OBJETO\.|OBJETO(?:\s+DEL\s+CONTRATO)?\.?)\s*([^\n]+(?:\n(?![A-ZÁÉÍÓÚÑ\s]{4,}\.)[^\n]+)*)/i
      );
      let objetoVal = objMatch ? objMatch[1].trim().replace(/\s+/g, " ").slice(0, 200) : null;
      let objetoConf = objetoVal ? 0.92 : 0;

      if (!objetoVal && esOtrosi) {
        objetoVal = `Otrosí modificatorio al contrato ${idContrato.valor ?? ""}`.trim().slice(0, 200);
        objetoConf = 0.85;
      }

      const objeto: CampoExtraido<string> = {
        valor: objetoVal,
        confianza: objetoConf,
      };

      // 7. Moneda y Valor
      const monedaMatch = texto.match(/\b(COP|USD|PEN|PAB|HNL)\b/i);
      const monedaVal: "COP" | "USD" | "PEN" | "PAB" | "HNL" = monedaMatch
        ? (monedaMatch[1].toUpperCase() as "COP" | "USD" | "PEN" | "PAB" | "HNL")
        : paisVal === "CO"
        ? "COP"
        : "USD";
      const moneda: CampoExtraido<"COP" | "USD" | "PEN" | "PAB" | "HNL"> = {
        valor: monedaVal,
        confianza: monedaMatch ? 0.96 : 0.85,
      };

      const sinValorDeterminado =
        /no\s+tiene\s+un\s+valor\s+determinado|por\s+demanda|bolsa\s+de\s+horas|valor\s+indeterminado/i.test(
          texto
        );
      const valorTotalMatch =
        texto.match(/(?:COP|USD|PEN|PAB|HNL)\s*\$?\s*([\d.,]+)/i) ||
        texto.match(/\$\s*([\d.,]+)/i);

      let valorField: CampoExtraido<number> = { valor: null, confianza: 0 };
      if (sinValorDeterminado) {
        valorField = { valor: 0, confianza: 0.65 };
      } else if (valorTotalMatch) {
        const num = parseMoneyAmount(valorTotalMatch[1]);
        if (!isNaN(num) && num > 0) {
          valorField = { valor: num, confianza: 0.95 };
        }
      }

      // 8. Fechas de inicio y fin
      let fechaInicioVal: string | null = null;
      let fechaInicioConf = 0;
      let fechaFinVal: string | null = null;
      let fechaFinConf = 0;

      const rangoFechasMatch = texto.match(/desde\s+el\s+([^\n]+?)\s+hasta\s*(?:el)?\s*([^\n.;]+)/i);
      if (rangoFechasMatch) {
        fechaInicioVal = parseSpanishDate(rangoFechasMatch[1]);
        fechaFinVal = parseSpanishDate(rangoFechasMatch[2]);
        if (fechaInicioVal) fechaInicioConf = 0.95;
        if (fechaFinVal) fechaFinConf = 0.95;
      }

      if (!fechaFinVal && esOtrosi) {
        const extiendeMatch = texto.match(/extiende\s+hasta\s+el\s+([^\n."]+)/i);
        if (extiendeMatch) {
          fechaFinVal = parseSpanishDate(extiendeMatch[1]);
          if (fechaFinVal) fechaFinConf = 0.95;
        }
      }

      const plazoMesesMatch = texto.match(
        /(?:plazo\s+de\s+ejecuci[óo]n\s+ser[áa]\s+de|duraci[óo]n\s+de)\s+[^(\d]*\((\d{1,2})\)\s*meses/i
      );
      if (!fechaFinVal && fechaInicioVal && plazoMesesMatch) {
        const calculada = addMonths(fechaInicioVal, Number(plazoMesesMatch[1]));
        if (calculada) {
          fechaFinVal = calculada;
          fechaFinConf = 0.72;
        }
      }

      // 9. Pólizas
      const noRequierePoliza = /no\s+requiere\s+p[óo]liza|exento\s+de\s+p[óo]liza|sin\s+garant[íi]as/i.test(texto);
      const siRequierePoliza =
        /\bGARANT[ÍI]AS\b|p[óo]liza\s+de\s+|garant[íi]a\s+de\s+cumplimiento/i.test(texto) &&
        !/para\s+cada\s+orden\s+de\s+servicio\s+cuyo\s+valor\s+supere/i.test(texto) &&
        !noRequierePoliza;

      const tiposDetectados: string[] = [];
      if (/cumplimiento/i.test(texto) && siRequierePoliza) tiposDetectados.push("cumplimiento");
      if (/salarios|prestaciones/i.test(texto) && siRequierePoliza) tiposDetectados.push("salarios");
      if (/responsabilidad\s+civil/i.test(texto) && siRequierePoliza) tiposDetectados.push("responsabilidad_civil");
      if (/calidad/i.test(texto) && siRequierePoliza) tiposDetectados.push("calidad");
      if (siRequierePoliza && tiposDetectados.length === 0) tiposDetectados.push("cumplimiento");

      const requierePoliza: CampoExtraido<boolean> = siRequierePoliza
        ? { valor: true, confianza: 0.95 }
        : { valor: false, confianza: 0.9 };

      const resultado: ContratoExtraido = {
        id_contrato: idContrato,
        cliente,
        nit_cliente: nitCliente,
        pais: { valor: paisVal, confianza: paisConf },
        objeto,
        valor: valorField,
        valor_indeterminado: sinValorDeterminado,
        moneda,
        fecha_inicio: { valor: fechaInicioVal, confianza: fechaInicioConf },
        fecha_fin: { valor: fechaFinVal, confianza: fechaFinConf },
        requiere_poliza: requierePoliza,
        tipo_poliza: {
          valor: tiposDetectados.join(";"),
          confianza: requierePoliza.confianza,
        },
        es_otrosi: esOtrosi,
      };

      logToolExecution(ctx.directory, "contratos_extraer", args.mensaje_id, true, `Extraído contrato ${idContrato.valor ?? "SIN-ID"}`);
      return JSON.stringify({ ok: true, data: resultado });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logToolExecution(ctx.directory, "contratos_extraer", args.mensaje_id, false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};

const ContratoSchema = z.object({
  id_contrato: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  cliente: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  nit_cliente: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  pais: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  objeto: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  valor: z.object({ valor: z.number().nullable(), confianza: z.number() }),
  valor_indeterminado: z.boolean().optional(),
  moneda: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  fecha_inicio: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  fecha_fin: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  requiere_poliza: z.object({ valor: z.boolean().nullable(), confianza: z.number() }),
  tipo_poliza: z.object({ valor: z.string().nullable(), confianza: z.number() }),
  es_otrosi: z.boolean().optional(),
});

export const validar = {
  description: "Valida los datos extraídos contra el maestro vigente y clasifica el mensaje como nuevo, actualizacion, duplicado o rechazado.",
  args: {
    mensaje_id: z.string().describe("Identificador del mensaje en el buzón"),
    contrato: ContratoSchema.describe("Objeto retornado por contratos_extraer"),
  },
  async execute(args: { mensaje_id: string; contrato: ContratoExtraido }, ctx: ToolContext): Promise<string> {
    try {
      const maestro = readMaestro(ctx.directory);
      const c = args.contrato;

      if (!c.cliente?.valor && !c.objeto?.valor) {
        logToolExecution(ctx.directory, "contratos_validar", args.mensaje_id, true, "Clasificado como rechazado");
        return JSON.stringify({
          ok: true,
          data: {
            clasificacion: "rechazado",
            motivo: "El documento no contiene partes ni objeto contractual identificables.",
            requiere_revision: [],
          },
        });
      }

      const correoPath = path.join(ctx.directory, "fixtures", "reto-02", "buzon", args.mensaje_id, "correo.json");
      const comercialesPath = path.join(ctx.directory, "fixtures", "reto-02", "comerciales.json");
      let comercialNombre = "Desconocido";
      let comercialRegistrado = false;

      if (fs.existsSync(correoPath) && fs.existsSync(comercialesPath)) {
        const correo = JSON.parse(fs.readFileSync(correoPath, "utf-8"));
        const comerciales = JSON.parse(fs.readFileSync(comercialesPath, "utf-8")) as { email: string; nombre: string }[];
        const found = comerciales.find((com) => com.email.toLowerCase() === String(correo.de || "").toLowerCase());
        if (found) {
          comercialNombre = found.nombre;
          comercialRegistrado = true;
        } else {
          comercialNombre = `${correo.de} (No registrado)`;
        }
      }

      const existente = maestro.find((row) => {
        if (c.id_contrato.valor && row.id_contrato.toLowerCase() === c.id_contrato.valor.toLowerCase()) {
          return true;
        }
        if (c.nit_cliente.valor && row.nit_cliente === c.nit_cliente.valor && c.objeto.valor) {
          return jaccardSimilarity(row.objeto, c.objeto.valor) >= 0.9;
        }
        return false;
      });

      let clasificacion: "nuevo" | "actualizacion" | "duplicado" = "nuevo";
      const diferencias: Record<string, { anterior: string; nuevo: string }> = {};

      if (existente) {
        const nuevoValor = c.valor.valor !== null ? String(c.valor.valor) : existente.valor;
        const nuevoInicio = c.fecha_inicio.valor ?? existente.fecha_inicio;
        const nuevoFin = c.fecha_fin.valor ?? existente.fecha_fin;

        if (existente.valor !== nuevoValor) diferencias.valor = { anterior: existente.valor, nuevo: nuevoValor };
        if (existente.fecha_inicio !== nuevoInicio) diferencias.fecha_inicio = { anterior: existente.fecha_inicio, nuevo: nuevoInicio };
        if (existente.fecha_fin !== nuevoFin) diferencias.fecha_fin = { anterior: existente.fecha_fin, nuevo: nuevoFin };

        if (Object.keys(diferencias).length === 0 && !c.es_otrosi) {
          clasificacion = "duplicado";
        } else {
          clasificacion = "actualizacion";
        }
      }

      const requiere_revision: { campo: string; valor: unknown; confianza: number; motivo: string }[] = [];
      const camposEvaluar: [string, CampoExtraido<unknown>][] = [
        ["cliente", c.cliente],
        ["nit_cliente", c.nit_cliente],
        ["objeto", c.objeto],
        ["valor", c.valor],
        ["moneda", c.moneda],
        ["fecha_inicio", c.fecha_inicio],
        ["fecha_fin", c.fecha_fin],
        ["requiere_poliza", c.requiere_poliza],
      ];

      for (const [nombreCampo, campo] of camposEvaluar) {
        if (clasificacion === "actualizacion" && existente && campo.valor === null) continue;

        if (campo.confianza < 0.8) {
          requiere_revision.push({
            campo: nombreCampo,
            valor: campo.valor,
            confianza: campo.confianza,
            motivo:
              nombreCampo === "valor" && c.valor_indeterminado
                ? "Contrato por demanda / valor indeterminado"
                : nombreCampo === "fecha_fin"
                ? "Fecha fin calculada a partir de plazo en meses"
                : campo.valor === null
                ? "Dato ausente o no explícito en el documento"
                : "Confianza de extracción inferior a 0.80",
          });
        }
      }

      logToolExecution(
        ctx.directory,
        "contratos_validar",
        args.mensaje_id,
        true,
        `Clasificación: ${clasificacion}, revisión: ${requiere_revision.length}`
      );

      return JSON.stringify({
        ok: true,
        data: {
          clasificacion,
          id_contrato_existente: existente?.id_contrato ?? null,
          comercial: comercialNombre,
          comercial_registrado: comercialRegistrado,
          requiere_revision,
          diferencias: Object.keys(diferencias).length > 0 ? diferencias : undefined,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logToolExecution(ctx.directory, "contratos_validar", args.mensaje_id, false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};

export const registrar = {
  description: "Registra o actualiza el contrato en maestro-contratos.csv, archiva el documento en SharePoint local y escribe auditoría en historial.jsonl.",
  args: {
    mensaje_id: z.string().describe("Identificador del mensaje"),
    contrato: ContratoSchema.describe("Datos del contrato validados (puede incluir correcciones confirmadas por el usuario)"),
    confirmado: z.boolean().optional().describe("Debe ser true si el contrato tenía campos en requiere_revision y el usuario los confirmó"),
    fecha_registro: z.string().optional().describe("Fecha de registro YYYY-MM-DD (por defecto 2026-09-03)"),
  },
  async execute(
    args: { mensaje_id: string; contrato: ContratoExtraido; confirmado?: boolean; fecha_registro?: string },
    ctx: ToolContext
  ): Promise<string> {
    try {
      const valRaw = await validar.execute({ mensaje_id: args.mensaje_id, contrato: args.contrato }, ctx);
      const valRes = JSON.parse(valRaw);
      if (!valRes.ok) return valRaw;

      const { clasificacion, id_contrato_existente, comercial, requiere_revision, diferencias } = valRes.data;
      const procesadosPath = path.join(ctx.directory, "out", "procesados.json");
      const procesados = JSON.parse(fs.readFileSync(procesadosPath, "utf-8"));

      if (clasificacion === "duplicado" || clasificacion === "rechazado") {
        procesados[args.mensaje_id] = { ts: new Date().toISOString(), clasificacion };
        fs.writeFileSync(procesadosPath, JSON.stringify(procesados, null, 2), "utf-8");
        logToolExecution(ctx.directory, "contratos_registrar", args.mensaje_id, true, `Cerrado sin escritura (${clasificacion})`);
        return JSON.stringify({
          ok: true,
          data: { accion: clasificacion, mensaje: `Mensaje marcado como ${clasificacion} sin modificar maestro.` },
        });
      }

      if (requiere_revision.length > 0 && !args.confirmado) {
        const camposStr = requiere_revision.map((r: { campo: string }) => r.campo).join(", ");
        logToolExecution(ctx.directory, "contratos_registrar", args.mensaje_id, false, `Bloqueado por requiere revisión: ${camposStr}`);
        return JSON.stringify({
          ok: false,
          error: `requiere revisión: ${camposStr}. Solicita confirmación explícita al usuario antes de registrar.`,
        });
      }

      const maestro = readMaestro(ctx.directory);
      const c = args.contrato;
      const fechaReg = args.fecha_registro || "2026-09-03";
      const msgDir = path.join(ctx.directory, "fixtures", "reto-02", "buzon", args.mensaje_id);
      const correo = JSON.parse(fs.readFileSync(path.join(msgDir, "correo.json"), "utf-8"));
      const adjunto = (correo.adjuntos || []).find((a: string) => /contrato|otrosi|adenda/i.test(a)) || correo.adjuntos[0];
      const ext = path.extname(adjunto) || ".txt";

      let idFinal = c.id_contrato.valor;
      if (!idFinal) {
        const year = (c.fecha_inicio.valor || fechaReg).slice(0, 4);
        const seq = String(maestro.length + 1).padStart(3, "0");
        idFinal = `AUTO-${year}-${seq}`;
      }

      const clienteNombre =
        c.cliente.valor ||
        (id_contrato_existente ? maestro.find((m) => m.id_contrato === id_contrato_existente)?.cliente : "Cliente-Desconocido") ||
        "Cliente-Desconocido";
      const yearInicio = (c.fecha_inicio.valor || fechaReg).slice(0, 4);
      const relFolder = path.join("Contratos", yearInicio, slugify(clienteNombre));
      const fullFolder = path.join(ctx.directory, "out", "sharepoint", relFolder);
      fs.mkdirSync(fullFolder, { recursive: true });

      const destFileName = c.es_otrosi ? `${idFinal}-otrosi-${args.mensaje_id}${ext}` : `${idFinal}${ext}`;
      const relRutaSharepoint = path.join(relFolder, destFileName).replace(/\\/g, "/");
      fs.copyFileSync(path.join(msgDir, adjunto), path.join(fullFolder, destFileName));

      let accionTomada = "insertado";
      if (clasificacion === "actualizacion" && id_contrato_existente) {
        const idx = maestro.findIndex((m) => m.id_contrato === id_contrato_existente);
        if (idx !== -1) {
          const prev = maestro[idx];
          maestro[idx] = {
            ...prev,
            valor: c.valor.valor !== null ? String(c.valor.valor) : prev.valor,
            fecha_inicio: c.fecha_inicio.valor ?? prev.fecha_inicio,
            fecha_fin: c.fecha_fin.valor ?? prev.fecha_fin,
            requiere_poliza: c.requiere_poliza.valor !== null ? String(c.requiere_poliza.valor) : prev.requiere_poliza,
            tipo_poliza: c.tipo_poliza.valor || prev.tipo_poliza,
            ruta_sharepoint: relRutaSharepoint,
          };
          idFinal = prev.id_contrato;
          accionTomada = "actualizado";
        }
      } else {
        const reqPol = Boolean(c.requiere_poliza.valor);
        maestro.push({
          id_contrato: idFinal,
          cliente: clienteNombre,
          nit_cliente: c.nit_cliente.valor || "",
          pais: c.pais.valor || "CO",
          objeto: (c.objeto.valor || "").slice(0, 200),
          valor: String(c.valor.valor ?? 0),
          moneda: c.moneda.valor || "COP",
          fecha_inicio: c.fecha_inicio.valor || fechaReg,
          fecha_fin: c.fecha_fin.valor || "",
          requiere_poliza: String(reqPol),
          tipo_poliza: reqPol ? c.tipo_poliza.valor || "cumplimiento" : "",
          estado_poliza: reqPol ? "pendiente" : "no_aplica",
          comercial,
          ruta_sharepoint: relRutaSharepoint,
          fecha_registro: fechaReg,
          fuente: "buzon",
        });
      }

      writeMaestro(ctx.directory, maestro);

      const historialEntry = JSON.stringify({
        ts: new Date().toISOString(),
        id_contrato: idFinal,
        accion: accionTomada,
        cambios: diferencias ?? { registro_inicial: true },
        mensaje_id: args.mensaje_id,
      });
      fs.appendFileSync(path.join(ctx.directory, "out", "sharepoint", "historial.jsonl"), historialEntry + "\n", "utf-8");

      procesados[args.mensaje_id] = { ts: new Date().toISOString(), id_contrato: idFinal, accion: accionTomada };
      fs.writeFileSync(procesadosPath, JSON.stringify(procesados, null, 2), "utf-8");

      logToolExecution(ctx.directory, "contratos_registrar", args.mensaje_id, true, `${accionTomada} ${idFinal}`);
      return JSON.stringify({
        ok: true,
        data: {
          id_contrato: idFinal,
          accion: accionTomada,
          ruta_archivo: `out/sharepoint/${relRutaSharepoint}`,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logToolExecution(ctx.directory, "contratos_registrar", args.mensaje_id, false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};

export const alertas = {
  description: "Genera el reporte de riesgos en out/alertas.md con contratos próximos a vencer (<= 60 días), pólizas pendientes y contratos registrados desde el corte 2026-05-30.",
  args: {
    hoy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Fecha de referencia en formato YYYY-MM-DD"),
  },
  async execute(args: { hoy: string }, ctx: ToolContext): Promise<string> {
    try {
      const maestro = readMaestro(ctx.directory);
      const refDate = new Date(`${args.hoy}T00:00:00Z`);
      if (isNaN(refDate.getTime())) {
        return JSON.stringify({ ok: false, error: "Fecha 'hoy' inválida. Use YYYY-MM-DD." });
      }

      const vencen: (MaestroRow & { dias_restantes: number })[] = [];
      const polizas_pendientes: MaestroRow[] = [];
      const registrados_desde_corte: MaestroRow[] = [];

      for (const row of maestro) {
        if (row.fecha_fin) {
          const finDate = new Date(`${row.fecha_fin}T00:00:00Z`);
          const diffDays = Math.ceil((finDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 60) {
            vencen.push({ ...row, dias_restantes: diffDays });
          }
        }

        if (row.requiere_poliza === "true" && row.estado_poliza !== "vigente") {
          polizas_pendientes.push(row);
        }

        if (row.fecha_registro && row.fecha_registro >= "2026-05-30") {
          registrados_desde_corte.push(row);
        }
      }

      const md = [
        `# Reporte de Alertas y Riesgos Contractuales`,
        `**Fecha de corte del reporte:** ${args.hoy}`,
        ``,
        `## 1. Contratos que vencen en ≤ 60 días (${vencen.length})`,
        vencen.length === 0
          ? `_Sin contratos próximos a vencer._`
          : vencen
              .map(
                (v) =>
                  `- **${v.id_contrato}** | ${v.cliente} | Vence: \`${v.fecha_fin}\` (${v.dias_restantes} días) | Valor: ${v.valor} ${v.moneda}`
              )
              .join("\n"),
        ``,
        `## 2. Pólizas pendientes o no vigentes (${polizas_pendientes.length})`,
        polizas_pendientes.length === 0
          ? `_Todas las pólizas exigidas están vigentes._`
          : polizas_pendientes
              .map(
                (p) =>
                  `- **${p.id_contrato}** | ${p.cliente} | Tipo: \`${p.tipo_poliza}\` | Estado: **${p.estado_poliza}** | Comercial: ${p.comercial}`
              )
              .join("\n"),
        ``,
        `## 3. Contratos registrados desde el corte 2026-05-30 (${registrados_desde_corte.length})`,
        registrados_desde_corte.length === 0
          ? `_Sin registros posteriores al corte._`
          : registrados_desde_corte
              .map(
                (r) =>
                  `- **${r.id_contrato}** | ${r.cliente} | Registrado: \`${r.fecha_registro}\` | Fuente: ${r.fuente}`
              )
              .join("\n"),
      ].join("\n");

      const rutaAlerta = path.join(ctx.directory, "out", "alertas.md");
      fs.writeFileSync(rutaAlerta, md, "utf-8");

      logToolExecution(
        ctx.directory,
        "contratos_alertas",
        null,
        true,
        `Generado alertas.md (vencen: ${vencen.length}, polizas: ${polizas_pendientes.length})`
      );

      return JSON.stringify({
        ok: true,
        data: {
          ruta: "out/alertas.md",
          vencen,
          polizas_pendientes,
          registrados_desde_corte,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logToolExecution(ctx.directory, "contratos_alertas", null, false, msg);
      return JSON.stringify({ ok: false, error: msg });
    }
  },
};