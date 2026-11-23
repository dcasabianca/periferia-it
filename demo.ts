import * as fs from "node:fs";
import * as path from "node:path";
import { leer_buzon, extraer, validar, registrar, alertas } from "./src/tools/contratos";
import type { ContratoExtraido } from "./src/tools/contratos";

const ROOT_DIR = process.cwd();
const ctx = { directory: ROOT_DIR, sessionId: "demo-determinista" };

async function runDemo() {
  console.log("=== INICIANDO DEMO DETERMINISTA (SIN LLM) ===\n");

  // 1. Limpiar contenido interno de out/ sin borrar el punto de montaje de Docker
  const outDir = path.join(ROOT_DIR, "out");
  if (fs.existsSync(outDir)) {
    for (const entry of fs.readdirSync(outDir)) {
      fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 2. Leer buzón
  const buzonRes = JSON.parse(await leer_buzon.execute({}, ctx));
  if (!buzonRes.ok) {
    console.error("Error leyendo buzón:", buzonRes.error);
    process.exit(1);
  }

  const mensajes = buzonRes.data.mensajes;
  console.log(`Mensajes encontrados en buzón: ${mensajes.length}\n`);

  const pendientesConfirmacion: { mensaje_id: string; contrato: ContratoExtraido }[] = [];

  // 3. Primera pasada sobre todos los mensajes
  for (const msg of mensajes) {
    console.log(`--- Procesando ${msg.id} (${msg.asunto}) ---`);

    if (!msg.tiene_contrato) {
      const regRechazo = JSON.parse(
        await registrar.execute(
          {
            mensaje_id: msg.id,
            contrato: {
              id_contrato: { valor: null, confianza: 0 },
              cliente: { valor: null, confianza: 0 },
              nit_cliente: { valor: null, confianza: 0 },
              pais: { valor: "CO", confianza: 0 },
              objeto: { valor: null, confianza: 0 },
              valor: { valor: null, confianza: 0 },
              valor_indeterminado: false,
              moneda: { valor: "COP", confianza: 0 },
              fecha_inicio: { valor: null, confianza: 0 },
              fecha_fin: { valor: null, confianza: 0 },
              requiere_poliza: { valor: false, confianza: 0 },
              tipo_poliza: { valor: "", confianza: 0 },
              es_otrosi: false,
            },
          },
          ctx
        )
      );
      console.log(`Clasificación: rechazado | Acción: ${regRechazo.data?.accion}\n`);
      continue;
    }

    const extRes = JSON.parse(await extraer.execute({ mensaje_id: msg.id }, ctx));
    if (!extRes.ok) {
      console.log(`Error extracción: ${extRes.error}\n`);
      continue;
    }

    const valRes = JSON.parse(await validar.execute({ mensaje_id: msg.id, contrato: extRes.data }, ctx));
    const { clasificacion, requiere_revision } = valRes.data;
    console.log(`Clasificación: ${clasificacion} | Campos en revisión: ${requiere_revision.length}`);

    if (requiere_revision.length > 0) {
      console.log(
        "  -> Detalle revisión:",
        requiere_revision.map((r: { campo: string; motivo: string }) => `${r.campo} (${r.motivo})`).join("; ")
      );
      pendientesConfirmacion.push({ mensaje_id: msg.id, contrato: extRes.data as ContratoExtraido });

      const intento = JSON.parse(await registrar.execute({ mensaje_id: msg.id, contrato: extRes.data }, ctx));
      console.log(`  -> Intento sin confirmación: ok=${intento.ok} (${intento.error})\n`);
    } else {
      const regRes = JSON.parse(
        await registrar.execute({ mensaje_id: msg.id, contrato: extRes.data, fecha_registro: "2026-09-03" }, ctx)
      );
      console.log(`  -> Acción tomada: ${JSON.stringify(regRes.data)}\n`);
    }
  }

  // 4. Segunda pasada: confirmar msg-006 (o el primer pendiente con revisión)
  if (pendientesConfirmacion.length > 0) {
    const target =
      pendientesConfirmacion.find((p) => p.mensaje_id === "msg-006") ?? pendientesConfirmacion[0];
    console.log(`=== SEGUNDA PASADA: CONFIRMANDO ${target.mensaje_id} (confirmado: true) ===`);
    const regConfirmado = JSON.parse(
      await registrar.execute(
        {
          mensaje_id: target.mensaje_id,
          contrato: target.contrato,
          confirmado: true,
          fecha_registro: "2026-09-03",
        },
        ctx
      )
    );
    console.log(`Resultado tras confirmación: ${JSON.stringify(regConfirmado.data)}\n`);
  }

  // 5. Generar alertas con fecha de corte 2026-09-03
  console.log("=== GENERANDO REPORTE DE ALERTAS (hoy = 2026-09-03) ===");
  const alertasRes = JSON.parse(await alertas.execute({ hoy: "2026-09-03" }, ctx));
  console.log(`Archivo generado: ${alertasRes.data.ruta}`);
  console.log(`- Vencen <= 60 días: ${alertasRes.data.vencen.length}`);
  console.log(`- Pólizas pendientes: ${alertasRes.data.polizas_pendientes.length}`);
  console.log(`- Registrados desde 2026-05-30: ${alertasRes.data.registrados_desde_corte.length}`);
}

runDemo();