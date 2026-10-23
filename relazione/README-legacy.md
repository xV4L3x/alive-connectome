# Alive Connectome

Comprehensive technical and scientific report for the Alive Connectome simulation.

## Overview

Alive Connectome is a virtual ecosystem inhabited by *C. elegans* specimens.
Locomotion is not keyframed: each worm is controlled by a connectome-based neural simulation derived from OpenWorm data.
Environmental stimuli (mainly light and hunger-related food drive) are injected into sensory/interneuronal nodes, and motor behavior emerges from network activity.

## Libraries

Provided libraries (no external package manager dependencies):

- `m4.js` — 4×4 matrix math (transforms, perspective, lookAt)
- `webgl-utils.js` — WebGL utility helpers
- `gl-matrix.js` — linear algebra helpers
- `dat.gui.js` — runtime control panel

## Implementation

### Base Rendering

- OBJ loading/parsing (positions, normals, colors)
- MTL parsing for diffuse materials (`Hypodermis`, `Generic_Transparency`)
- Vertex color propagation from vertex shader to fragment shader
- Standard Model / View / Projection (MVP) transform pipeline

### Phong Lighting Model

Each fragment uses a Phong decomposition:

$$I = I_a + I_d + I_s$$

Ambient term:

$$I_a = k_a \cdot c_{object}$$

Diffuse term:

$$I_d = \max(\mathbf{N} \cdot \mathbf{L},\ 0) \cdot c_{object}$$

Specular term:

$$I_s = k_s \cdot \max(\mathbf{R} \cdot \mathbf{V},\ 0)^n$$

Reflection vector:

$$\mathbf{R} = \text{reflect}(-\mathbf{L},\ \mathbf{N}) = 2(\mathbf{N} \cdot \mathbf{L})\mathbf{N} - \mathbf{L}$$

Normals are transformed to world space with the rotational `mat3(u_modelMatrix)` component.

### Orbital Camera

The free camera orbits the target worm with spherical coordinates:

- $\phi$ (`azimuth`) — horizontal drag
- $\theta$ (`elevation`) — vertical drag
- $r$ (`distance`) — wheel zoom

Cartesian conversion:

$$x = r \cdot \cos\theta \cdot \sin\phi$$
$$y = r \cdot \sin\theta$$
$$z = r \cdot \cos\theta \cdot \cos\phi$$

Elevation is clamped to avoid `lookAt` singularities near poles.
A floor constraint prevents the camera from crossing below cabinet height.

### Camera Modes

When a worm is selected, **Change View** cycles through three modes:

| Value | Mode | Description |
|---|---|---|
| `0` | Free Camera | Orbital camera, mouse controls enabled |
| `1` | Third Person | Camera above/behind selected worm |
| `2` | First Person | Camera at worm eye-level, looking forward |

Mouse wheel/drag listeners remain attached but are gated by an enable callback.

### Connectome — Neural Engine

The connectome module simulates a reduced neural network fed by sensory drives and recurrent synapses.
A `step(dt)` update computes membrane-like activation values and maps them to locomotor outputs.

#### Data structure

The neural graph is created from the edge list (`herm_full_edgelist.csv`):

- node registry: neuron name → state
- weighted adjacency list: source → target synaptic weights
- compact set of behavior-relevant neurons for sensory/interneuron/motor pathways

#### Inhibitory neurons (GABAergic)

Inhibitory neurons contribute with negative effective influence on downstream activity.
This allows turning and reversal competition without hard if/else logic.

#### Simulation loop (`step`)

At each frame:

1. Inject external stimuli (light, hunger)
2. Accumulate weighted synaptic inputs
3. Apply bounded activation update
4. Resolve motor drives (forward vs backward bias)

The dynamics are continuous in time (scaled by `dt`) to avoid frame-rate-dependent behavior.

#### Locomotor output (`getWaveParams`)

The connectome returns compact motor parameters used by the shader/geometry layer:

- forward/backward direction sign
- undulation amplitude
- phase/speed factors

### Connectome → Shader Link

Motor outputs are passed to worm rendering uniforms and body update logic.
The visual undulation therefore reflects neural decisions in real time.

### Control Panel and Environmental Stimuli

A `dat.GUI` dashboard exposes:

- worm spawn/removal actions
- food spawn
- per-spotlight intensity sliders
- rendering toggles (e.g., advanced shadows)
- selected worm diagnostics

Light values are computed per worm from the multi-light setup and injected into the neural update.
Hunger is local per worm and evolves over time.

### Worm Motion

Motion combines:

- connectome forward/backward drive
- stochastic exploration (run + pirouette)
- directional bias from food when hungry
- photophobic escape behavior when light is high

Run/pirouette alternation creates nontrivial trajectories without deterministic path scripting.

### Food Objects

Food items are procedural discs placed in the tank with nutrient values.
When worms are close enough, nutrients decrease and hunger is reduced.
Exhausted food is removed from the array.

### Progressive Hunger System

Each worm has `hunger ∈ [0, 1]`:

$$\text{hunger} \leftarrow \min\left(1,\ \text{hunger} + k_h \cdot \Delta t\right)$$

When near food:

$$\text{hunger} \leftarrow \max\left(0,\ \text{hunger} - k_e \cdot \Delta t\right)$$

Above threshold (`hunger > 0.5`), chemotactic food attraction progressively dominates exploration.

### Worm Death

A worm dies when starvation saturates (`hunger >= 1.0`) or through manual GUI kill action.
Dead worms are removed during the cleanup pass.

### Worm Selection via Ray Casting

Selection uses a ray cast from mouse coordinates to world space and sphere intersection tests.
The selected target is the closest intersected worm to the camera among hits.

### Motor Override — Thumbstick

Manual override supports keyboard and touch input:

- WASD / arrows for desktop
- virtual thumbstick (Pointer Events API) for touch devices

Override affects direction while preserving core simulation flow.

### Sinusoidal Body Animation

Worm mesh deformation uses phase-shifted sinusoidal offsets along body segments.
Amplitude and speed depend on motor output, linking locomotion style to connectome state.

### Shadows — Planar Shadow Projection

An optional advanced pass projects worm silhouettes onto the tank floor using planar shadow projection.
This improves depth perception while keeping rendering cost controlled.

### Tank Floor Texturing

The floor uses tiled texture coordinates with repeat factors to avoid stretching.
Phong shading is applied with consistent normal orientation.

### Multi-Light Illumination System

The scene uses four spotlights near tank corners.
The shader accumulates diffuse/specular contributions from all lights.
Per-light intensity is user-adjustable at runtime.

### Tank Spotlights — Directional Orientation

Each spotlight is oriented toward the interior region of interest.
This produces strong local gradients used both for visual rendering and worm light stimulus computation.

### Laboratory Room

The room/cabinet environment adds context and contrast.
Outer surfaces use stronger distance attenuation to preserve a darker lab atmosphere while keeping tank internals readable.

## Limitations

- No explicit chemical plume diffusion model
- Food seeking uses directional heuristics rather than full gradient history reconstruction
- No mating/reproduction behaviors

## References

- Worm 3D model: [VirtualWorm](http://www.openworm.org/animatedworm.html) — WormBase / Caltech, MIT License
- Connectome dataset: [OpenWorm / CElegansNeuroML](https://github.com/openworm/CElegansNeuroML) — MIT License
