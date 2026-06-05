// Per-product accent colours. These mirror the signature colours in the image
// art-direction brief, so the UI (cards, hero, PDP) reads coherently before the
// real PNGs land and stays coherent after. Unknown SKUs fall back to a stable
// hash so an expanded catalogue still gets distinct, deterministic accents.
const ACCENTS: Record<string, [from: string, to: string]> = {
  "sku-aurora-runner": ["#ff7a18", "#ffce8a"], // Solaris Max — orange
  "sku-trail-breaker": ["#9aa83a", "#cdd98a"], // Terra Trail — olive/lime
  "sku-court-classic": ["#2563eb", "#7aa2ff"], // Court Apex — cobalt
  "sku-cloud-walker": ["#e23744", "#ff8f8f"], // Ember Knit — red
  "sku-tempo-racer": ["#ff2e2e", "#1a1a1a"], // Tempo Racer — red/black
  "sku-summit-hiker": ["#6b6b6b", "#b4b4b4"], // Shadow Runner — graphite
  "sku-studio-flex": ["#ff7a18", "#1a1a1a"], // Vortex Mid — orange/black
  "sku-metro-slide": ["#5a5a5a", "#1a1a1a"], // Vampire Noir — all-black
  "sku-pace-setter": ["#ff8a3d", "#e8e8ec"], // Flux Pace — white/orange
  "sku-canvas-low": ["#d12f3a", "#c8ccd4"], // Phantom — crimson/silver
  "sku-glacier-boot": ["#ff7a18", "#1a1a1a"], // Neurovibe MX — orange/black
  "sku-river-sandal": ["#d7d9de", "#3a3a3a"], // Vampire — bone-white/charcoal
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
