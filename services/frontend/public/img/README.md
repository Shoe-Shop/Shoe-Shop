# Product imagery (catalogue cutouts)

These are the **transparent (RGBA) product cutouts** the storefront renders on
cards, the hero stage and the PDP. The catalogue serves each product's
`imageUrl` (the `/img/<slug>.png` below); the file name must match exactly or the
product falls back to the on-brand accent placeholder (never a broken image).

The set was re-themed (2026-06-05) to a premium athletic / streetwear / cyber
line so every photo matches its product. **SKU IDs are stable** — inventory
stock and carts reference them; only name/price/imagery changed
(`services/catalogue/internal/store/seed.sql`).

## Mapping: SKU id → file → product

| SKU id | File (`/img/…`) | Product | Brand | Look |
|--------|-----------------|---------|-------|------|
| sku-aurora-runner | `solaris-max.png`   | Solaris Max    | Stride | orange max runner |
| sku-trail-breaker | `terra-trail.png`   | Terra Trail    | Aether | olive trail runner |
| sku-court-classic | `court-apex.png`    | Court Apex     | Apex   | cobalt basketball high-top |
| sku-cloud-walker  | `ember-knit.png`    | Ember Knit     | Stride | red knit runner |
| sku-tempo-racer   | `tempo-racer.png`   | Tempo Racer    | Stride | red racing flat |
| sku-summit-hiker  | `shadow-runner.png` | Shadow Runner  | Stride | black blade runner |
| sku-studio-flex   | `vortex-mid.png`    | Vortex Mid     | Apex   | black/orange tech mid |
| sku-metro-slide   | `onyx-high.png`     | Vampire Noir   | Apex   | all-black vampire high-top |
| sku-pace-setter   | `flux-pace.png`     | Flux Pace      | Stride | white/orange high-top |
| sku-canvas-low    | `phantom.png`       | Phantom        | Aether | crimson/silver cyber |
| sku-glacier-boot  | `neurovibe.png`     | Neurovibe MX   | Aether | black/orange cyber |
| sku-river-sandal  | `vampire.png`       | Vampire        | Apex   | black + bone-white vampire |

Source masters (and the unused alternates / editorial scene shots used by the
home Campaign + Lookbook) live in `../campaign/`.

## Format
- **PNG, transparent background (RGBA)** — shoe floats on the dark card.
- Square-ish framing, shoe centered with margin, soft contact shadow.
- ~1200–2000px, keep under ~1.5 MB each.
- Optional `<slug>-side.png` / `<slug>-top.png` light up the PDP gallery.
