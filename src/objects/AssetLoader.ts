import {
  Scene,
  Vector3,
  Mesh,
  MeshBuilder,
  SceneLoader,
  ShadowGenerator,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { PhysicsManager } from "../physics/PhysicsManager";
import { InteractableRegistry } from "./InteractableRegistry";
import { SoundEffects } from "../audio/SoundEffects";

export interface AssetInfo {
  id: string;
  name: string;
  filename: string;
  category: "Characters" | "Seating" | "Tables" | "Beds" | "Storage" | "Doors" | "Rooms";
  mass: number;
  scale?: number;
  isStatic?: boolean;
  isCharacter?: boolean;
}

export const AVAILABLE_ASSETS: AssetInfo[] = [
  
];

export class AssetLoader {
  private scene: Scene;
  private physicsManager: PhysicsManager;
  private registry: InteractableRegistry;
  private shadowGenerator: ShadowGenerator;

  constructor(
    scene: Scene,
    physicsManager: PhysicsManager,
    registry: InteractableRegistry,
    shadowGenerator: ShadowGenerator
  ) {
    this.scene = scene;
    this.physicsManager = physicsManager;
    this.registry = registry;
    this.shadowGenerator = shadowGenerator;
  }

  /**
   * Load and drop a GLB asset by filename from the /assets/ folder.
   */
  public async loadAssetById(assetId: string, spawnPos: Vector3, rotationY?: number): Promise<Mesh | null> {
    const asset = AVAILABLE_ASSETS.find((a) => a.id === assetId);
    if (!asset) {
      console.warn(`Asset with id "${assetId}" not found.`);
      return null;
    }

    const folder = asset.isCharacter ? "characters" : "assets";
    const url = `/${folder}/${asset.filename}`;
    return this.loadGLB(url, asset.name, spawnPos, asset.mass, asset.isStatic ?? false, asset.scale ?? 1.0, rotationY);
  }

  /**
   * Load and drop a user-dropped File (from desktop Drag & Drop).
   */
  public async loadAssetFromFile(file: File, spawnPos: Vector3, rotationY?: number): Promise<Mesh | null> {
    const objectUrl = URL.createObjectURL(file);
    const friendlyName = file.name.replace(/\.[^/.]+$/, "");

    try {
      const mesh = await this.loadGLB(objectUrl, friendlyName, spawnPos, 8.0, false, 1.0, rotationY);
      return mesh;
    } finally {
      // URL will be retained by Babylon until loaded
    }
  }

  /**
   * Core GLB loader and physics collider generator.
   */
  public async loadGLB(
    fileUrl: string,
    modelName: string,
    spawnPos: Vector3,
    mass: number = 5.0,
    isStatic: boolean = false,
    scaleFactor: number = 1.0,
    rotationY?: number
  ): Promise<Mesh | null> {
    try {
      const result = await SceneLoader.ImportMeshAsync("", "", fileUrl, this.scene);
      const root = result.meshes[0];

      if (scaleFactor !== 1.0) {
        root.scaling.scaleInPlace(scaleFactor);
      }

      // Compute composite hierarchy bounding box
      const hierarchyBounds = root.getHierarchyBoundingVectors(true);
      const size = hierarchyBounds.max.subtract(hierarchyBounds.min);

      // Clamp size to prevent zero or negative dimensions
      const width = Math.max(0.2, size.x);
      const height = Math.max(0.2, size.y);
      const depth = Math.max(0.2, size.z);

      const center = hierarchyBounds.min.add(size.scale(0.5));

      // Create an invisible outer bounding collider box for accurate physics
      const colliderId = `prop_${modelName.replace(/\s+/g, "_")}_${Date.now()}`;
      const collider = MeshBuilder.CreateBox(
        colliderId,
        { width, height, depth },
        this.scene
      );

      collider.isVisible = false;
      collider.checkCollisions = true;

      // Position collider at spawn point, resting cleanly on the ground
      collider.position.copyFrom(spawnPos);
      collider.position.y += height / 2;

      if (rotationY !== undefined) {
        collider.rotation.y = rotationY;
      }

      // Parent visual hierarchy directly to collider and center it
      root.parent = collider;
      root.position.copyFrom(center.scale(-1));

      collider.computeWorldMatrix(true);
      root.computeWorldMatrix(true);

      // Configure shadows and collision for all visual child meshes
      for (const mesh of result.meshes) {
        if (mesh instanceof Mesh && mesh !== collider) {
          mesh.receiveShadows = true;
          this.shadowGenerator.addShadowCaster(mesh);
        }
      }

      // Add physics body
      if (isStatic) {
        this.physicsManager.addStaticMesh(collider, "box");
      } else {
        this.physicsManager.addDynamicMesh(collider, {
          mass,
          shapeType: "box",
          friction: 0.75,
          restitution: 0.15,
        });

        // Register as interactable so it can be picked up, carried, and thrown!
        this.registry.registerInteractable(collider, "crate");
        this.registry.registerCompoundVisualMeshes(collider, result.meshes.filter((m): m is Mesh => m instanceof Mesh && m !== collider));
      }

      SoundEffects.playChime();
      return collider;
    } catch (err) {
      console.error(`Failed to load GLB model from ${fileUrl}:`, err);
      return null;
    }
  }
}

