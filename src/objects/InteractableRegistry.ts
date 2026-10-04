import {
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  HighlightLayer,
  ShadowGenerator,
} from "@babylonjs/core";
import { PhysicsManager } from "../physics/PhysicsManager";
import { SoundEffects } from "../audio/SoundEffects";

export interface InteractableMetadata {
  isInteractable: boolean;
  type: "crate" | "sphere" | "cylinder" | "domino" | "heavy" | "button" | "cartridge" | "album_sleeve" | "track_rack_header" | string;
  name: string;
}

export class InteractableRegistry {
  private scene: Scene;
  private physicsManager: PhysicsManager;
  private shadowGenerator: ShadowGenerator;
  private highlightLayer: HighlightLayer;
  private interactables: Set<Mesh> = new Set();
  private currentlyHovered: Mesh | null = null;
  public currentlyHeld: Mesh | null = null;

  public onObjectGrabbed?: (mesh: Mesh) => void;
  public onObjectReleased?: (mesh: Mesh) => void;

  constructor(scene: Scene, physicsManager: PhysicsManager, shadowGenerator: ShadowGenerator) {
    this.scene = scene;
    this.physicsManager = physicsManager;
    this.shadowGenerator = shadowGenerator;
    this.highlightLayer = new HighlightLayer("highlightLayer", this.scene);
    this.highlightLayer.innerGlow = false;
    this.highlightLayer.outerGlow = true;
  }

  private compoundVisuals: Map<Mesh, Mesh[]> = new Map();
  private currentlyHighlightedMeshes: Mesh[] = [];

  public initDefaultSandboxProps(): void {
    this.spawnTableSet();
    this.spawnDominoRow();
    this.spawnRampSpheres();
    this.spawnPyramidStack();
    this.spawnInteractiveButton();
  }

  /**
   * Find the interactable physics root for a mesh or any of its child meshes.
   */
  public getInteractableRoot(mesh: Mesh | null | undefined): Mesh | null {
    if (!mesh) return null;
    if (this.interactables.has(mesh)) return mesh;

    // Check parent hierarchy
    let current = mesh.parent;
    while (current) {
      if (current instanceof Mesh && this.interactables.has(current)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * Check if a mesh or any of its ancestors is an interactable prop.
   */
  public isInteractable(mesh: Mesh | null | undefined): boolean {
    return this.getInteractableRoot(mesh) !== null;
  }

  /**
   * Register visual child meshes for an encapsulated GLB prop so they can be highlighted together.
   */
  public registerCompoundVisualMeshes(collider: Mesh, visualMeshes: Mesh[]): void {
    this.compoundVisuals.set(collider, visualMeshes);
    collider.onDisposeObservable.add(() => {
      this.compoundVisuals.delete(collider);
    });
  }

  private getVisualMeshesForRoot(root: Mesh): Mesh[] {
    const list = this.compoundVisuals.get(root);
    if (list && list.length > 0) {
      return list.filter((m) => !m.isDisposed());
    }
    return root.isVisible ? [root] : [];
  }

  private clearHighlight(): void {
    for (const m of this.currentlyHighlightedMeshes) {
      if (!m.isDisposed()) {
        this.highlightLayer.removeMesh(m);
      }
    }
    this.currentlyHighlightedMeshes = [];
  }

  /**
   * Set highlight on hover.
   */
  public setHoveredMesh(mesh: Mesh | null): void {
    const root = this.getInteractableRoot(mesh);
    if (this.currentlyHovered === root) return;

    if (this.currentlyHovered && !this.currentlyHovered.isDisposed()) {
      if (this.currentlyHovered.metadata?.albumItem) {
        this.currentlyHovered.metadata.albumItem.setHovered(false);
      }
      if (this.currentlyHovered.metadata?.cartridge) {
        this.currentlyHovered.metadata.cartridge.setHovered(false);
      }
    }

    this.clearHighlight();
    this.currentlyHovered = root;

    if (this.currentlyHovered && !this.currentlyHovered.isDisposed()) {
      if (this.currentlyHovered.metadata?.albumItem) {
        this.currentlyHovered.metadata.albumItem.setHovered(true);
      }
      if (this.currentlyHovered.metadata?.cartridge) {
        this.currentlyHovered.metadata.cartridge.setHovered(true);
      }
      const targets = this.getVisualMeshesForRoot(this.currentlyHovered);
      for (const t of targets) {
        this.highlightLayer.addMesh(t, new Color3(0.3, 0.7, 1.0));
      }
      this.currentlyHighlightedMeshes = targets;
    }
  }

  public setHeldMesh(mesh: Mesh | null): void {
    const root = this.getInteractableRoot(mesh);
    this.clearHighlight();

    if (this.currentlyHeld !== root) {
      if (this.currentlyHeld) {
        const released = this.currentlyHeld;
        this.currentlyHeld = null;
        this.onObjectReleased?.(released);
      }
      this.currentlyHeld = root;
      if (root && !root.isDisposed()) {
        this.onObjectGrabbed?.(root);
      }
    }

    if (root && !root.isDisposed()) {
      const targets = this.getVisualMeshesForRoot(root);
      for (const t of targets) {
        this.highlightLayer.addMesh(t, new Color3(0.2, 0.9, 0.4));
      }
      this.currentlyHighlightedMeshes = targets;
    }
  }

  public clearHeldHighlight(_mesh?: Mesh): void {
    if (this.currentlyHeld) {
      const released = this.currentlyHeld;
      this.currentlyHeld = null;
      this.onObjectReleased?.(released);
    }
    this.clearHighlight();
  }

  /**
   * Spawn a stack of crates and balls on the central table.
   */
  private spawnTableSet(): void {
    // 3 wooden-style crates
    const crateColors = [
      new Color3(0.85, 0.6, 0.3),
      new Color3(0.75, 0.5, 0.25),
      new Color3(0.9, 0.65, 0.35),
    ];

    crateColors.forEach((color, idx) => {
      const crate = this.createCrate(
        `tableCrate_${idx}`,
        new Vector3(-1.8 + idx * 1.5, 1.9, 2.5),
        new Vector3(0.7, 0.7, 0.7),
        color,
        1.5
      );
      this.registerInteractable(crate);
    });

    // 2 rubber bouncy balls on the table
    const ballA = this.createSphere(
      "tableBall_A",
      new Vector3(-0.6, 2.8, 2.5),
      0.6,
      new Color3(0.95, 0.2, 0.3),
      0.8,
      0.85
    );
    this.registerInteractable(ballA);

    const ballB = this.createSphere(
      "tableBall_B",
      new Vector3(0.8, 2.8, 2.5),
      0.5,
      new Color3(0.2, 0.8, 0.95),
      0.6,
      0.9
    );
    this.registerInteractable(ballB);

    // Heavy metal canister
    const can = this.createCylinder(
      "tableCanister",
      new Vector3(2.5, 1.9, 3.5),
      0.8,
      0.5,
      new Color3(0.4, 0.45, 0.55),
      6.0,
      0.15
    );
    this.registerInteractable(can);
  }

  /**
   * Spawn a line of domino tiles ready to be tipped over.
   */
  private spawnDominoRow(): void {
    const dominoCount = 14;
    const dominoWidth = 0.18;
    const dominoHeight = 0.9;
    const dominoDepth = 0.45;
    const spacing = 0.48;

    const dominoMat = new StandardMaterial("dominoMat", this.scene);
    dominoMat.diffuseColor = new Color3(0.95, 0.95, 0.98);
    dominoMat.specularColor = new Color3(0.3, 0.3, 0.3);

    const startX = -4;
    const startZ = 7;

    for (let i = 0; i < dominoCount; i++) {
      const domino = MeshBuilder.CreateBox(`domino_${i}`, {
        width: dominoWidth,
        height: dominoHeight,
        depth: dominoDepth,
      }, this.scene);

      // Arc curve layout for fun chain reaction
      const angle = (i / dominoCount) * 0.8;
      const x = startX + i * spacing;
      const z = startZ + Math.sin(angle) * 1.5;

      domino.position.set(x, dominoHeight / 2 + 0.01, z);
      domino.rotation.y = -angle * 0.5;
      domino.material = dominoMat;
      domino.receiveShadows = true;
      this.shadowGenerator.addShadowCaster(domino);

      this.physicsManager.addDynamicMesh(domino, {
        mass: 0.6,
        friction: 0.8,
        restitution: 0.1,
        shapeType: "box",
      });

      this.registerInteractable(domino, "domino");
    }
  }

  /**
   * Spawn rolling spheres at the top of the ramp.
   */
  private spawnRampSpheres(): void {
    const sphereColors = [
      new Color3(1.0, 0.4, 0.1),
      new Color3(0.2, 0.9, 0.4),
      new Color3(0.9, 0.8, 0.1),
      new Color3(0.6, 0.2, 0.9),
    ];

    sphereColors.forEach((color, idx) => {
      const sphere = this.createSphere(
        `rampBall_${idx}`,
        new Vector3(-12 + (idx % 2 === 0 ? -0.8 : 0.8), 4.4, 6.2 + Math.floor(idx / 2) * 1.0),
        0.75,
        color,
        1.2,
        0.75
      );
      this.registerInteractable(sphere, "sphere");
    });
  }

  /**
   * Pyramid stack of boxes on the floor (like Jenga/knockdown targets).
   */
  private spawnPyramidStack(): void {
    const size = 0.7;
    const layers = 4;
    const origin = new Vector3(8, 0, 4);

    const colors = [
      new Color3(0.25, 0.55, 0.85),
      new Color3(0.3, 0.65, 0.9),
      new Color3(0.35, 0.75, 0.95),
      new Color3(0.4, 0.85, 1.0),
    ];

    for (let layer = 0; layer < layers; layer++) {
      const count = layers - layer;
      const y = layer * size + size / 2 + 0.02;
      for (let i = 0; i < count; i++) {
        const offset = ((count - 1) * size) / 2;
        const x = origin.x + (i * size - offset);
        const z = origin.z;

        const box = this.createCrate(
          `pyramid_${layer}_${i}`,
          new Vector3(x, y, z),
          new Vector3(size * 0.96, size * 0.96, size * 0.96),
          colors[layer % colors.length],
          0.9
        );
        this.registerInteractable(box);
      }
    }
  }

  /**
   * Interactive floor pressure button that triggers sound and launches a prop when pressed.
   */
  private spawnInteractiveButton(): void {
    const buttonBase = MeshBuilder.CreateCylinder("buttonBase", { height: 0.2, diameter: 2.2 }, this.scene);
    buttonBase.position.set(0, 0.1, 10);
    const baseMat = new StandardMaterial("btnBaseMat", this.scene);
    baseMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
    buttonBase.material = baseMat;
    this.physicsManager.addStaticMesh(buttonBase, "cylinder");

    const buttonPuck = MeshBuilder.CreateCylinder("buttonPuck", { height: 0.25, diameter: 1.8 }, this.scene);
    buttonPuck.position.set(0, 0.25, 10);
    const puckMat = new StandardMaterial("btnPuckMat", this.scene);
    puckMat.diffuseColor = new Color3(1.0, 0.2, 0.2);
    puckMat.emissiveColor = new Color3(0.4, 0.05, 0.05);
    buttonPuck.material = puckMat;
    this.shadowGenerator.addShadowCaster(buttonPuck);

    const body = this.physicsManager.addDynamicMesh(buttonPuck, {
      mass: 0.5,
      friction: 0.9,
      restitution: 0.05,
      shapeType: "cylinder",
    });

    let cooldown = false;
    body.setCollisionCallbackEnabled(true);
    body.getCollisionObservable().add((collision) => {
      if (cooldown) return;
      if (collision.impulse > 0.8) {
        cooldown = true;
        SoundEffects.playChime();
        puckMat.emissiveColor = new Color3(0.2, 1.0, 0.3);

        // Spawn a celebration balloon/ball shooting upward
        this.spawnRandomProp(new Vector3(0, 3, 10), new Vector3((Math.random() - 0.5) * 2, 8, (Math.random() - 0.5) * 2));

        setTimeout(() => {
          puckMat.emissiveColor = new Color3(0.4, 0.05, 0.05);
          cooldown = false;
        }, 800);
      }
    });

    this.registerInteractable(buttonPuck, "button");
  }

  public createCrate(name: string, pos: Vector3, size: Vector3, color: Color3, mass: number = 1.0): Mesh {
    const crate = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
    crate.position.copyFrom(pos);

    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.25, 0.25, 0.25);
    crate.material = mat;
    crate.receiveShadows = true;
    this.shadowGenerator.addShadowCaster(crate);

    this.physicsManager.addDynamicMesh(crate, {
      mass,
      friction: 0.7,
      restitution: 0.25,
      shapeType: "box",
    });

    return crate;
  }

  public createSphere(name: string, pos: Vector3, diameter: number, color: Color3, mass: number = 1.0, restitution: number = 0.8): Mesh {
    const sphere = MeshBuilder.CreateSphere(name, { diameter, segments: 16 }, this.scene);
    sphere.position.copyFrom(pos);

    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.4, 0.4, 0.4);
    sphere.material = mat;
    sphere.receiveShadows = true;
    this.shadowGenerator.addShadowCaster(sphere);

    this.physicsManager.addDynamicMesh(sphere, {
      mass,
      friction: 0.4,
      restitution,
      shapeType: "sphere",
    });

    return sphere;
  }

  public createCylinder(name: string, pos: Vector3, height: number, diameter: number, color: Color3, mass: number = 2.0, restitution: number = 0.2): Mesh {
    const cylinder = MeshBuilder.CreateCylinder(name, { height, diameter, tessellation: 18 }, this.scene);
    cylinder.position.copyFrom(pos);

    const mat = new StandardMaterial(`${name}_mat`, this.scene);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.4, 0.4, 0.4);
    cylinder.material = mat;
    cylinder.receiveShadows = true;
    this.shadowGenerator.addShadowCaster(cylinder);

    this.physicsManager.addDynamicMesh(cylinder, {
      mass,
      friction: 0.6,
      restitution,
      shapeType: "cylinder",
    });

    return cylinder;
  }

  public spawnRandomProp(spawnPosition: Vector3, initialVelocity?: Vector3): Mesh {
    const types = ["box", "sphere", "cylinder"] as const;
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);

    const randomColor = new Color3(0.2 + Math.random() * 0.7, 0.2 + Math.random() * 0.7, 0.2 + Math.random() * 0.7);

    let prop: Mesh;
    if (chosenType === "box") {
      const s = 0.6 + Math.random() * 0.5;
      prop = this.createCrate(`spawnedBox_${id}`, spawnPosition, new Vector3(s, s, s), randomColor, 1.2);
      this.registerInteractable(prop, "crate");
    } else if (chosenType === "sphere") {
      const d = 0.6 + Math.random() * 0.5;
      prop = this.createSphere(`spawnedSphere_${id}`, spawnPosition, d, randomColor, 1.0, 0.85);
      this.registerInteractable(prop, "sphere");
    } else {
      const h = 0.8 + Math.random() * 0.4;
      const d = 0.5 + Math.random() * 0.3;
      prop = this.createCylinder(`spawnedCyl_${id}`, spawnPosition, h, d, randomColor, 2.0, 0.3);
      this.registerInteractable(prop, "cylinder");
    }

    if (initialVelocity && prop.physicsBody) {
      prop.physicsBody.setLinearVelocity(initialVelocity);
    }

    SoundEffects.playGrab();
    return prop;
  }

  public registerInteractable(mesh: Mesh, type: InteractableMetadata["type"] = "crate"): void {
    const existing = mesh.metadata || {};
    mesh.metadata = {
      ...existing,
      isInteractable: true,
      type: existing.type || type,
      name: existing.name || mesh.name,
    };
    this.interactables.add(mesh);

    mesh.onDisposeObservable.add(() => {
      this.interactables.delete(mesh);
      if (this.currentlyHovered === mesh) {
        this.currentlyHovered = null;
      }
    });
  }

  public unregisterInteractable(mesh: Mesh): void {
    this.interactables.delete(mesh);
    this.compoundVisuals.delete(mesh);
    if (this.currentlyHovered === mesh) {
      this.currentlyHovered = null;
    }
    if (this.currentlyHeld === mesh) {
      this.currentlyHeld = null;
    }
  }

  public getInteractableCount(): number {
    return this.interactables.size;
  }
}

