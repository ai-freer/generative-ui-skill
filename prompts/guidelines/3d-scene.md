## 3D scene (Three.js)
*"Show the solar system in 3D" / "Demonstrate sake brewing with a 3D model" / "Visualize a DNA double helix" / "Show me how a gear train works" / "沉浸式演示酿造啤酒的过程"*

Use the `show-widget` code fence (HTML mode) for 3D scenes. Three.js renders into a `<canvas>` element with OrbitControls for camera interaction.

**When to use 3D vs illustrative diagram.** 3D scenes are expensive to generate and harder to control than 2D diagrams. **Default to NOT using 3D.** Only use 3D when you are confident the subject genuinely requires spatial perspective. When in doubt, use illustrative diagram or interactive HTML — they are cheaper, faster, and more predictable.

| User says | Route to | Reason |
|---|---|---|
| "show the solar system in 3D" | **3D scene** | explicit "3D" keyword |
| "how does the solar system work" | illustrative diagram | mechanism explanation, no explicit 3D request |
| "visualize a DNA double helix" | **3D scene** | explicit "visualize" + helix is inherently 3D geometry |
| "explain how DNA replication works" | illustrative diagram | process/mechanism, not spatial shape |
| "show a gear train" | **3D scene** | mechanical rotation is inherently 3D |
| "how does a gear ratio work" | illustrative diagram | ratio concept, 2D suffices |
| "show a crystal lattice" | **3D scene** | atomic spatial arrangement, unambiguously 3D |
| "show the layers of the atmosphere" | illustrative diagram | concentric 2D rings are clearer |
| "demonstrate sake brewing in 3D" | **3D scene** | explicit "3D" keyword |
| "explain sake brewing process" | stepper / flowchart | sequential process, not spatial geometry |
| "沉浸式演示酿造啤酒的过程" | **3D scene** | "immersive" + brewing has physical spatial scene (tanks, vessels) |
| "沉浸式解释快速排序算法" | interactive HTML stepper | "immersive" but algorithm has no spatial geometry |

**The routing rule — conservative by default:**

3D is expensive and less predictable than 2D. Do not default to it. Use this decision tree:

**Path A — User explicitly says "3D" / "三维" / "立体模型":**
→ Use 3D. The user has stated their intent clearly. Only refuse if the subject is fundamentally impossible to spatialize (e.g. "用3D展示这段代码", "3D显示这个JSON"). In those cases, explain why and fall back to the best 2D format.

**Path B — User says "immersive" / "沉浸" / "沉浸式" (without "3D"):**
→ Use 3D only if the subject involves physical objects in space (brewing equipment, mechanical parts, planets, molecules). If the subject is abstract (algorithms, concepts, data flows), use the richest non-3D format instead (interactive HTML stepper, illustrative diagram).

**Path C — No explicit keyword, but the subject is spatial geometry:**
→ Use 3D only if the subject is **unambiguously** 3D geometry (double helix, crystal lattice, planetary orbits, interlocking gears) AND rotating around it adds genuine understanding that a 2D view cannot provide. If a cross-section, top-down view, or step-through animation conveys the same information, do NOT use 3D.

**If none of A/B/C apply, or you are not confident → do NOT use 3D.** A well-executed 2D widget is always better than a mediocre 3D scene.

### Setup

Every 3D widget uses this exact shell. The LLM writes scene content (meshes, materials, helpers, camera positioning) **after** the `init()` block as top-level statements — never inside `init()`.

**Progressive rendering rule — strict ordering:**
- The shell must end right after the first `if (window.THREE && THREE.OrbitControls) init();`
- That `init();` line must appear immediately after the shell, not at the end of a long scene-building script
- All mesh creation, `scene.add(...)`, state arrays, click target registration, labels, and step data must appear after that line as top-level code
- Forbidden pattern: building the entire scene inside `init()` and calling `init();` only at the very end. That shape prevents early iframe boot and collapses streaming back to a placeholder

```html
<style>
canvas { display: block; width: 100% !important; height: 420px !important; }
#controls { display: flex; align-items: center; gap: 12px; padding: 10px 0 0; font-size: 13px; color: var(--color-text-secondary); }
</style>
<canvas id="c"></canvas>
<div id="controls"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js" onload="init()"></script>
<script>
var scene, camera, renderer, controls;
function init() {
  if (!window.THREE || !THREE.OrbitControls) return;
  var canvas = document.getElementById('c');
  var W = canvas.clientWidth, H = 420;
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.position.set(0, 4, 10);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  var sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(5, 8, 5);
  scene.add(sun);

  controls = new THREE.OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}
if (window.THREE && THREE.OrbitControls) init();

// --- scene content starts here ---
// All mesh creation, material setup, camera positioning, and controls
// configuration goes here as top-level statements.
// These run after init() completes, and scene/camera/renderer/controls
// are accessible as global variables.
// --- scene content ends here ---
</script>
```

**Key decisions in this boilerplate:**
- `var scene, camera, renderer, controls` declared at script top level — these become `window` properties, accessible to external code injection via `postMessage`. Other local variables (`canvas`, `W`, `H`, `sun`) stay inside `init()`.
- **Scene content lives outside `init()`** — mesh code is written as top-level statements after the `init()` block. Since `scene`, `camera`, `renderer`, `controls` are global variables, they are accessible from top-level code. This structure enables progressive rendering: the shell (init + animate loop) runs first, then mesh code streams in and objects appear incrementally as `scene.add()` is called.
- **`init();` is the shell boundary** — once the first `init();` line appears, the iframe can boot. If that line is delayed until after all scene-building code, streaming loses the progressive effect even if the final widget still works.
- `alpha: true` — transparent background, host provides the bg. Works in both light and dark mode without any CSS variable detection.
- `autoRotate` defaults to off. Only enable it (`controls.autoRotate = true; controls.autoRotateSpeed = 0.6;`) for orbital and molecular scenes where continuous rotation helps the user see all sides. Architectural, process, and static scenes should leave it off so the user controls the camera.
- `enableDamping` — smooth camera feel without a physics engine.
- **Load-order safety**: The `onload="init()"` on the OrbitControls script tag guarantees `init()` fires after both scripts load. The trailing `if (window.THREE && THREE.OrbitControls) init()` is a fallback for cases where the scripts are already cached. This mirrors the Chart.js `onload` pattern exactly.
- Canvas height fixed at 420px — tall enough for spatial depth, short enough to not dominate the chat.

**Two shell variants.** Use the base shell above for most scenes (solar system, molecular, mechanical). For process demonstration scenes that need HTML overlay labels above 3D objects, use the process shell instead:

```html
<style>
canvas { display: block; width: 100% !important; height: 420px !important; }
.scene-wrap { position: relative; }
#labels { position: absolute; top: 0; left: 0; width: 100%; height: 420px; pointer-events: none; overflow: hidden; }
#controls { display: flex; align-items: center; gap: 12px; padding: 10px 0 0; font-size: 13px; color: var(--color-text-secondary); }
</style>
<div class="scene-wrap">
  <canvas id="c"></canvas>
  <div id="labels"></div>
</div>
<div id="controls"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js" onload="init()"></script>
<script>
var scene, camera, renderer, controls;
var updateLabels = function() {};
function init() {
  // ... same as base shell, plus updateLabels() in animate loop
}
if (window.THREE && THREE.OrbitControls) init();

// --- scene content (meshes, labels, camera position) goes here ---
</script>
```

The process shell adds `.scene-wrap` (relative container) and `#labels` (absolute overlay). See `examples/brewing-process.html` for the complete working reference.

For process scenes, `updateLabels` must exist in the shell as a no-op function before `init()` runs. Later streamed code can replace it with the real implementation after the shell has already booted.

### Lighting

Two lights only — ambient + one directional. This is the hard budget:

```js
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(5, 8, 5);
```

No point lights, no spotlights, no shadows (`renderer.shadowMap.enabled` stays false). The ambient+directional combo gives enough shading to read 3D form without GPU cost in a sandboxed iframe.

**Exception for solar system scenes**: The central star can use `MeshBasicMaterial` (self-lit, ignores lighting) while planets use `MeshLambertMaterial` (shaded). This creates a natural "star glows, planets are lit" effect without adding a point light.

### Materials and colors

Use the existing palette as Three.js material colors. Because 3D materials are darkened by lighting (Lambert shading), use **200-stops for bright/emissive roles** (stars, highlights, energy) and **400-stops for standard objects**. Do not invent hex values — pick from this table:

| Semantic role | Ramp | Hex | Stop | Use for |
|---|---|---|---|---|
| Primary object | purple | `0x7F77DD` | 400 | main subject, featured element |
| Secondary object | teal | `0x1D9E75` | 400 | supporting elements, secondary bodies |
| Energy / heat / star | amber | `0xEF9F27` | 200 | stars, hot zones, active elements (bright) |
| Structure / inert | gray | `0x888780` | 400 | scaffolding, axes, ground planes, bonds |
| Organic / biological | green | `0x639922` | 400 | biological subjects, vegetation |
| Highlight / selected | coral | `0xD85A30` | 400 | highlighted step, selected object |
| Water / cold | blue | `0x378ADD` | 400 | water, cold zones, Earth |
| Alert / danger | red | `0xE24B4A` | 400 | warning indicators |

**Material rules:**
- `MeshLambertMaterial` for most objects — cheap, reads well under ambient+directional.
- `MeshBasicMaterial` only for: wireframes, axes, orbit path lines, and self-luminous objects (stars).
- No `MeshStandardMaterial` or `MeshPhongMaterial` — too expensive for the complexity budget.
- `wireframe: true` on a secondary mesh layered over a solid mesh gives a clean "technical" look for mechanical subjects.
- No texture maps — `TextureLoader` URLs are blocked by CSP. Color-only materials.

**Dark mode**: Material colors are hardcoded hex (Three.js cannot read CSS variables). The transparent canvas background means the scene floats on whatever the host bg is. The palette 400-stops are mid-tone — they read on both light and dark backgrounds. Do not attempt to detect `prefers-color-scheme` and swap material colors.

**Architectural scenes must not degrade into white-box massing models.** For palaces, temples, cathedrals, bridges, city blocks, and other landmark architecture, a gray-only or white-only material pass is incorrect unless the user explicitly asks for a monochrome maquette. Use palette colors to separate roofs, walls, platforms, ground, water, vegetation, and focal structures. Forbidden pattern: every building using near-white `MeshLambertMaterial` with only shading differences. Required pattern: at least one warm roof color, one neutral structural color, and one environmental/support color so the scene reads as architecture, not placeholder geometry.

### Complexity budget

Modern devices handle Three.js well — the main constraint is code generation length, not GPU. The budgets below are guidelines, not hard caps. If a scene's key objects need more geometry to be recognizable, exceed the budget rather than produce flat, featureless shapes.

| Constraint | Simple scenes | Complex scenes | Landmark / large scenes |
|---|---|---|---|
| Distinct mesh objects | ≤ 20 | ≤ 60 | ≤ 100+ |
| Total triangles | ≤ 8 000 | ≤ 30 000 | ≤ 60 000+ |
| Lights | 2 | 2 | 2 |
| Animation loops | 1 | 1 | 1 |
| Texture maps | 0 | 0 | 0 |
| Post-processing passes | 0 | 0 | 0 |

Choose the tier based on how many distinct objects the scene contains and how much detail their identifying features require. When in doubt, use the higher tier — an under-detailed scene is worse than a slightly heavier one.

**Polygon budget hints by scene type.** The table above gives general tiers. For specific scene types, use these magnitude references to calibrate your geometry investment:

> **Large immersive scenes** (city blocks, palace complexes, factory grounds, theme parks):
> 80–120 mesh objects, 40 000–80 000 triangles. The scene's spatial layout is the signature — invest in correct relative positioning and scale. Each landmark building needs enough geometry for its silhouette to be recognizable (roof shape, facade features). Background/filler buildings can be simple boxes.

> **Architectural subjects** (single buildings, temples, cathedrals, bridges, towers):
> 40–80 mesh objects, 20 000–50 000 triangles. A single building's identifying features (roof curvature, arches, columns, domes, stepped platforms) need high segment counts. A flat BoxGeometry roof on a building with curved eaves loses all character. Increase CylinderGeometry/SphereGeometry segments (32–48) for curved architectural elements.

> **Organic / natural forms** (terrain, trees, creatures, human figures):
> 30–60 mesh objects, 15 000–40 000 triangles. Curved surfaces need higher tessellation to avoid visible faceting. Use SphereGeometry(r, 24, 16) or higher for organic shapes. Terrain can use PlaneGeometry with vertex displacement for hills.

> **Complex mechanical assemblies** (engines, clockwork, multi-gear trains, industrial machinery):
> 40–70 mesh objects, 20 000–40 000 triangles. Cylindrical parts (gears, shafts, pistons) need ≥24 radial segments to look round. Each gear/component should be visually distinct — vary radius, thickness, and color.

**The sketch principle — two layers of analysis.** Before writing any geometry code, analyze the scene on two distinct levels:

1. **Scene-level signature** — the overall spatial layout and relationships that define the scene. This is about arrangement, not individual objects. Examples: the orbital layout of a solar system, the axial symmetry of a palace complex, the layered stacking of a geological cross-section. Get this right first — it establishes the "stage."

2. **Object-level identifying features** — the specific visual detail on each key object that makes it instantly recognizable. This is the critical layer. Every important object in the scene has one or two features that distinguish it from a generic shape. If you skip these, the object becomes an anonymous box or sphere and the scene loses its meaning.

The core rule: **identify each key object's recognizable feature, then allocate enough mesh and triangle budget to express it.** Do not cap the budget so tightly that identifying features get flattened into generic primitives. Reduce detail on background and secondary objects instead — they can be simple shapes as long as the key objects read correctly.

**Spatial accuracy for real-world subjects.** When recreating a real place or object, research its actual proportions and relative sizes. Do not guess — use known dimensions or ratios. Main structures should be visibly larger than secondary ones. Spacing between objects should reflect real proportions. Getting relative scale right matters more than absolute accuracy — the viewer should feel the spatial rhythm of the original.

**Standard geometry segment counts** — use these defaults as a starting point. For architectural scenes that need smoother curves (domes, columns, roof eaves), increase segments as needed within the triangle budget:

| Geometry | Constructor | Triangles |
|---|---|---|
| Sphere | `SphereGeometry(r, 16, 12)` | 384 |
| Torus | `TorusGeometry(r, t, 12, 24)` | 576 |
| Cylinder | `CylinderGeometry(rT, rB, h, 16)` | ~128 |
| Box | `BoxGeometry(w, h, d)` | 12 |
| Ring (orbit path) | `RingGeometry(rIn, rOut, 64)` | 128 |

A solar system scene with 1 sphere (sun) + 3 spheres (planets) + 3 rings (orbits) = 384×4 + 128×3 = 1920 triangles — well within the simple budget. Box-based primitives are very cheap (12 triangles each), so even 100 boxes only cost 1200 triangles, leaving ample room for detail within the higher budgets.

### Animation patterns

Three patterns. Pick the one that matches the scene type.

#### Auto-rotation (orbital and molecular scenes only)

Add `controls.autoRotate = true; controls.autoRotateSpeed = 0.6;` after the OrbitControls setup. The scene slowly rotates so the user sees all sides. User click-drags to take manual control; releasing resumes auto-rotation.

Use for: small rotating models (molecules, crystals, single mechanical parts). Do NOT use for architectural scenes, building complexes, or process demonstrations — these need stable camera control so the user can explore at their own pace.

#### Orbital animation

For solar system, atomic model, or any scene with bodies orbiting a center. Each orbiting body gets its own angle variable updated in the animate loop:

```js
let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.005;
  earth.position.set(Math.cos(t * 1.0) * 5, 0, Math.sin(t * 1.0) * 5);
  mars.position.set(Math.cos(t * 0.6) * 8, 0, Math.sin(t * 0.6) * 8);
  controls.update();
  renderer.render(scene, camera);
}
```

Speed multipliers should reflect relative orbital periods (inner planets faster). Keep `t` increment small (0.005–0.01) for smooth motion.

Use for: solar system, atomic orbitals, electron shells.

#### Step-through animation

For process demonstrations (sake brewing stages, manufacturing steps, assembly sequences). A `step` variable controls which groups are visible. Play/pause button advances steps on a timer or on click:

```js
const stages = [group1, group2, group3, group4];
const labels = ['Steaming rice', 'Adding koji', 'Fermentation', 'Pressing'];
let step = 0, playing = false, timer;

function showStep(n) {
  stages.forEach((g, i) => { g.visible = i <= n; });
  document.getElementById('step-label').textContent = labels[n];
}

function togglePlay() {
  playing = !playing;
  document.getElementById('btn').textContent = playing ? 'Pause' : 'Play';
  if (playing) {
    timer = setInterval(() => {
      step = (step + 1) % stages.length;
      showStep(step);
    }, 2000);
  } else {
    clearInterval(timer);
  }
}
showStep(0);
```

Each stage is a `THREE.Group` containing the meshes for that step. Earlier stages stay visible as later ones appear (cumulative reveal). Set `controls.autoRotate = false` during step playback to keep the camera stable.

Use for: brewing/manufacturing processes, assembly sequences, geological formation.

### Interactive controls

Controls live in `<div id="controls">` below the canvas. Use the host's pre-styled form elements.

**Play/pause** (for step-through and orbital scenes):
```html
<button id="btn" onclick="togglePlay()">Play</button>
<span id="step-label" style="flex:1">Steaming rice</span>
```

**Camera preset buttons** (top / side / front views):
```html
<button onclick="setView('top')">Top</button>
<button onclick="setView('side')">Side</button>
<button onclick="setView('front')">Front</button>
```
```js
function setView(v) {
  const pos = { top: [0, 12, 0.1], side: [12, 2, 0], front: [0, 2, 12] }[v];
  camera.position.set(...pos);
  camera.lookAt(0, 0, 0);
  controls.update();
}
```

**Parameter slider** (orbital speed, scale, etc.):
```html
<label style="display:flex;align-items:center;gap:8px;flex:1">
  Speed <input type="range" min="1" max="10" value="5" step="1" style="flex:1" oninput="speedMul=this.value*0.2">
</label>
```

### Drill-down via raycasting

Make 3D objects clickable with `window.__widgetSendMessage()`. Use Three.js raycasting on canvas click:

```js
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const clickTargets = [earth, mars, jupiter];

canvas.addEventListener('click', function(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(clickTargets);
  if (hits.length) {
    var name = hits[0].object.name;
    window.__widgetSendMessage('Tell me more about ' + name);
  }
});
```

Each clickable mesh needs a `.name` property: `earth.name = 'Earth'`. This is the 3D equivalent of `onclick="window.__widgetSendMessage(...)"` on SVG nodes.

**Distinguish click from drag**: OrbitControls uses mousedown+mousemove+mouseup. A click that also drags the camera should not trigger drill-down. Track mouse movement:

```js
let dragDist = 0, startX, startY;
canvas.addEventListener('mousedown', function(e) { startX = e.clientX; startY = e.clientY; dragDist = 0; });
canvas.addEventListener('mousemove', function(e) { dragDist += Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY); });
canvas.addEventListener('click', function(e) {
  if (dragDist > 5) return;
  // ... raycaster code ...
});
```

### Scene templates

Five common scene types. Pick the closest match and adapt.

#### Solar system / orbital model

- Central body: large sphere, amber `0xEF9F27`, `MeshBasicMaterial` (self-lit star)
- Orbiting bodies: smaller spheres, different palette colors, `MeshLambertMaterial`
- Orbit paths: `RingGeometry(innerR, innerR + 0.02, 64)` with `MeshBasicMaterial({ color: 0x888780, side: THREE.DoubleSide, transparent: true, opacity: 0.2 })`
- Camera: `position.set(0, 8, 16)`, looking at origin
- Animation: orbital pattern, each body has its own speed multiplier
- AutoRotate: yes (`controls.autoRotate = true; controls.autoRotateSpeed = 0.6;`)
- Drill-down: click a planet → `window.__widgetSendMessage('Tell me more about Mars')`

#### Molecular / crystal structure

- Atoms: spheres, color-coded by element (oxygen = coral `0xD85A30`, carbon = gray `0x888780`, hydrogen = blue `0x378ADD`, nitrogen = teal `0x1D9E75`)
- Bonds: `CylinderGeometry(0.06, 0.06, bondLength, 8)` between atom pairs, gray
- Position bonds: compute midpoint between two atoms, use `lookAt()` to orient the cylinder
- Camera: close in, `position.set(0, 2, 6)`
- Animation: auto-rotation only (`controls.autoRotate = true; controls.autoRotateSpeed = 0.6;`)

#### Architectural / building complex

- Refer to the "Architectural subjects" and "Large immersive scenes" polygon budget hints for mesh/triangle targets
- Apply the sketch principle: identify the architectural signature of the subject and invest geometry there. Do NOT use flat boxes for roofs or other defining features — build proper geometry that captures the recognizable silhouette
- Walls: `BoxGeometry` with appropriate dimensions, color-coded by material
- Platforms/bases: flat `BoxGeometry` for foundations, stepped platforms
- Columns: `CylinderGeometry` for pillars and decorative elements
- Spatial accuracy: research real proportions. Main structures should be visibly larger than secondary ones. Spacing should reflect actual ratios
- Camera: elevated angle, `position.set(0, 12, 20)` or further back for large complexes
- AutoRotate: **no** — user needs stable camera to explore the layout. Leave `autoRotate` at default (false)
- Controls: camera preset buttons (top/front/side views) to help navigation
- HTML overlay labels: use the process shell with `#labels` overlay to label key buildings/areas
- Drill-down: click a building → `window.__widgetSendMessage('Tell me more about ...')`

#### Mechanical / gear train

- Gears: `CylinderGeometry(r, r, 0.3, 24)` as flat discs with `wireframe: true` overlay for tooth suggestion
- Axles: thin `CylinderGeometry(0.1, 0.1, h, 8)` through gear centers
- Animation: counter-rotating pairs — `gear2.rotation.y -= deltaAngle * (r1 / r2)`
- Camera: slight angle, `position.set(0, 6, 8)`
- AutoRotate: optional — small single-mechanism scenes can use it, complex assemblies should not
- Controls: speed slider

#### Process demonstration

- Each stage: a `THREE.Group` containing the meshes for that step
- Container objects: `CylinderGeometry` for tanks/vats, `BoxGeometry` for tables/platforms
- Material indicators: change mesh color or opacity to show state (e.g., fermentation → amber tint)
- Animation: step-through pattern with play/pause
- AutoRotate: **no** — camera must stay stable during step playback
- Controls: play/pause button + step label
- Drill-down: click a stage group → `window.__widgetSendMessage('Explain the fermentation stage')`

**Spatial layout rules:**
- Objects must not overlap or crowd together. Minimum gap between object centers = 2× the largest object radius.
- Arrange along one axis (x-axis preferred) so the camera can pan across the line. Do not stack vertically unless the real process stacks them.
- Pull the camera back far enough to frame all objects with breathing room on both sides.
- Compute positions from the actual object sizes and count — do not hardcode coordinates. See `examples/brewing-process.html` for a working reference.

**HTML overlay labels:**
- Every key object (tank, vessel, tool) needs a visible text label floating above it — not just a step name in the controls bar.
- Use an HTML `<div>` overlay positioned absolutely over the canvas, with labels projected from 3D world coordinates to 2D screen coordinates each frame.
- Use `font-size: 12px` and `var(--color-text-secondary)`. Set `pointer-events: none` so clicks pass through to the canvas.
- Hide labels for objects not yet visible in the current step.
- See `examples/brewing-process.html` for the complete label projection pattern.

### Anti-patterns

- **No `MeshStandardMaterial` or `MeshPhongMaterial`** — too expensive for sandboxed iframe
- **No `renderer.shadowMap.enabled = true`** — shadow maps are expensive
- **No `PointLight` or `SpotLight`** — ambient + directional only
- **No `TextureLoader`** — external image URLs are blocked by CSP
- **No `TextGeometry` or `FontLoader`** — requires a font file not on the CDN allowlist. Use HTML overlay labels (see process shell) or the `#controls` bar for text
- **No `position: fixed`** on any element — collapses the iframe viewport
- **No `renderer.setPixelRatio(devicePixelRatio)`** without `Math.min(..., 2)` — retina displays render at 3× and tank performance
- **No post-processing** (`EffectComposer`, bloom, SSAO) — too heavy
- **No CSS variable colors in Three.js materials** — Three.js cannot read CSS variables. Use hardcoded palette hex
- **No `dat.gui` or `lil-gui`** — use plain HTML controls in `#controls` div
- **Mesh budget awareness** — budget tiers are guidelines, not hard caps. If key objects need more geometry for their identifying features, exceed the budget rather than flatten them into generic shapes. But always simplify secondary/background objects first
- **No `autoRotate` for architectural or process scenes** — only enable for orbital/molecular scenes where continuous rotation adds value
