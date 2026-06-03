# Clean product-cutout prompts (catalogue set)

The first batch were gorgeous **hero/campaign** renders (now in `/public/campaign`).
For the **product grid + PDP** we need the opposite: clean, consistent, text-free
cutouts so 12 cards read as one coherent catalogue. This prompt is tightened to
prevent exactly what slipped through last time.

## ❌ Hard "do NOT" list (the fixes)

- **NO text anywhere** — no model names, no brand names, no kanji, no spec
  lists, no price tags, no watermarks, no UI. Not in the scene and **not printed
  on the shoe** itself.
- **ONE shoe only** — a single shoe, not a pair, not duplicates.
- **ORIGINAL silhouette** — do not base it on any real shoe. Explicitly NOT
  Nike, Adidas, Jordan, New Balance, Puma; no Air Force 1, no Air Max / VaporMax
  visible-air bubble, no Jumpman, no swoosh, no three stripes.
- **No busy background** — flat seamless only (for clean cutout).
- **No helmets / props / mannequins / people.**

## ✅ The locked rig (JSON — keep identical for all 12)

```json
{
  "task": "studio e-commerce product photo of ONE original-design shoe",
  "framing": "single shoe centered, full shoe in frame with margin, floating slightly with a soft contact shadow",
  "angle": "3/4 front view, toe pointing left, eye level",
  "camera": "85mm, f/8, sharp front-to-back, no depth-of-field blur",
  "lighting": "large soft top-left key, soft fill, gentle cool rim light on the heel",
  "background": "perfectly seamless flat #F1F1F1, evenly lit, clean separation for easy background removal",
  "style": "photorealistic, crisp, premium, color-accurate, 4k",
  "negatives": "no text, no logos, no brand names, no kanji, no watermark, no price, no spec callouts, no writing on the shoe, not Nike, not Adidas, not Jordan, no Air Max bubble, no swoosh, no three stripes, single shoe only, no pair, no people, no props, no busy background"
}
```

Then set one `"subject"` per SKU from the table below, and render **3 angles**
each by swapping `"angle"`: `3/4 front (primary)`, `dead-side profile`,
`top-down flatlay`.

## Per-SKU subjects → filenames

| Subject (`"subject"`) | Primary file | Side | Top |
|---|---|---|---|
| lightweight daily running trainer, breathable knit upper, plush foam midsole — aurora coral→pink, white sole | `aurora-runner.png` | `aurora-runner-side.png` | `aurora-runner-top.png` |
| rugged waterproof trail shoe, aggressive deep lugs, bootie collar — slate + acid-lime, black sole | `trail-breaker.png` | `trail-breaker-side.png` | `trail-breaker-top.png` |
| heritage low leather court sneaker, clean toe, flat cupsole — off-white leather, gum sole | `court-classic.png` | … | … |
| knit sock-fit slip-on, seamless, soft chunky sole — heather grey, cream sole | `cloud-walker.png` | … | … |
| carbon-plated racing flat, ultra-thin mesh, high foam stack, exposed plate — molten orange, carbon black | `tempo-racer.png` | … | … |
| mid-cut hiking shoe, cushioned collar, supportive rand — earth brown + teal, lugged sole | `summit-hiker.png` | … | … |
| low flexible cross-training shoe, wide grippy outsole — charcoal + electric yellow | `studio-flex.png` | … | … |
| minimalist recovery slide sandal, contoured sculpted footbed — matte black | `metro-slide.png` | … | … |
| structured stability road running trainer, firm heel, dual-density sole — cobalt blue, grey sole | `pace-setter.png` | … | … |
| low canvas sneaker, vulcanized rubber sole, simple — ecru canvas, cream sole | `canvas-low.png` | … | … |
| insulated winter boot, quilted upper, deep lugged grip — deep navy + ice-blue, black sole | `glacier-boot.png` | … | … |
| quick-dry adventure sandal, webbing straps, grippy sole — olive webbing, black sole | `river-sandal.png` | … | … |

(Side/top follow the same `<slug>-side.png` / `<slug>-top.png` pattern from
README.md. Only the 12 **primaries** are needed for a complete-looking site.)
