// Per-product accent colours. These mirror the signature colours in the image
// art-direction brief, so the UI (cards, hero, PDP) reads coherently before the
// real PNGs land and stays coherent after. Unknown SKUs fall back to a stable
// hash so an expanded catalogue still gets distinct, deterministic accents.
const ACCENTS: Record<string, [from: string, to: string]> = {
  "sku-aurora-runner": ["#ff6b6b", "#ff9e7d"],
  "sku-trail-breaker": ["#a3e635", "#475569"],
  "sku-court-classic": ["#c8b6a6", "#8d6e63"],
  "sku-cloud-walker": ["#b8c0cc", "#8a94a6"],
  "sku-tempo-racer": ["#ff6a00", "#1a1a1a"],
  "sku-summit-hiker": ["#2a9d8f", "#6b4f3a"],
  "sku-studio-flex": ["#ffe100", "#2b2b2b"],
  "sku-metro-slide": ["#5a5a5a", "#9e9e9e"],
  "sku-pace-setter": ["#2563eb", "#60a5fa"],
  "sku-canvas-low": ["#d8c9a8", "#b49a6b"],
  "sku-glacier-boot": ["#1e3a8a", "#7dd3fc"],
  "sku-river-sandal": ["#6b8e23", "#a3b86c"],
};

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

export interface ProductAccent {
  from: string;
  to: string;
}

export function productAccent(id: string): ProductAccent {
  const curated = ACCENTS[id];
  if (curated) return { from: curated[0], to: curated[1] };
  const hue = hashHue(id);
  return {
    from: `hsl(${hue} 72% 56%)`,
    to: `hsl(${(hue + 38) % 360} 70% 46%)`,
  };
}
