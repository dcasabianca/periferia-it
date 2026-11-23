import type { ChatMessage, LLMAdapter, LLMResponse, ToolDefinition } from "./adapter";

export class OpenAICompatibleAdapter implements LLMAdapter {
  readonly providerName = "openai-compatible";
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: { apiKey: string; baseUrl: string; model: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.modelName = config.model;
  }

  async enviar(mensajes: ChatMessage[], herramientas: ToolDefinition[]): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error("Variable de entorno LLM_API_KEY no configurada en el servidor.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: mensajes,
          tools: herramientas.length > 0 ? herramientas : undefined,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Error del proveedor LLM (${res.status}): ${errBody.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        choices: { message: ChatMessage }[];
        usage?: { total_tokens: number };
      };

      return {
        message: json.choices[0].message,
        usage: json.usage,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Timeout al comunicarse con el proveedor LLM (45s).");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}