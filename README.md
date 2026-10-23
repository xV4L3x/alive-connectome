# Alive Connectome

Alive Connectome is a real-time WebGL simulation where *C. elegans*-inspired agents move using a neural controller built from biological connectome data.

Instead of scripted animation, behavior emerges from neural dynamics, environmental light, and survival pressure (hunger/food), creating a small but expressive digital ecosystem.

## Why this project stands out

- **Connectome-driven behavior**: movement decisions come from synaptic network activity, not fixed paths.
- **Emergent adaptation**: worms react differently to the same scene based on local light and internal hunger state.
- **Interactive neuroscience sandbox**: users can spawn worms/food, tune light intensity, and instantly observe behavioral shifts.
- **Production-style rendering pipeline**: custom WebGL shaders, multi-light Phong shading, shadows, and camera modes.

## Core capabilities

- Real-time simulation loop with multiple autonomous worms.
- Neural stimulus integration (light + hunger) and motor output mapping.
- Dynamic food system with consumption, depletion, and starvation-driven urgency.
- Ray-cast worm selection with per-worm diagnostics panel.
- Free/third-person/first-person camera views.
- Keyboard and touch thumbstick motor override for controlled experiments.

## Technical profile

- **Language**: JavaScript (vanilla)
- **Graphics**: WebGL
- **UI/controls**: dat.GUI + custom HUD
- **Data source**: OpenWorm connectome edge list (`resources/data/herm_full_edgelist.csv`)
- **Architecture**: modular rendering/simulation components in `src/`

## Project structure

- `src/connectome.js` — neural graph loading and update step
- `src/models/worm.js` — worm state, movement, and behavior logic
- `src/core/camera.js` — orbit/first/third-person camera system
- `src/hud.js` — runtime controls and inspection tools
- `resources/` — models, textures, connectome data, utility libraries

## Run locally

Because assets are loaded via `fetch`, run with a local static server from the repository root.

Examples:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Controls at a glance

- **Mouse drag / wheel**: orbit + zoom (free camera)
- **Click worm**: select specimen and open detailed controls
- **GUI**: spawn worms, spawn food, tune 4 spotlights, toggle advanced rendering
- **WASD / Arrow keys / thumbstick**: manual directional override

## Scientific report

The original full technical/scientific report has been preserved at:

- `relazione/README-legacy.md`

## References

- Worm 3D model: [VirtualWorm](http://www.openworm.org/animatedworm.html)
- Connectome dataset: [OpenWorm / CElegansNeuroML](https://github.com/openworm/CElegansNeuroML)
