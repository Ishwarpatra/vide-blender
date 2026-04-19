import axios from 'axios';

const OLLAMA_HOST  = process.env.OLLAMA_HOST  || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5';

export interface OllamaHealthResult {
  online: boolean;
  model: string;
  host: string;
  latencyMs: number | null;
}

/**
 * Wasp query that pings the Ollama /api/tags endpoint to check liveness.
 * Returns { online: true } when the local model host is reachable.
 * Called by the UI every 30 seconds to update the status indicator.
 */
export const ollamaHealth = async (): Promise<OllamaHealthResult> => {
  const start = Date.now();
  try {
    await axios.get(`${OLLAMA_HOST}/api/tags`, { timeout: 5000 });
    return { online: true, model: OLLAMA_MODEL, host: OLLAMA_HOST, latencyMs: Date.now() - start };
  } catch {
    return { online: false, model: OLLAMA_MODEL, host: OLLAMA_HOST, latencyMs: null };
  }
};
