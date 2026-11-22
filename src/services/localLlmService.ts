import { FLOORPLAN_PROMPT, parseScanResult } from './floorplanPrompt';

const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'qwen2.5vl:7b';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function scanFloorplanImageLocal(file: File) {
  try {
    const image = await fileToBase64(file);

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_ctx: 8192 },
        messages: [{ role: 'user', content: FLOORPLAN_PROMPT, images: [image] }],
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Ollama error ${res.status}. Check karo ki model pull hua hai (ollama list).`
      );
    }

    const data = await res.json();
    return parseScanResult(data.message.content);
  } catch (error) {
    console.error('Local LLM Scan Error:', error);
    if (error instanceof TypeError) {
      throw new Error('Ollama se connect nahi hua. Ollama chal raha hai?');
    }
    throw error;
  }
}