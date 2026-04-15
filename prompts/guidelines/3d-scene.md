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
| "3D展示一个合成器" | **3D scene (Product)** | explicit "3D" + single product → Product mode |
| "沉浸式展示这款咖啡机的设计" | **3D scene (Product)** | "immersive" + single product → Product mode |
| "3D演示发动机工作原理" | **3D scene (Technical)** | explicit "3D" + mechanism explanation → Technical mode |
| "展示手表机芯如何运转" | **3D scene (Technical)** | mechanism + physical parts → Technical mode |
| "3D还原故宫建筑群" | **3D scene (Scene)** | explicit "3D" + large architecture → Scene mode |

**The routing rule — conservative by default:**

3D is expensive and less predictable than 2D. Do not default to it. Use this decision tree:

**Path A — User explicitly says "3D" / "三维" / "立体模型":**
→ Use 3D. The user has stated their intent clearly. Only refuse if the subject is fundamentally impossible to spatialize (e.g. "用3D展示这段代码", "3D显示这个JSON"). In those cases, explain why and fall back to the best 2D format.

**Path B — User says "immersive" / "沉浸" / "沉浸式" (without "3D"):**
→ Use 3D only if the subject involves physical objects in space (brewing equipment, mechanical parts, planets, molecules). If the subject is abstract (algorithms, concepts, data flows), use the richest non-3D format instead (interactive HTML stepper, illustrative diagram).

**Path C — No explicit keyword, but the subject is spatial geometry:**
→ Use 3D only if the subject is **unambiguously** 3D geometry (double helix, crystal lattice, planetary orbits, interlocking gears) AND rotating around it adds genuine understanding that a 2D view cannot provide. If a cross-section, top-down view, or step-through animation conveys the same information, do NOT use 3D.

**If none of A/B/C apply, or you are not confident → do NOT use 3D.** A well-executed 2D widget is always better than a mediocre 3D scene.

**Step 2 — Select rendering mode.** Once you decide to use 3D, pick the mode based on the user's goal:

| Goal | Mode | Rendering pipeline | Examples |
|---|---|---|---|
| Show spatial layout of a large scene | **Scene** | Standard (Lambert, no shadows) | city, palace complex, factory grounds, terrain |
| Showcase a product's appearance and design | **Product** | PBR (shadows, PointLight, emissive) | synthesizer, coffee machine, watch, speaker, furniture |
| Explain how a mechanism works with realistic parts | **Technical** | PBR + animation/labels/cutaway | engine internals, watch movement, lock mechanism, gearbox |
| Visualize abstract spatial relationships or processes | **Diagram** | Standard (Lambert, no shadows) | solar system, molecule, crystal lattice, brewing process |

**Mode selection hints:**
- Subject has mixed materials (metal + plastic + rubber) and user wants to see the object → **Product**
- Subject has moving/interlocking parts and user wants to understand how they interact → **Technical**
- Subject is building-scale or larger, emphasis on spatial arrangement → **Scene**
- Subject is schematic/educational, material fidelity doesn't matter → **Diagram**
- Uncertain between Product and Technical: "how it works" / "原理" / "机制" → **Technical**; "show me" / "展示" / "what it looks like" → **Product**

**Scene and Diagram modes** use the standard shell and rules in the sections below (Setup, Lighting, Materials and colors).

**Product and Technical modes** use the PBR shell and rules in the "PBR rendering modes" section.

### Setup (standard shell — Scene + Diagram modes)

Scene mode and Diagram mode use this standard shell. The LLM writes scene content (meshes, materials, helpers, camera positioning) **after** the `init()` block as top-level statements — never inside `init()`. For Product and Technical modes, see the PBR shell in "PBR rendering modes" below.

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

### Lighting (standard modes — Scene + Diagram)

Two lights only — ambient + one directional. This is the hard budget for Scene and Diagram modes. Product and Technical modes use a different lighting setup — see "PBR rendering modes".

```js
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
const sun = new THREE.DirectionalLight(0xffffff, 0.9);
sun.position.set(5, 8, 5);
```

No point lights, no spotlights, no shadows (`renderer.shadowMap.enabled` stays false). The ambient+directional combo gives enough shading to read 3D form without GPU cost in a sandboxed iframe.

**Exception for solar system scenes**: The central star can use `MeshBasicMaterial` (self-lit, ignores lighting) while planets use `MeshLambertMaterial` (shaded). This creates a natural "star glows, planets are lit" effect without adding a point light.

### Materials and colors (standard modes — Scene + Diagram)

For Scene and Diagram modes, use the existing palette as Three.js material colors. Because 3D materials are darkened by lighting (Lambert shading), use **200-stops for bright/emissive roles** (stars, highlights, energy) and **400-stops for standard objects**. Do not invent hex values — pick from this table:

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

### Scene templates (Scene + Diagram modes)

Five common scene types for standard rendering. Pick the closest match and adapt. For PBR product and technical scenes, see the "PBR rendering modes" section below.

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

> For higher-fidelity mechanical rendering with PBR materials (metallic gears, realistic shading), use **Technical mode** instead. This template is the schematic/diagram-style approach.

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

### PBR rendering modes (Product + Technical)

Product mode and Technical mode share a higher-fidelity rendering pipeline with PBR materials, shadow mapping, and accent lighting. This section documents the shared PBR shell and per-mode rules.

#### PBR shell

Same progressive rendering rules as the standard shell — `init();` is the shell boundary, scene content goes after it as top-level statements. Key differences: shadow maps, tone mapping, PBR-friendly lighting balance.

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0; // 0.8–0.9 for dark scenes with strong emissives (prevents color wash-out)
  renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  camera.position.set(0, 5, 10);

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  var sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(5, 10, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 50;
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
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
</script>
```

**Differences from the standard shell:**
- `renderer.shadowMap.enabled = true` + `PCFSoftShadowMap` — soft shadows ground the object
- `renderer.toneMapping = THREE.ACESFilmicToneMapping` — better HDR-to-LDR color response for PBR
- `renderer.outputEncoding = THREE.sRGBEncoding` — correct color space for PBR materials
- Ambient light lowered to **0.3** (from 0.6) — stronger contrast lets PBR shading reveal surface detail
- Directional light: `castShadow = true` with 1024×1024 shadow map
- Shadow camera bounds (`left/right/top/bottom`) — adjust to tightly frame the subject per scene

**PBR process shell variant.** Technical mode scenes that need HTML overlay labels use the same `.scene-wrap` + `#labels` overlay pattern as the standard process shell, but with the PBR `init()` above and `updateLabels()` added to the animate loop.

#### PBR materials

`MeshStandardMaterial` is the default material for both Product and Technical modes. Use `metalness` and `roughness` to express surface types:

| Surface type | metalness | roughness | Use for |
|---|---|---|---|
| Brushed metal | 0.9 | 0.35 | Chassis, panels, structural frames |
| Polished metal | 0.95 | 0.1 | Chrome trim, connectors, polished shafts |
| Cast iron / raw metal | 0.7 | 0.6 | Gears, engine blocks, industrial parts |
| Brass / bronze | 0.85 | 0.3 | Watch components, decorative hardware |
| Matte plastic | 0.0 | 0.7 | Casings, enclosures, covers |
| Glossy plastic | 0.0 | 0.2 | Buttons, display bezels, keycaps |
| Rubber / silicone | 0.0 | 0.9 | Knobs, grips, feet, gaskets |
| Glass / acrylic | 0.0 | 0.05 | Display covers, light pipes |

Colors: use the same palette hex values from the standard materials table. The palette 400-stops work well with PBR — the material properties (metalness/roughness) provide the surface differentiation that Lambert cannot express.

**Emissive materials** for LEDs, indicators, and backlit elements:

```js
// Factory pattern — per-light color with tunable intensity
function makeLedMat(hex, intensity) {
  return new THREE.MeshStandardMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: intensity || 2.8,
    metalness: 0.0,
    roughness: 0.5
  });
}
```

**ACES tone mapping desaturates emissives** — this is the #1 failure mode for PBR-mode LEDs. ACES compresses highlights aggressively; if `emissiveIntensity` goes above ~3.5 the color washes toward white and the LED looks bright but *colorless*. Two rules to follow:

1. **Keep `emissiveIntensity` in 1.5–3.5.** Default 2.8 works for most LED rings. Go to 3.5 only for small bright indicators (button glow, status dots). Never 5+.
2. **Use fully saturated base colors for emissives, NOT the palette 400-stops.** Palette colors are designed for diffuse surfaces and lose too much chroma under ACES. For emissives, pick high-saturation hex values: `0xFF2222` (red), `0xFF9900` (orange), `0x4466FF` (blue), `0x22AAFF` (cyan), `0xFF44CC` (pink), `0x44DD00` (green), `0x00FFAA` (teal), `0xAA44FF` (purple), `0x00FF88` (bright green button).

If emissives still look pale, lower `toneMappingExposure` to 0.85. This preserves more saturation at the cost of slightly darker overall scene (well-suited to dark Product showcases).

**Still forbidden in PBR modes:**
- No `TextureLoader` — CSP-blocked, color-only materials
- No `MeshPhysicalMaterial` — marginal gain over Standard, heavier
- No `envMap` on individual materials — no external HDRI files available

#### PBR lighting

Base: ambient (0.3) + directional (0.8) with shadow. On top of that, **up to 4 `PointLight`** for accent and fill:

```js
var accent = new THREE.PointLight(0x7F77DD, 0.6, 8, 2);
accent.position.set(-2, 2, 3);
scene.add(accent);
```

PointLight rules:
- Always set `distance` (falloff radius) — prevents light bleeding across the scene
- Always set `decay: 2` — physically correct inverse-square falloff
- Intensity ≤ 1.0 per light — accents, not floodlights
- **No `castShadow` on PointLights** — only the directional light casts shadows (performance)
- Use palette colors for colored accents, or white (0xffffff) for neutral fill

**Shadow-receiving ground plane:**

```js
var ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.ShadowMaterial({ opacity: 0.3 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01; // just below product base
ground.receiveShadow = true;
scene.add(ground);
```

`ShadowMaterial` is invisible except where shadows fall — works on both light and dark host backgrounds.

All product/mechanism meshes should set `mesh.castShadow = true` and `mesh.receiveShadow = true` so parts shadow each other (knobs shadow the panel, gears shadow the frame, etc.).

#### PBR complexity budget

| Constraint | Product mode | Technical mode |
|---|---|---|
| Distinct mesh objects | ≤ 80 | ≤ 100 |
| Total triangles | ≤ 50 000 | ≤ 60 000 |
| Lights | 2 base + up to 4 PointLight | 2 base + up to 4 PointLight |
| Shadow maps | 1 (directional only) | 1 (directional only) |
| Segment counts | 32–48 for curved parts | 24–48 for mechanical parts |

**Geometry tips for PBR scenes:**
- **Knobs/dials: composite of 5 parts, not a single cylinder.** Real synth/audio knobs have (1) a wide skirt flange where the knob meets the panel, (2) a tapered cylinder body with **height ≈ radius** (H/D ≈ 0.55–0.65 — NEVER flat pancake, NEVER tall like a chess piece), (3) a flat top cap, NOT a sphere dome, (4) an optional grip ring (thin torus around upper body), (5) an indicator line or dot (emissive `BoxGeometry` on the cap). Proven proportions: `CylinderGeometry(0.32, 0.38, 0.44, 32)` for body, `CylinderGeometry(0.30, 0.32, 0.04, 32)` for cap
- LED rings: `TorusGeometry(r, tubeR, 12, 48)` with emissive material. Place at the base of the knob (below the skirt), NOT wrapping the body. Radius ~1.2× skirt radius so the ring reads as a halo
- Gears: prefer **`Shape` + `ExtrudeGeometry`** for real tooth profiles. Build a closed `THREE.Shape` by walking (innerR → midR → outerR → outerR → midR → innerR) per tooth, 7 control points with curved flanks. Star-shaped escape wheels use a simpler 3-point triangular profile per tooth. `CylinderGeometry` + wireframe is a fallback that looks blocky under PBR — only acceptable for Diagram mode
- Shafts/axles: `CylinderGeometry(r, r, length, 16)` — enough segments for thin cylinders
- Buttons: short `CylinderGeometry(r, r, h, 24)` with glossy plastic material; add an emissive inner dot or top plate for "lit button" states
- Indicator dots: `SphereGeometry(r, 12, 8)` or small `BoxGeometry` with emissive material
- Springs (hairspring, mainspring): stack of thin `TorusGeometry` slices with progressively decreasing radius, or an `EllipseCurve` point-set rendered as `TubeGeometry` for proper spiral

#### Product mode template

Product mode showcases a physical object's appearance. Camera auto-rotates slowly so the user sees all angles. Focus on material differentiation — every distinct surface type gets its own `MeshStandardMaterial`.

For **dark-themed showcases** (synth, audio gear, camera bodies), set `scene.background = new THREE.Color(0x080808)` and drop `toneMappingExposure` to 0.85 in the shell. For **light products** (ceramics, kitchenware, white goods), keep `alpha: true` and the default exposure 1.0.

```js
// === Scene tuning (dark showcase) ===
scene.background = new THREE.Color(0x080808);
// Ambient can drop to 0.1 and directional to ~0.45 for moodier lighting;
// rely on accent PointLights for colored fill.

// === Materials ===
var matChassis = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.85, roughness: 0.4 });
var matPanel   = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, metalness: 0.7,  roughness: 0.5 });
var matKnob    = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, metalness: 0.05, roughness: 0.82 });
var matKnobTop = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.15, roughness: 0.6 });
var matButton  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1,  roughness: 0.3 });

function makeLedMat(hex, intensity) {
  return new THREE.MeshStandardMaterial({
    color: hex, emissive: hex,
    emissiveIntensity: intensity || 2.8,
    metalness: 0.0, roughness: 0.5
  });
}

// === Three-layer chassis (body + bezel lip + recessed panel) ===
var body = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 5), matChassis);
body.position.y = 0.3;
body.castShadow = true; body.receiveShadow = true;
scene.add(body);

var bezel = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.08, 4.7), matChassis);
bezel.position.y = 0.64;
scene.add(bezel);

var panel = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.04, 4.4), matPanel);
panel.position.y = 0.62;
panel.receiveShadow = true;
scene.add(panel);

// === Knob factory — 5 parts for proper proportions ===
function addKnob(x, z, ledColor, name) {
  // (1) Base skirt — wide flange where knob meets panel
  var skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.07, 32), matKnob);
  skirt.position.set(x, 0.62, z);
  skirt.castShadow = true;
  scene.add(skirt);

  // (2) Knob body — tapered, height ≈ radius (H/D ≈ 0.58)
  var knob = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.44, 32), matKnob);
  knob.position.set(x, 0.875, z);
  knob.castShadow = true;
  knob.name = name; // for click drill-down
  scene.add(knob);

  // (3) Flat top cap — NOT a sphere dome
  var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.32, 0.04, 32), matKnobTop);
  cap.position.set(x, 1.115, z);
  scene.add(cap);

  // (4) Grip ring — thin torus around upper body
  var grip = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.018, 8, 32), matKnobTop);
  grip.rotation.x = -Math.PI / 2;
  grip.position.set(x, 1.015, z);
  scene.add(grip);

  // (5) LED halo ring at base (radius ~1.2× skirt), thick tube for bloom feel
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 12, 48), makeLedMat(ledColor));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.585, z);
  scene.add(ring);

  // Indicator line on the cap
  var indicator = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.014, 0.15), makeLedMat(ledColor));
  indicator.position.set(x, 1.143, z - 0.13);
  scene.add(indicator);
}

// Vivid, saturated LED colors — NOT palette 400-stops (see Emissive materials)
var ledColors = [0xFF2222, 0xFF9900, 0x4466FF, 0x22AAFF, 0xFF44CC, 0x44DD00, 0x00FFAA, 0xAA44FF];
for (var i = 0; i < 4; i++) {
  addKnob(-2.4 + i * 1.6, -0.8, ledColors[i],     'knob-' + i);
  addKnob(-2.4 + i * 1.6,  0.8, ledColors[i + 4], 'knob-' + (i + 4));
}

// === Step button with bright emissive glow ===
var btn = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 24), matButton);
btn.position.set(3.0, 0.68, 1.6);
scene.add(btn);
var btnGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24), makeLedMat(0x00FF88, 3.5));
btnGlow.position.set(3.0, 0.725, 1.6);
scene.add(btnGlow);

// === Accent PointLights — up to 4, colored for mood ===
var a1 = new THREE.PointLight(0xAA44FF, 0.6, 8, 2); a1.position.set(-3, 2, 3); scene.add(a1);
var a2 = new THREE.PointLight(0x44DD00, 0.5, 8, 2); a2.position.set( 3, 2, 3); scene.add(a2);
var a3 = new THREE.PointLight(0xFFAA44, 0.4, 8, 2); a3.position.set( 0, 3, -3); scene.add(a3);

// === Dark ground plane (NOT ShadowMaterial for dark scenes) ===
var ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.0, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// === Camera + auto-rotate ===
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;
camera.position.set(0, 5, 9);
camera.lookAt(0, 0.5, 0);
```

**Product mode key traits:**
- `controls.autoRotate = true` — slow showcase rotation, user click-drag overrides
- **Three-layer chassis** (body + bezel lip + recessed panel) reads as a manufactured product, not a single box
- Every distinct surface type has its own material with appropriate metalness/roughness
- **Knob factory with 5 parts and H/D ≈ 0.58** — the single most common failure mode is making knobs too flat or too tall
- LED/indicator emissives use **saturated non-palette colors** at intensity 2.8 (rings) / 3.5 (buttons) — see Emissive materials section
- **Accent PointLights** with colored hex values provide the mood lighting that makes the scene feel like product photography
- For dark showcases, use a near-black ground `MeshStandardMaterial` instead of `ShadowMaterial` — the `ShadowMaterial` trick only works on light-background scenes
- Drill-down: click on a component → `window.__widgetSendMessage('Tell me about the filter knob')`

#### Technical mode template

Technical mode explains how a mechanism works. Uses the PBR shell for material fidelity, plus step-through animation, component labels, and optionally cutaway or exploded views.

**Technical mode uses the PBR process shell** (PBR shell + `.scene-wrap` + `#labels` overlay):

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
<div id="controls">
  <button id="btn" onclick="togglePlay()">Play</button>
  <span id="step-label" style="flex:1"></span>
</div>
```

Then use the PBR `init()` function, adding `updateLabels()` to the animate loop.

**Gear tooth profiles** — the single biggest fidelity jump for Technical mode is real gear teeth. Plain cylinders with wireframe overlay look blocky under PBR; individual `BoxGeometry` teeth look like rectangular bricks. Use `Shape` + `ExtrudeGeometry` with trapezoidal profiles (curved flanks, 7 control points per tooth):

```js
function createGearProfile(outerR, numTeeth, toothDepth) {
  var innerR = outerR - toothDepth;
  var midR   = (innerR + outerR) * 0.52;
  var step   = (Math.PI * 2) / numTeeth;
  var shape  = new THREE.Shape();
  shape.moveTo(innerR, 0);
  for (var i = 0; i < numTeeth; i++) {
    var a = i * step;
    // Walk up one flank, across the tip, down the other flank, across the root
    shape.lineTo(Math.cos(a + step * 0.15) * innerR, Math.sin(a + step * 0.15) * innerR);
    shape.lineTo(Math.cos(a + step * 0.22) * midR,   Math.sin(a + step * 0.22) * midR);
    shape.lineTo(Math.cos(a + step * 0.30) * outerR, Math.sin(a + step * 0.30) * outerR);
    shape.lineTo(Math.cos(a + step * 0.50) * outerR, Math.sin(a + step * 0.50) * outerR);
    shape.lineTo(Math.cos(a + step * 0.58) * midR,   Math.sin(a + step * 0.58) * midR);
    shape.lineTo(Math.cos(a + step * 0.65) * innerR, Math.sin(a + step * 0.65) * innerR);
    shape.lineTo(Math.cos(a + step) * innerR,         Math.sin(a + step) * innerR);
  }
  shape.closePath();
  return shape;
}

function createGear(outerR, numTeeth, thickness, material) {
  var shape = createGearProfile(outerR, numTeeth, outerR * 0.12);
  var geom  = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geom.center();
  var gear  = new THREE.Mesh(geom, material);
  gear.castShadow = true; gear.receiveShadow = true;
  return gear;
}
```

For **escape wheels** (star-shaped teeth), replace the 7-point walk with a simpler 3-point triangular profile per tooth. For **toothed pinions** (small driving gears on shafts), use the same factory with `numTeeth: 8–12` and a tiny `outerR`.

**Continuous mechanical animation** (gears, pistons, cams — parts move every frame):

```js
var t = 0;
// Replace the animate loop inside init() to include mechanism motion:
function animate() {
  requestAnimationFrame(animate);
  t += 0.01;
  gear1.rotation.y = t;
  gear2.rotation.y = -t * (r1 / r2); // counter-rotate by ratio
  piston.position.y = Math.sin(t * 2) * strokeLength;
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
}
```

**Step-through assembly** (exploded view, sequential reveal):

```js
var steps = [
  { label: 'Mainspring', groups: [mainspring], cam: [2, 3, 5] },
  { label: 'Gear train', groups: [mainspring, gearTrain], cam: [3, 4, 6] },
  { label: 'Escapement', groups: [mainspring, gearTrain, escapement], cam: [1, 2, 4] },
];
var step = 0;

function showStep(n) {
  allGroups.forEach(function(g) { g.visible = false; });
  steps[n].groups.forEach(function(g) { g.visible = true; });
  document.getElementById('step-label').textContent = steps[n].label;
  camera.position.set.apply(camera.position, steps[n].cam);
  camera.lookAt(0, 0, 0);
}
showStep(0);
```

**Cutaway / transparency technique** — make outer casing semi-transparent to reveal internals:

```js
var casing = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
  color: 0x888780, metalness: 0.7, roughness: 0.3,
  transparent: true, opacity: 0.25, side: THREE.DoubleSide
}));
```

**Exploded view technique** — offset parts along their normal axis:

```js
function setExploded(factor) {
  parts.forEach(function(p) {
    p.position.copy(p.userData.basePos).addScaledVector(p.userData.explodeDir, factor);
  });
}
// Slider: <input type="range" min="0" max="100" value="0" oninput="setExploded(this.value/100*3)">
```

Store each part's rest position in `userData.basePos` and its explode direction in `userData.explodeDir` at creation time.

**Technical mode key traits:**
- `controls.autoRotate = false` — stable camera, user-controlled exploration
- Play/Pause + step controls for mechanism animation
- Camera preset buttons (top / side / exploded) for exploring internals
- Every key component MUST have a visible HTML overlay label
- Semi-transparent outer casings to reveal internal structure
- Exploded view slider for assembly sequences
- Motion direction annotations in labels: use `→` `↻` `⟳` unicode arrows
- Hide labels for components not yet visible in step-through
- Drill-down: click on a component → `window.__widgetSendMessage('Explain the escapement')`

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

**PBR mode exceptions.** The following standard-mode restrictions are relaxed in Product and Technical modes (see "PBR rendering modes"):
- `MeshStandardMaterial` — allowed and required (default material for PBR modes)
- `PointLight` — allowed (up to 4, with `distance` and `decay` set)
- `renderer.shadowMap.enabled = true` — allowed (directional light only, `PCFSoftShadowMap`)
- `renderer.toneMapping` and `renderer.outputEncoding` — allowed and required
- These remain **forbidden even in PBR modes**: `MeshPhysicalMaterial`, `TextureLoader`, `SpotLight`, `EffectComposer` / post-processing, `dat.gui` / `lil-gui`, `position: fixed`
