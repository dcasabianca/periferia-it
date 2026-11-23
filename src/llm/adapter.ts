export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCallRequest[];
}

export interface ToolCallRequest {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMResponse {
  message: ChatMessage;
  usage?: { total_tokens: number };
}

export interface LLMAdapter {
  readonly providerName: string;
  readonly modelName: string;
  enviar(mensajes: ChatMessage[], herramientas: ToolDefinition[]): Promise<LLMResponse>;
}