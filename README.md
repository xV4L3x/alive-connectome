# Alive Connectome

Exam project for the Computer Graphics course — Master's Degree in Computer Science, University of Bologna.

## Overview

A virtual ecosystem inhabited by specimens of the nematode *C. elegans*, whose locomotor behavior is entirely driven by a simulation of the worm's real synaptic connections, sourced from the [OpenWorm](https://openworm.org) project. Worms move autonomously based on their neural network activity, reacting to environmental stimuli such as light and temperature.

## Libraries

Provided by the professor — no external dependencies:

- `m4.js` — 4×4 matrix math (transformations, perspective, lookAt)
- `webgl-utils.js` — WebGL utilities
- `gl-matrix.js` — linear algebra
- `dat.gui.js` — GUI control panel

## Implementation

### Base Rendering
- OBJ model loading and parsing (positions, normals, per-material colors)
- MTL parsing for diffuse material colors (`Hypodermis`, `Generic_Transparency`)
- Per-vertex color attribute passed through vertex → fragment shader
- MVP matrix pipeline (Model / View / Projection) for correct 3D perspective

## References
- Worm 3D model: [VirtualWorm](http://www.openworm.org/animatedworm.html) — WormBase / Caltech, MIT License
- Connectome dataset: [OpenWorm / CElegansNeuroML](https://github.com/openworm/CElegansNeuroML) — MIT License
