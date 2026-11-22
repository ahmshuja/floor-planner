import { GoogleGenerativeAI } from '@google/generative-ai';
import { useStore } from '../store/useStore';
import { FLOORPLAN_PROMPT, parseScanResult } from './floorplanPrompt';
import { scanFloorplanImageLocal } from './localLlmService';

// Pehla model busy ya unavailable ho to agla try hoga
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function fileToGenerativePart(
  file: File
): Promise<{ inlineData: { data: string; mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function scanFloorplanImage(file: File) {
  // .env.local mein VITE_LLM_PROVIDER=local ho to Ollama use hoga
  if (import.meta.env.VITE_LLM_PROVIDER === 'local') {
    return scanFloorplanImageLocal(file);
  }

  const store = useStore.getState();
  const apiKey = store.userGeminiImageKey || import.meta.env.VITE_GEMINI_VISION_API_KEY;

  if (!apiKey) {
    throw new Error('No Gemini API key found. Please set one in the settings.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const imagePart = await fileToGenerativePart(file);

  let lastError: unknown;

  for (const modelName of GEMINI_MODELS) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await model.generateContent([FLOORPLAN_PROMPT, imagePart]);
        return parseScanResult(result.response.text());
      } catch (error) {
        lastError = error;
        const msg = String((error as Error)?.message ?? error);
        console.error(`Gemini Scan Error (${modelName}, try ${attempt}):`, error);

        if (msg.includes('404')) break; // model nahi mila, agla model try karo
        const busy = msg.includes('503') || msg.includes('429');
        if (!busy) throw error; // koi aur error ho to turant dikhao
        await sleep(2000 * attempt); // 2s, 4s, 6s ruk ke retry
      }
    }
  }

  throw lastError;
}