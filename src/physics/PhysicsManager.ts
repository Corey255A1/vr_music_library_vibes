import {
  Scene,
  Vector3,
  Mesh,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShape,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsShapeCylinder,
  PhysicsShapeConvexHull,
  Quaternion,
  HavokPlugin,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { SoundEffects } from "../audio/SoundEffects";

export interface DynamicBodyOptions {
  mass?: number;
  friction?: number;
  restitution?: number;
  shapeType?: "box" | "sphere" | "cylinder" | "convex";
  enableCollisionSound?: boolean;
}

export interface StoredTransform {
  mesh: Mesh;
  body: PhysicsBody;
  position: Vector3;
  rotationQuaternion: Quaternion;
}

export class PhysicsManager {
  private static plugin: HavokPlugin | null = null;
  private scene: Scene;
  private dynamicBodies: StoredTransform[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public static async initPhysics(scene: Scene, gravity: Vector3 = new Vector3(0, -9.81, 0)): Promise<PhysicsManager> {
    const havokInstance = await HavokPhysics({
      locateFile: () => "/HavokPhysics.wasm",
    });

    const plugin = new HavokPlugin(true, havokInstance);
    scene.enablePhysics(gravity, plugin);
    PhysicsManager.plugin = plugin;

    const manager = new PhysicsManager(scene);
    return manager;
  }

  public static getPlugin(): HavokPlugin | null {
    return this.plugin;
  }

  /**
   * Create a static collision body for static environment meshes (floors, ramps, tables).
   */
  public addStaticMesh(mesh: Mesh, shapeType: "box" | "cylinder" | "convex" = "box"): PhysicsBody {
    let shape: PhysicsShape;

    if (shapeType === "cylinder") {
      shape = PhysicsShapeCylinder.FromMesh(mesh);
    } else if (shapeType === "convex") {
      shape = new PhysicsShapeConvexHull(mesh, this.scene);
    } else {
      shape = PhysicsShapeBox.FromMesh(mesh);
    }

    shape.material = { friction: 0.7, restitution: 0.2 };

    const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, this.scene);
    body.shape = shape;
    body.setMassProperties({ mass: 0 });

    // Enable camera collision on all static meshes
    mesh.checkCollisions = true;

    return body;
  }

  /**
   * Create a kinematic (ANIMATED) physics body for moving platforms and sliding shelving.
   * Transforms are synchronized each frame so dynamic objects correctly collide and rest on them.
   */
  public addKinematicMesh(mesh: Mesh, shapeType: "box" | "cylinder" = "box"): PhysicsBody {
    const shape = shapeType === "cylinder" ? PhysicsShapeCylinder.FromMesh(mesh) : PhysicsShapeBox.FromMesh(mesh);
    shape.material = { friction: 0.8, restitution: 0.1 };

    const body = new PhysicsBody(mesh, PhysicsMotionType.ANIMATED, false, this.scene);
    body.shape = shape;
    body.setMassProperties({ mass: 0 });
    mesh.checkCollisions = true;

    return body;
  }

  /**
   * Create a dynamic, interactive physics body for props (crates, balls, dominoes).
   */
  public addDynamicMesh(mesh: Mesh, options: DynamicBodyOptions = {}): PhysicsBody {
    const mass = options.mass ?? 1.0;
    const friction = options.friction ?? 0.6;
    const restitution = options.restitution ?? 0.3;
    const shapeType = options.shapeType ?? "box";
    const enableCollisionSound = options.enableCollisionSound ?? true;

    let shape: PhysicsShape;
    if (shapeType === "sphere") {
      shape = PhysicsShapeSphere.FromMesh(mesh);
    } else if (shapeType === "cylinder") {
      shape = PhysicsShapeCylinder.FromMesh(mesh);
    } else if (shapeType === "convex") {
      shape = new PhysicsShapeConvexHull(mesh, this.scene);
    } else {
      shape = PhysicsShapeBox.FromMesh(mesh);
    }

    shape.material = { friction, restitution };

    const body = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.scene);
    body.shape = shape;
    body.setMassProperties({ mass });

    // Damping to prevent perpetual sliding/jittering
    body.setLinearDamping(0.15);
    body.setAngularDamping(0.25);

    // Initial transform snapshot for scene reset
    const initialRot = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : Quaternion.Identity();
    this.dynamicBodies.push({
      mesh,
      body,
      position: mesh.position.clone(),
      rotationQuaternion: initialRot,
    });

    if (enableCollisionSound) {
      body.setCollisionCallbackEnabled(true);
      const isHeavy = mass >= 5;
      let lastSoundTime = 0;

      body.getCollisionObservable().add((collisionEvent) => {
        const now = performance.now();
        // Debounce collision sounds per object to avoid audio chatter
        if (now - lastSoundTime > 120) {
          const impulse = collisionEvent.impulse;
          if (impulse > 0.4) {
            SoundEffects.playImpact(impulse, isHeavy);
            lastSoundTime = now;
          }
        }
      });
    }

    return body;
  }

  /**
   * Reset all dynamic objects to their initial positions and zero out velocities.
   */
  public resetAllBodies(): void {
    for (const record of this.dynamicBodies) {
      const { mesh, body, position, rotationQuaternion } = record;
      if (!mesh.isDisposed()) {
        body.setLinearVelocity(Vector3.Zero());
        body.setAngularVelocity(Vector3.Zero());
        mesh.position.copyFrom(position);
        if (mesh.rotationQuaternion) {
          mesh.rotationQuaternion.copyFrom(rotationQuaternion);
        }
        body.transformNode.position.copyFrom(position);
        if (body.transformNode.rotationQuaternion) {
          body.transformNode.rotationQuaternion.copyFrom(rotationQuaternion);
        }
      }
    }
  }

  /**
   * Register a newly spawned object so it's tracked for reset.
   */
  public registerDynamicRecord(mesh: Mesh, body: PhysicsBody): void {
    const initialRot = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : Quaternion.Identity();
    this.dynamicBodies.push({
      mesh,
      body,
      position: mesh.position.clone(),
      rotationQuaternion: initialRot,
    });
  }

  public getDynamicCount(): number {
    return this.dynamicBodies.filter((b) => !b.mesh.isDisposed()).length;
  }
}
