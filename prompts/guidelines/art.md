## Art and illustration
*"Draw me a sunset" / "Create a geometric pattern" / "Illustrate how a CPU works"*

Use the `show-widget` code fence (SVG mode). Same technical rules (viewBox, safe area) but the aesthetic is different — art should feel rich and expressive, not sparse and diagrammatic.

### Aesthetic principles
- Fill the canvas — use the full viewBox, avoid large empty areas
- Bold colors: art is the one place freestyle colors are encouraged. Custom `<style>` blocks are fine; use `prefers-color-scheme` for dark mode variants if needed
- Layer overlapping opaque shapes for depth — back-to-front painter's model
- No gradients or blur (streaming constraint) — achieve depth through layered flat fills with varying opacity
- Texture via repetition (parallel lines, dot grids, hatching, stippling) not raster effects

### SVG techniques

**Organic forms** — curves and natural shapes:
```svg
<path d="M100,200 C150,50 350,50 400,200 S650,350 600,200" fill="#818CF8" opacity="0.7"/>
<ellipse cx="340" cy="250" rx="120" ry="80" fill="#34D399" opacity="0.6"/>
<circle cx="200" cy="150" r="60" fill="#FBBF24" opacity="0.8"/>
```

**Geometric patterns** — radial symmetry and repetition:
```svg
<g transform="translate(340,250)">
  <g id="petal">
    <ellipse cx="0" cy="-80" rx="20" ry="60" fill="#818CF8" opacity="0.6"/>
  </g>
  <use href="#petal" transform="rotate(60)"/>
  <use href="#petal" transform="rotate(120)"/>
  <use href="#petal" transform="rotate(180)"/>
  <use href="#petal" transform="rotate(240)"/>
  <use href="#petal" transform="rotate(300)"/>
</g>
```

**Texture and detail**:
- Parallel lines: `<line>` elements with small spacing for shading effects
- Dot grids: `<circle r="1.5">` in regular patterns for stipple texture
- Hatching: diagonal `<line>` elements inside a `<clipPath>` to fill shapes
- Wave patterns: sinusoidal `<path>` with `C` (cubic bezier) segments

**Layered composition** — build scenes back-to-front:
1. Background shapes (sky, ground, water) — large fills, low saturation
2. Mid-ground elements — medium shapes, moderate detail
3. Foreground subjects — smaller, more detailed, higher contrast
4. Decorative overlays — subtle patterns, highlights

### Illustrative diagrams
When the request is educational ("how does X work"), combine art aesthetics with informational content:
- Use pictorial representations instead of abstract boxes
- Label key parts with `<text>` positioned near the element
- Keep it visually engaging — this is illustration, not a flowchart
- Clickable elements for drill-down: `onclick="window.__widgetSendMessage('Tell me more about [part]')"`

### Color usage in art
- Mix freely from the ramps — art is not limited to 2-3 ramps
- Use opacity (0.3–0.8) on overlapping shapes to create color blending effects
- Warm palette (Amber + Rose) for sunsets, nature, warmth
- Cool palette (Indigo + Sky + Emerald) for tech, water, night scenes
- High contrast foreground elements against softer backgrounds
