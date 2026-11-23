import * as path from "node:path";
import * as fs from "node:fs";
import { OpenAICompatibleAdapter } from "./llm/openai-compatible";
import { AgentRunner } from "./agent-loop";
import type { ChatMessage } from "./llm/adapter";

const ROOT_DIR = process.cwd();
const PORT = Number(process.env.PORT || 3000);

const llm = new OpenAICompatibleAdapter({
  apiKey: process.env.LLM_API_KEY || "",
  baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
  model: process.env.LLM_MODEL || "gpt-4o-mini",
});

const runner = new AgentRunner(llm, {
  rootDir: ROOT_DIR,
  maxIterations: Number(process.env.MAX_ITERATIONS || 25),
  maxTokens: Number(process.env.MAX_SESSION_TOKENS || 50_000),
});

const sessions = new Map<string, ChatMessage[]>();

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // GET /api/health
    if (req.method === "GET" && url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        provider: llm.providerName,
        model: llm.modelName,
      });
    }

    // GET /api/sessions/:id
    if (req.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const id = url.pathname.replace("/api/sessions/", "");
      const history = (sessions.get(id) || []).filter((m) => m.role !== "system");
      return Response.json({ ok: true, sessionId: id, messages: history });
    }

    // POST /api/chat
    if (req.method === "POST" && url.pathname === "/api/chat") {
      try {
        const body = (await req.json()) as { sessionId?: string; message?: string };
        const sessionId = body.sessionId || "default";
        const userMessage = String(body.message || "").trim();

        if (!userMessage) {
          return Response.json({ ok: false, error: "El mensaje no puede estar vacío." }, { status: 400 });
        }

        const history = sessions.get(sessionId) || [];
        const { result, updatedHistory } = await runner.runTurn(sessionId, history, userMessage);
        sessions.set(sessionId, updatedHistory);

        return Response.json(result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error interno en el agente";
        return Response.json(
          {
            reply: `⚠️ Error al procesar la solicitud: ${errorMsg}`,
            toolCalls: [],
            needsConfirmation: false,
          },
          { status: 200 }
        );
      }
    }

    // Servir UI estática en /
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const htmlPath = path.join(ROOT_DIR, "web", "index.html");
      if (fs.existsSync(htmlPath)) {
        return new Response(fs.readFileSync(htmlPath, "utf-8"), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Agente Registro de Contratos activo en http://localhost:${PORT}`);