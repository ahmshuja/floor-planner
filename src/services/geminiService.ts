import { GoogleGenerativeAI } from '@google/generative-ai';
import { useStore } from '../store/useStore';
import { FLOORPLAN_PROMPT, parseScanResult } from './floorplanPrompt';
import { scanFloorplanImageLocal } from './localLlmService';

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
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  try {
    const imagePart = await fileToGenerativePart(file);
    const result = await model.generateContent([FLOORPLAN_PROMPT, imagePart]);
    const responseText = result.response.text();
    return parseScanResult(responseText);
  } catch (error) {
    console.error('Gemini Scan Error:', error);
    throw error;
  }
}
