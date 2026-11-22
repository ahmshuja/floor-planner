import { v4 as uuidv4 } from 'uuid';

const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'qwen2.5vl:7b';

const TARGET_CM = 1000;   // poora plan 10 m x 10 m ke andar fit hoga
const MAX_SIDE_PX = 896;  // model ko dene wali image ki badi side (28 ka multiple)
const SNAP_CM = 20;       // is se paas ke corners ek hi maane jayenge
const STRAIGHTEN_CM = 10; // itna tedha ho to wall seedhi kar do

type P = { x: number; y: number };
type RawWall = { start: P; end: P };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load nahi hui'));
    };
    img.src = url;
  });
}

// Image ko known size (28 ke multiple) mein resize karke base64 deta hai
async function prepareImage(file: File) {
  const img = await loadImage(file);
  const ratio = MAX_SIDE_PX / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(28, Math.round((img.naturalWidth * ratio) / 28) * 28);
  const h = Math.max(28, Math.round((img.naturalHeight * ratio) / 28) * 28);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas available nahi hai');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const base64 = canvas.toDataURL('image/png').split(',')[1];
  return { base64, w, h };
}

const buildPrompt = (w: number, h: number) => `This image is ${w}x${h} pixels and shows a 2D top-view floor plan.
Find every wall (thick dark lines). Return ONLY raw JSON, no markdown, no extra text:
{"walls":[{"start":{"x":number,"y":number},"end":{"x":number,"y":number}}]}
Rules:
- Coordinates are pixel positions in THIS image, origin at top-left, x to the right, y downward.
- Trace each straight wall along the centre of its line as one segment from end to end.
- Include exterior walls and interior walls.
- Walls that meet must share the same corner coordinates.
- Do not invent walls that are not visible. Do not add furniture.`;

function cleanWalls(raw: RawWall[], cmPerPx: number) {
  // pixel -> cm
  const walls = raw
    .filter(w => w && w.start && w.end)
    .map(w => ({
      start: { x: w.start.x * cmPerPx, y: w.start.y * cmPerPx },
      end: { x: w.end.x * cmPerPx, y: w.end.y * cmPerPx },
    }));

  // thodi tedhi walls ko seedha karo
  for (const w of walls) {
    if (Math.abs(w.start.x - w.end.x) < STRAIGHTEN_CM) {
      const x = (w.start.x + w.end.x) / 2;
      w.start.x = x;
      w.end.x = x;
    }
    if (Math.abs(w.start.y - w.end.y) < STRAIGHTEN_CM) {
      const y = (w.start.y + w.end.y) / 2;
      w.start.y = y;
      w.end.y = y;
    }
  }

  // paas ke corners ko ek hi point banao
  const anchors: P[] = [];
  const snap = (p: P): P => {
    const found = anchors.find(a => Math.hypot(a.x - p.x, a.y - p.y) <= SNAP_CM);
    if (found) return { x: found.x, y: found.y };
    anchors.push({ x: p.x, y: p.y });
    return { x: p.x, y: p.y };
  };

  return walls
    .map(w => ({ start: snap(w.start), end: snap(w.end) }))
    .filter(w => Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) > 5)
    .map(w => ({
      id: uuidv4(),
      start: { x: Math.round(w.start.x), y: Math.round(w.start.y) },
      end: { x: Math.round(w.end.x), y: Math.round(w.end.y) },
      thickness: 15,
      height: 250,
    }));
}

export async function scanFloorplanImageLocal(file: File) {
  try {
    const { base64, w, h } = await prepareImage(file);

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_ctx: 8192 },
        messages: [{ role: 'user', content: buildPrompt(w, h), images: [base64] }],
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Ollama error ${res.status}. Check karo ki model pull hua hai (ollama list).`
      );
    }

    const data = await res.json();
    const text = String(data.message.content)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(text);

    const cmPerPx = TARGET_CM / Math.max(w, h);
    // Local model se furniture bharosemand nahi aata, isliye sirf walls
    return { walls: cleanWalls(parsed.walls ?? [], cmPerPx), items: [] };
  } catch (error) {
    console.error('Local LLM Scan Error:', error);
    if (error instanceof TypeError) {
      throw new Error('Ollama se connect nahi hua. Ollama chal raha hai?');
    }
    throw error;
  }
}