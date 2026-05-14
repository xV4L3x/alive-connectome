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

### Phong Lighting Model

Each fragment is shaded using the Phong reflection model, composed of three terms:

$$I = I_a + I_d + I_s$$

**Ambient** — constant base light, independent of surface orientation:

$$I_a = k_a \cdot c_{object}$$

```glsl
vec3 ambient = ambientStrength * v_color.rgb;
```

**Diffuse** — depends on the angle between the surface normal $\mathbf{N}$ and the light direction $\mathbf{L}$:

$$I_d = \max(\mathbf{N} \cdot \mathbf{L},\ 0) \cdot c_{object}$$

```glsl
float diff = max(dot(normal, lightDir), 0.0);
vec3 diffuse = diff * v_color.rgb;
```

The `max(..., 0.0)` clamps negative values (back-facing surfaces receive no diffuse light).

**Specular** — models the bright highlight. $\mathbf{R}$ is the reflection of $-\mathbf{L}$ around $\mathbf{N}$, $\mathbf{V}$ is the direction toward the camera, and $n$ is the shininess exponent:

$$I_s = k_s \cdot \max(\mathbf{R} \cdot \mathbf{V},\ 0)^{n}$$

$$\mathbf{R} = \text{reflect}(-\mathbf{L},\ \mathbf{N}) = 2(\mathbf{N} \cdot \mathbf{L})\mathbf{N} - \mathbf{L}$$

```glsl
vec3 reflectDir = reflect(-lightDir, normal);
float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
vec3 specular = specularStrength * spec * vec3(1.0);
```

Higher shininess $n$ produces a smaller, sharper highlight. The specular color is white regardless of the object color, simulating a physical surface gloss.

**Normal transformation** — normals must be transformed to world space using only the rotational part of the model matrix (upper-left 3×3), since translations do not affect directions:

```glsl
v_normal = mat3(u_modelMatrix) * a_normal;
```

## References
- Worm 3D model: [VirtualWorm](http://www.openworm.org/animatedworm.html) — WormBase / Caltech, MIT License
- Connectome dataset: [OpenWorm / CElegansNeuroML](https://github.com/openworm/CElegansNeuroML) — MIT License
