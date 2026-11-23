import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChatMessage, LLMAdapter, ToolDefinition } from "./llm/adapter";
import * as contratosTools from "./tools/contratos";

export interface RecordedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AgentTurnResult {
  reply: string;
  toolCalls: RecordedToolCall[];
  needsConfirmation: boolean;
}

interface RegisteredTool {
  name: string;
  description: string;
  argsSchema: z.ZodObject<z.ZodRawShape>;
  execute: (args: Record<string, unknown>, ctx: contratosTools.ToolContext) => Promise<string>;
}

function buildToolRegistry(): Map<string, RegisteredTool> {
  const registry = new Map<string, RegisteredTool>();
  for (const [exportName, toolObj] of Object.entries(contratosTools)) {
    if (typeof toolObj === "object" && toolObj !== null && "execute" in toolObj) {
      const fullName = `contratos_${exportName}`;
      registry.set(fullName, {
        name: fullName,
        description: toolObj.description,
        argsSchema: z.object(toolObj.args as z.ZodRawShape),
        execute: toolObj.execute as (args: Record<string, unknown>, ctx: contratosTools.ToolContext) => Promise<string>,
      });
    }
  }
  return registry;
}

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, val] of Object.entries(schema.shape)) {
    const zodType = val as z.ZodTypeAny;
    const desc = zodType.description || "";
    const isOptional = zodType.isOptional();
    if (!isOptional) required.push(key);

    const inner = isOptional && "_def" in zodType && "innerType" in zodType._def ? zodType._def.innerType : zodType;
    if (inner instanceof z.ZodString) {
      properties[key] = { type: "string", description: desc };
    } else if (inner instanceof z.ZodNumber) {
      properties[key] = { type: "number", description: desc };
    } else if (inner instanceof z.ZodBoolean) {
      properties[key] = { type: "boolean", description: desc };
    } else {
      properties[key] = { type: "object", description: desc };
    }
  }

  return { type: "object", properties, required };
}

export class AgentRunner {
  private readonly registry = buildToolRegistry();
  private readonly maxIterations: number;
  private readonly maxTokens: number;
  private readonly rootDir: string;

  constructor(
    private readonly llm: LLMAdapter,
    options: { rootDir: string; maxIterations?: number; maxTokens?: number }
  ) {
    this.rootDir = options.rootDir;
    this.maxIterations = options.maxIterations ?? 25;
    this.maxTokens = options.maxTokens ?? 50_000;
  }

  private loadSystemPrompt(): string {
    const promptPath = path.join(this.rootDir, "agent", "prompt.md");
    const knowledgePath = path.join(this.rootDir, "src", "knowledge", "registro-contratos.md");
    const prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, "utf-8") : "";
    const knowledge = fs.existsSync(knowledgePath) ? fs.readFileSync(knowledgePath, "utf-8") : "";
    return `${prompt}\n\n---\n\n${knowledge}`;
  }

  private getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.registry.values()).map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.argsSchema),
      },
    }));
  }

  async runTurn(
    sessionId: string,
    history: ChatMessage[],
    userMessage: string
  ): Promise<{ result: AgentTurnResult; updatedHistory: ChatMessage[] }> {
    const messages: ChatMessage[] =
      history.length === 0
        ? [{ role: "system", content: this.loadSystemPrompt() }]
        : [...history];

    messages.push({ role: "user", content: userMessage });

    const recordedCalls: RecordedToolCall[] = [];
    let needsConfirmation = false;
    let tokensUsed = 0;

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const response = await this.llm.enviar(messages, this.getToolDefinitions());
      tokensUsed += response.usage?.total_tokens ?? 0;

      if (tokensUsed > this.maxTokens) {
        const stopMsg = "Se alcanzó el presupuesto máximo de tokens configurado para esta sesión.";
        messages.push({ role: "assistant", content: stopMsg });
        return {
          result: { reply: stopMsg, toolCalls: recordedCalls, needsConfirmation },
          updatedHistory: messages,
        };
      }

      const assistantMsg = response.message;
      messages.push(assistantMsg);

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const finalReply = assistantMsg.content ?? "";
        if (/\b(confirmas|confirma|confirmaci[óo]n|requiere\s+revisi[óo]n)\b/i.test(finalReply)) {
          needsConfirmation = true;
        }
        return {
          result: { reply: finalReply, toolCalls: recordedCalls, needsConfirmation },
          updatedHistory: messages,
        };
      }

      for (const tc of assistantMsg.tool_calls) {
        const tool = this.registry.get(tc.function.name);
        let outputStr = "";
        let parsedArgs: Record<string, unknown> = {};

        if (!tool) {
          outputStr = JSON.stringify({ ok: false, error: `Herramienta desconocida: ${tc.function.name}` });
        } else {
          try {
            parsedArgs = JSON.parse(tc.function.arguments || "{}");
            const validated = tool.argsSchema.safeParse(parsedArgs);
            if (!validated.success) {
              outputStr = JSON.stringify({ ok: false, error: `Argumentos inválidos: ${validated.error.message}` });
            } else {
              outputStr = await tool.execute(validated.data, { directory: this.rootDir, sessionId });
            }
          } catch (e) {
            outputStr = JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) });
          }
        }

        let parsedResult: unknown = outputStr;
        try {
          parsedResult = JSON.parse(outputStr);
          if (
            typeof parsedResult === "object" &&
            parsedResult !== null &&
            "data" in parsedResult &&
            typeof (parsedResult as { data: { requiere_revision?: unknown[] } }).data?.requiere_revision?.length === "number" &&
            (parsedResult as { data: { requiere_revision: unknown[] } }).data.requiere_revision.length > 0
          ) {
            needsConfirmation = true;
          }
        } catch {
          // Mantener string
        }

        recordedCalls.push({
          name: tc.function.name,
          args: parsedArgs,
          result: parsedResult,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: outputStr,
        });
      }
    }

    const fallbackMsg = "Alcancé el límite de iteraciones configurado para este turno. Este es el avance registrado hasta el momento.";
    messages.push({ role: "assistant", content: fallbackMsg });
    return {
      result: { reply: fallbackMsg, toolCalls: recordedCalls, needsConfirmation },
      updatedHistory: messages,
    };
  }
}