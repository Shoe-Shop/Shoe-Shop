# Product imagery — drop your generated PNGs here

**Folder:** `E:\Shoe-Shop\services\frontend\public\img\`
(served by the app at `/img/...`)

The storefront loads each product's **main image** from the BFF's exact
`imageUrl` — which is the slug below, **no `sku-` prefix and no suffix**. Name
the files exactly as listed or they won't wire up.

## Naming convention

| Role | Filename pattern | Used by |
|------|------------------|---------|
| **Primary** (required) | `<slug>.png` | cards, hero, PDP main |
| Side profile | `<slug>-side.png` | PDP gallery |
| Top-down | `<slug>-top.png` | PDP gallery |

> Only the **primary** is strictly required for the site to look complete; the
> `-side` / `-top` angles light up the PDP gallery as they arrive. Until a file
> exists, that product shows an intentional accent placeholder (not a broken
> image), so you can drop them in any order.

## The 12 real SKUs → exact filenames

| Shoe | Brand | Primary (required) | Side | Top |
|------|-------|--------------------|------|-----|
| Aurora Runner | Hballo | `aurora-runner.png` | `aurora-runner-side.png` | `aurora-runner-top.png` |
| Trail Breaker GTX | Hballo | `trail-breaker.png` | `trail-breaker-side.png` | `trail-breaker-top.png` |
| Court Classic | Vellum | `court-classic.png` | `court-classic-side.png` | `court-classic-top.png` |
| Cloud Walker | Vellum | `cloud-walker.png` | `cloud-walker-side.png` | `cloud-walker-top.png` |
| Tempo Racer Carbon | Stride | `tempo-racer.png` | `tempo-racer-side.png` | `tempo-racer-top.png` |
| Summit Hiker Mid | Stride | `summit-hiker.png` | `summit-hiker-side.png` | `summit-hiker-top.png` |
| Studio Flex | Kettle | `studio-flex.png` | `studio-flex-side.png` | `studio-flex-top.png` |
| Metro Slide | Kettle | `metro-slide.png` | `metro-slide-side.png` | `metro-slide-top.png` |
| Pace Setter 2 | Hballo | `pace-setter.png` | `pace-setter-side.png` | `pace-setter-top.png` |
| Canvas Low | Vellum | `canvas-low.png` | `canvas-low-side.png` | `canvas-low-top.png` |
| Glacier Boot | Summit | `glacier-boot.png` | `glacier-boot-side.png` | `glacier-boot-top.png` |
| River Sandal | Summit | `river-sandal.png` | `river-sandal-side.png` | `river-sandal-top.png` |

## Format

- **PNG with transparent background** (alpha) preferred, or a flat `#F1F1F1`
  seamless that's been background-removed.
- Square-ish framing, shoe centered with margin, soft contact shadow.
- Keep them reasonably sized (~1200–2000px, < ~1.5 MB each is plenty).
