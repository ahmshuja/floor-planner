import { v4 as uuidv4 } from 'uuid';

export const FLOORPLAN_PROMPT = `Analyze this floor plan image and convert it into a JSON structure for a 2D floor planner application.
CRITICAL: You must return ONLY raw valid JSON. Do not use Markdown code blocks. Do not add any explanatory text.

JSON Schema to follow exactly:
{
  "walls": [
    { "start": { "x": number, "y": number }, "end": { "x": number, "y": number }, "thickness": number, "height": number }
  ],
  "items": [
    { "type": "door"|"window"|"bed"|"sofa"|"bathtub"|"toilet"|"washbasin", "position": { "x": number, "y": number }, "rotation": number, "width": number, "length": number, "height": number }
  ]
}

Instructions:
1. Use a coordinate system where top-left is (0,0), mapping the dimensions of the plan into cm. Assume 1 pixel in the image equals approximately 1 cm, or read dimensions from the image if present.
2. Estimate the scale to fit the entire floorplan within a 1000x1000 coordinate area.
3. Default wall thickness should be 15, and height should be 250.
4. Doors and windows MUST intersect or lie perfectly on top of walls.
5. Accurately trace all exterior and interior walls as connected segments.
6. Identify common furniture (beds, sofas, toilets, bathtubs) and map them accurately.
`;

export function parseScanResult(text: string) {
  // Clean markdown if present
  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(clean);

  // Add IDs to the generated elements
  if (parsed.walls) {
    parsed.walls = parsed.walls.map((w: any) => ({
      ...w,
      id: uuidv4(),
      thickness: w.thickness || 15,
      height: w.height || 250,
    }));
  }
  if (parsed.items) {
    parsed.items = parsed.items.map((i: any) => ({ ...i, id: uuidv4() }));
  }

  return parsed;
}