import type { Wall, Point } from '../store/useStore';

export type Room = {
  id: string;
  areaCm2: number;
  perimeterCm: number;
  points: Point[];
  centroid: Point;
};

const SNAP = 5;            // cm: is se paas ke points ek hi corner maane jayenge
const EPS = 1e-6;
const MIN_ROOM_CM2 = 2000; // 0.2 m2 se chhote loops ignore

type Seg = { a: Point; b: Point };

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

function lineIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

function distToSegment(p: Point, s: Seg): { d: number; t: number } {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return { d: dist(p, s.a), t: 0 };
  let t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { d: dist(p, { x: s.a.x + t * dx, y: s.a.y + t * dy }), t };
}

// Walls ko wahan se todta hai jahan wo ek dusre se milti ya cross karti hain
function splitSegments(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  segs.forEach((s, i) => {
    const len = dist(s.a, s.b);
    if (len < EPS) return;
    const ts: number[] = [0, 1];

    segs.forEach((o, j) => {
      if (i === j) return;
      const p = lineIntersection(s.a, s.b, o.a, o.b);
      if (p) ts.push(distToSegment(p, s).t);
      for (const e of [o.a, o.b]) {
        const { d, t } = distToSegment(e, s);
        if (d <= SNAP) ts.push(t);
      }
    });

    ts.sort((x, y) => x - y);
    const at = (t: number): Point => ({
      x: s.a.x + (s.b.x - s.a.x) * t,
      y: s.a.y + (s.b.y - s.a.y) * t,
    });
    for (let k = 0; k < ts.length - 1; k++) {
      if ((ts[k + 1] - ts[k]) * len > 0.5) {
        out.push({ a: at(ts[k]), b: at(ts[k + 1]) });
      }
    }
  });
  return out;
}

export function detectRooms(walls: Wall[]): Room[] {
  const segs = splitSegments(walls.map(w => ({ a: w.start, b: w.end })));

  // Nodes (corners) with snapping
  const nodes: Point[] = [];
  const getNode = (p: Point): number => {
    const idx = nodes.findIndex(n => dist(n, p) <= SNAP);
    if (idx >= 0) return idx;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };

  const adj = new Map<number, Set<number>>();
  const link = (u: number, v: number) => {
    if (!adj.has(u)) adj.set(u, new Set());
    adj.get(u)!.add(v);
  };
  for (const s of segs) {
    const u = getNode(s.a);
    const v = getNode(s.b);
    if (u === v) continue;
    link(u, v);
    link(v, u);
  }

  // Har node ke neighbours ko angle ke hisaab se sort karo
  const sorted = new Map<number, number[]>();
  adj.forEach((set, u) => {
    const list = Array.from(set);
    list.sort(
      (a, b) =>
        Math.atan2(nodes[a].y - nodes[u].y, nodes[a].x - nodes[u].x) -
        Math.atan2(nodes[b].y - nodes[u].y, nodes[b].x - nodes[u].x)
    );
    sorted.set(u, list);
  });

  // Faces trace karo (planar graph face traversal)
  const visited = new Set<string>();
  const key = (u: number, v: number) => `${u}-${v}`;
  const rooms: Room[] = [];

  sorted.forEach((neighbors, u) => {
    for (const v of neighbors) {
      if (visited.has(key(u, v))) continue;

      let cu = u;
      let cv = v;
      const pts: Point[] = [];
      let guard = 0;
      while (!visited.has(key(cu, cv)) && guard++ < 10000) {
        visited.add(key(cu, cv));
        pts.push(nodes[cu]);
        const nb = sorted.get(cv)!;
        const idx = nb.indexOf(cu);
        const w = nb[(idx - 1 + nb.length) % nb.length];
        cu = cv;
        cv = w;
      }

      if (pts.length < 3) continue;

      let signed = 0;
      let perimeter = 0;
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        const cross = p.x * q.y - q.x * p.y;
        signed += cross;
        cx += (p.x + q.x) * cross;
        cy += (p.y + q.y) * cross;
        perimeter += dist(p, q);
      }
      signed /= 2;

      // Positive area = andar wala room, negative = bahar ka outer face
      if (signed > MIN_ROOM_CM2) {
        rooms.push({
          id: '',
          areaCm2: signed,
          perimeterCm: perimeter,
          points: pts,
          centroid: { x: cx / (6 * signed), y: cy / (6 * signed) },
        });
      }
    }
  });

  // Top-left se bottom-right order me numbering
  rooms.sort((a, b) => {
    const ay = Math.min(...a.points.map(p => p.y));
    const by = Math.min(...b.points.map(p => p.y));
    if (Math.abs(ay - by) > 1) return ay - by;
    return Math.min(...a.points.map(p => p.x)) - Math.min(...b.points.map(p => p.x));
  });
  rooms.forEach((r, i) => (r.id = `room-${i + 1}`));

  return rooms;
}