# Babylon.js VR & Desktop Physics Sandbox

A full-featured 3D interactive physics sandbox built with **Babylon.js**, **TypeScript**, and **Havok Physics Engine**. Designed for seamless dual-mode support: first-person keyboard & mouse on desktop, and immersive motion-controller interactions in WebXR VR.

---

## 🚀 Features

- **Havok Physics Engine**: High-performance WebAssembly physics simulation (`@babylonjs/havok` v2). Accurate collision detection, restitution, friction, and mass response.
- **Dual-Mode Controls**:
  - **Desktop FPS**: Pointer Lock API mouse look, WASD movement, Space to jump, Shift to sprint, crosshair reticle.
  - **WebXR VR Ready**: WebXR Default Experience with teleportation locomotion, controller tracking, ray grab, and near-object hand grab.
- **GLB 3D Asset Support & Spawner**:
  - **21 Included Furniture & Room Assets**: Chairs, armchairs, office chairs, stools, sofas, dining/coffee tables, desks, nightstands, double/twin beds, bookcases, closets, doors, full house, and bedroom models.
  - **Asset Spawner Palette (`B` key or HUD button)**: Categorized drawer (Seating, Tables, Beds, Storage, Doors, Rooms) to drop any model into the world on demand.
  - **Direct Drag & Drop**: Drag ANY `.glb` or `.gltf` file from your desktop/file manager directly onto the browser window—it automatically parses the hierarchy, encapsulates it in a Havok physics collider, adds shadows, and drops it right into your sandbox!
  - **Full Physics & VR Interaction**: All loaded GLB models can be picked up, carried, moved, thrown, or walked on!
- **Physics-Based Object Interaction**:
  - **Pick Up & Carry**: Grabbing uses smooth spring/velocity tracking instead of teleporting meshes, meaning held objects realistically collide with walls and tables rather than clipping through them.
  - **Carry Distance Zoom**: Mouse wheel adjusts hold distance between 1.4m and 6.0m.
  - **Throwing**: Right-click (or 'E' on desktop) applies forward impulse. In VR, releasing the grip button naturally inherits controller velocity for throwing!
  - **Procedural Sound Effects**: Zero external assets needed—Web Audio API generates dynamic collision impacts, grab pops, throw whooshes, and interactive button chimes.
- **Sandbox Environment**:
  - Paved grid playground with soft shadows (`CascadedShadowGenerator` / `ShadowGenerator`).
  - Rolling ball ramp with elevated platform.
  - Multi-tier staircases leading to an observation deck.
  - Central physics workbench table.
  - Domino chain reaction row.
  - Knockdown crate pyramid.
  - Interactive floor pressure plate that chimes and launches fireworks props when struck.
  - Perimeter safety bumpers.
  - Dynamic prop spawner (`G` key or UI button) and instant scene reset (`R` key or UI button).

---

## 🎮 Controls

### Desktop Keyboard & Mouse
| Input | Action |
|---|---|
| **Click Canvas** | Lock mouse cursor (Pointer Lock) |
| **Mouse Move** | Free FPS look |
| **W, A, S, D** | Walk forward, left, backward, right |
| **Shift (Hold)** | Sprint |
| **Space** | Jump |
| **Left Click** | Pick up / hold object in crosshair |
| **Right Click** or **E** | Throw held object |
| **Scroll Wheel** | Push held object further / pull closer |
| **F** | Toggle flashlight |
| **G** | Spawn new random physics prop in front of player |
| **R** | Reset all physics props to initial positions |
| **ESC** | Unlock mouse cursor |

### WebXR VR (Meta Quest, PCVR, Apple Vision Pro, etc.)
| Input | Action |
|---|---|
| **Enter VR Button** | Click the headset icon in the lower-right corner |
| **Thumbstick / Teleport** | Teleport locomotion on floor and elevated decks |
| **Grip / Squeeze** | Near grab (touch prop) or Ray grab (point and pull grip) |
| **Swing + Release Grip** | Throw object with natural physical hand momentum |
| **Controller Collision** | Haptic pulse feedback |

---

## 🛠️ Project Setup & Commands

### Prerequisites
- Node.js (v18+)
- npm

### Development Server
```bash
npm run dev
```
Serves the game on `http://localhost:5173/`.

### Production Build
```bash
npm run build
```
Compiles TypeScript (`tsc`) and builds optimized static assets into `dist/`.

### Preview Production Build
```bash
npm run preview
```

---

## 📁 Architecture Overview

```
src/
├── audio/
│   └── SoundEffects.ts        # Synthesized Web Audio API sound effects
├── controls/
│   ├── DesktopController.ts   # FPS camera, pointer lock, WASD, jump, grab/throw
│   └── VRController.ts        # WebXR helper, motion controllers, velocity throwing
├── environment/
│   └── EnvironmentManager.ts  # Lighting, shadows, ground, sky, ramps, stairs, tables
├── objects/
│   └── InteractableRegistry.ts# Dynamic props (crates, balls, dominoes, button), highlights
├── physics/
│   └── PhysicsManager.ts      # Havok WASM initialization, static & dynamic bodies, reset
├── ui/
│   └── HUD.ts                 # FPS counter, object counter, spawner/reset buttons
└── main.ts                    # Application bootstrap & render loop
```

