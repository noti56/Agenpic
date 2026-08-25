import OpenAI from "openai";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

const STORAGE_KEY = "agenpic:ollamaConfig";

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1",
};

export function getOllamaConfig(): OllamaConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OLLAMA_CONFIG;
    return { ...DEFAULT_OLLAMA_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_OLLAMA_CONFIG;
  }
}

export function saveOllamaConfig(config: OllamaConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function createOllamaClient(config: OllamaConfig): OpenAI {
  return new OpenAI({
    baseURL: config.baseUrl,
    // Ollama's OpenAI-compatible endpoint ignores the API key entirely —
    // there's no secret to protect here, so running the SDK client-side
    // against a purely local endpoint is safe.
    apiKey: "ollama",
    dangerouslyAllowBrowser: true,
  });
}

export async function testOllamaConnection(config: OllamaConfig): Promise<{
  ok: boolean;
  models?: string[];
  error?: string;
}> {
  try {
    const client = createOllamaClient(config);
    const list = await client.models.list();
    return { ok: true, models: list.data.map((m) => m.id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
