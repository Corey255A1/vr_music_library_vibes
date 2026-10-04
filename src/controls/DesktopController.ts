import {
  Scene,
  UniversalCamera,
  Vector3,
  SpotLight,
  Color3,
  Engine,
  Ray,
  Mesh,
  Quaternion,
} from "@babylonjs/core";
import { InteractableRegistry } from "../objects/InteractableRegistry";
import { PhysicsManager } from "../physics/PhysicsManager";
import { SoundEffects } from "../audio/SoundEffects";

export class DesktopController {
  private scene: Scene;
  private engine: Engine;
  private registry: InteractableRegistry;
  private physicsManager: PhysicsManager;

  public camera!: UniversalCamera;
  private flashlight!: SpotLight;
  private isFlashlightOn: boolean = false;

  // Interaction state
  private heldMesh: Mesh | null = null;
  private holdDistance: number = 3.0;
  private readonly minHoldDistance: number = 1.4;
  private readonly maxHoldDistance: number = 6.0;
  private readonly maxGrabReach: number = 7.5;
  private readonly throwPower: number = 15.0;

  // Rotation & upright snapping state for held object
  private targetHoldRotation: Quaternion = Quaternion.Identity();
  private isRotatingLeft: boolean = false;
  private isRotatingRight: boolean = false;
  private isTiltingDown: boolean = false;
  private isTiltingUp: boolean = false;

  // Player movement & jumping kinematics
  private isGrounded: boolean = true;
  private verticalVelocity: number = 0;
  private readonly jumpSpeed: number = 6.0;
  private readonly gravity: number = -18.0;
  private readonly playerEyeHeight: number = 1.75;
  private horizontalVelocity: Vector3 = Vector3.Zero();

  private keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };

  // Crosshair DOM
  private crosshairEl: HTMLElement | null = null;
  private promptEl: HTMLElement | null = null;

  constructor(
    scene: Scene,
    engine: Engine,
    registry: InteractableRegistry,
    physicsManager: PhysicsManager
  ) {
    this.scene = scene;
    this.engine = engine;
    this.registry = registry;
    this.physicsManager = physicsManager;

    this.crosshairEl = document.getElementById("crosshair");
    this.promptEl = document.getElementById("pointer-lock-prompt");
  }

  public setup(canvas: HTMLCanvasElement): void {
    this.createCamera(canvas);
    this.setupFlashlight();
    this.setupInputListeners(canvas);
    this.setupRenderLoopHook();
  }

  private createCamera(canvas: HTMLCanvasElement): void {
    this.camera = new UniversalCamera("desktopFPSCamera", new Vector3(0, 1.75, -1.8), this.scene);
    this.camera.setTarget(new Vector3(0, 1.75, 6));

    // Remove Babylon's default keyboard move input to prevent pitch-coupled movement and ground collision hopping
    this.camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

    this.camera.angularSensibility = 1800; // Mouse look sensitivity
    this.camera.inertia = 0.0; // Kinematic velocity handles smooth acceleration & deceleration
    this.camera.minZ = 0.1;
    this.camera.maxZ = 350;

    // Attach mouse look controls to canvas
    this.camera.attachControl(canvas, true);

    // Collision setup for player capsule against vertical obstacles (shelves, posts, pedestals)
    this.camera.checkCollisions = true;
    this.camera.applyGravity = false;
    // Set ellipsoid: radius (0.35, 0.75, 0.35). Bottom is at 1.75 - 2*0.75 = 0.25m, safely above floor
    this.camera.ellipsoid = new Vector3(0.35, 0.75, 0.35);
    this.camera.ellipsoidOffset = new Vector3(0, 0, 0);
  }

  private setupFlashlight(): void {
    this.flashlight = new SpotLight(
      "cameraFlashlight",
      Vector3.Zero(),
      new Vector3(0, 0, 1),
      Math.PI / 3.2,
      25,
      this.scene
    );
    this.flashlight.parent = this.camera;
    this.flashlight.diffuse = new Color3(1.0, 0.98, 0.92);
    this.flashlight.specular = new Color3(1.0, 1.0, 1.0);
    this.flashlight.intensity = 0; // Off by default
    this.isFlashlightOn = false;
  }

  private setupInputListeners(canvas: HTMLCanvasElement): void {
    // Pointer lock on canvas click
    canvas.addEventListener("click", () => {
      if (!this.engine.isPointerLock) {
        this.engine.enterPointerlock();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      if (this.engine.isPointerLock) {
        if (this.promptEl) this.promptEl.style.opacity = "0";
      } else {
        if (this.promptEl) this.promptEl.style.opacity = "1";
        // If pointer unlocked, release any held item
        this.releaseHeldMesh();
      }
    });

    // Mouse button interactions
    canvas.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.button === 0) {
        // Left click: Grab or release
        if (this.heldMesh) {
          this.releaseHeldMesh();
          return;
        }

        // If pointer locked, use forward ray interaction
        if (this.engine.isPointerLock) {
          this.tryGrabObject();
          return;
        }

        // If pointer NOT locked, pick directly under the mouse cursor
        const pick = this.scene.pick(
          this.scene.pointerX,
          this.scene.pointerY,
          (m) => this.registry.isInteractable(m as Mesh)
        );

        if (pick && pick.hit && pick.pickedMesh) {
          const root = this.registry.getInteractableRoot(pick.pickedMesh as Mesh);
          if (root?.metadata?.onSelect) {
            root.metadata.onSelect();
            return;
          }
        }
      } else if (e.button === 1) {
        // Middle click: Snap upright
        if (this.heldMesh) {
          e.preventDefault();
          this.snapHeldMeshUpright();
        }
      } else if (e.button === 2) {
        // Right click: Throw held object
        if (this.heldMesh) {
          e.preventDefault();
          this.throwHeldMesh();
        }
      }
    });

    canvas.addEventListener("auxclick", (e: MouseEvent) => {
      if (e.button === 1 && this.heldMesh) {
        e.preventDefault();
        this.snapHeldMeshUpright();
      }
    });

    // Prevent context menu on right click
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Mouse wheel: Carry distance zoom
    window.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (this.heldMesh) {
          e.preventDefault();
          this.holdDistance -= e.deltaY * 0.0025;
          this.holdDistance = Math.max(this.minHoldDistance, Math.min(this.maxHoldDistance, this.holdDistance));
        }
      },
      { passive: false }
    );

    // Keyboard keys (Movement WASD + Space, Q, E, Z, C, U, T, F, G, R, Shift)
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.code === "KeyW") this.keys.forward = true;
      if (e.code === "KeyS") this.keys.backward = true;
      if (e.code === "KeyA") this.keys.left = true;
      if (e.code === "KeyD") this.keys.right = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.keys.sprint = true;

      if (e.code === "Space") {
        e.preventDefault();
        this.jump();
      } else if (e.code === "KeyQ") {
        if (this.heldMesh) {
          this.isRotatingLeft = true;
        }
      } else if (e.code === "KeyE") {
        if (this.heldMesh) {
          this.isRotatingRight = true;
        } else {
          this.tryGrabObject();
        }
      } else if (e.code === "KeyZ") {
        if (this.heldMesh) {
          this.isTiltingDown = true;
        }
      } else if (e.code === "KeyC") {
        if (this.heldMesh) {
          this.isTiltingUp = true;
        }
      } else if (e.code === "KeyU") {
        if (this.heldMesh) {
          this.snapHeldMeshUpright();
        }
      } else if (e.code === "KeyT") {
        if (this.heldMesh) {
          this.throwHeldMesh();
        }
      } else if (e.code === "KeyF") {
        this.toggleFlashlight();
      } else if (e.code === "KeyG") {
        this.spawnPropInFront();
      } else if (e.code === "KeyR") {
        this.physicsManager.resetAllBodies();
        SoundEffects.playChime();
      }
    });

    window.addEventListener("keyup", (e: KeyboardEvent) => {
      if (e.code === "KeyW") this.keys.forward = false;
      if (e.code === "KeyS") this.keys.backward = false;
      if (e.code === "KeyA") this.keys.left = false;
      if (e.code === "KeyD") this.keys.right = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.keys.sprint = false;

      if (e.code === "KeyQ") {
        this.isRotatingLeft = false;
      } else if (e.code === "KeyE") {
        this.isRotatingRight = false;
      } else if (e.code === "KeyZ") {
        this.isTiltingDown = false;
      } else if (e.code === "KeyC") {
        this.isTiltingUp = false;
      }
    });

    window.addEventListener("blur", () => {
      this.keys.forward = false;
      this.keys.backward = false;
      this.keys.left = false;
      this.keys.right = false;
      this.keys.sprint = false;
    });
  }

  private setupRenderLoopHook(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.engine.getDeltaTime() / 1000;
      this.updatePlayerMovement(dt);
      this.updateObjectInteraction(dt);
    });
  }

  private updatePlayerMovement(dt: number): void {
    if (dt <= 0 || dt > 0.1) dt = 0.016;

    // 1. Planar horizontal movement strictly on the XZ plane based on camera yaw (rotation.y)
    // Looking up or down will never alter walking height or push into ground
    const yaw = this.camera.rotation.y;
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    const inputDir = Vector3.Zero();
    if (this.keys.forward) inputDir.addInPlace(forward);
    if (this.keys.backward) inputDir.subtractInPlace(forward);
    if (this.keys.right) inputDir.addInPlace(right);
    if (this.keys.left) inputDir.subtractInPlace(right);

    const hasInput = inputDir.lengthSquared() > 0.001;
    if (hasInput) {
      inputDir.normalize();
    }

    const moveSpeed = this.keys.sprint ? 7.5 : 4.2;
    const targetVelocity = hasInput ? inputDir.scale(moveSpeed) : Vector3.Zero();

    // Smooth responsive acceleration / deceleration
    const responsiveness = hasInput ? 18.0 : 22.0;
    this.horizontalVelocity = Vector3.Lerp(
      this.horizontalVelocity,
      targetVelocity,
      Math.min(1.0, dt * responsiveness)
    );

    // Apply horizontal displacement with collision detection (slides smoothly against shelves/posts)
    const horizontalDisplacement = this.horizontalVelocity.scale(dt);
    if (horizontalDisplacement.lengthSquared() > 0.000001) {
      this.camera.cameraDirection.x = horizontalDisplacement.x;
      this.camera.cameraDirection.z = horizontalDisplacement.z;
      this.camera.cameraDirection.y = 0; // Strictly zero: WASD cannot change elevation or push into ground
    } else {
      this.camera.cameraDirection.set(0, 0, 0);
    }

    // 2. Ground detection & vertical height handling (gravity + jump)
    const rayStart = new Vector3(this.camera.position.x, this.camera.position.y + 0.2, this.camera.position.z);
    const downRay = new Ray(rayStart, new Vector3(0, -1, 0), 10.0);
    const hit = this.scene.pickWithRay(downRay, (mesh) => {
      if (!mesh.isPickable || !mesh.isVisible) return false;
      const n = mesh.name.toLowerCase();
      return n.includes("floor") || n.includes("ground") || n.includes("platform");
    });

    const groundY = (hit && hit.hit && hit.pickedPoint) ? hit.pickedPoint.y : 0;
    const targetY = groundY + this.playerEyeHeight;

    if (this.isGrounded) {
      // Firmly locked at eye height above floor - zero hopping or jitter
      this.camera.position.y = targetY;
      this.verticalVelocity = 0;
    } else {
      // In mid-air (jumping or falling)
      this.verticalVelocity += this.gravity * dt;
      this.camera.position.y += this.verticalVelocity * dt;

      if (this.camera.position.y <= targetY) {
        this.camera.position.y = targetY;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }
    }
  }

  private jump(): void {
    if (this.isGrounded) {
      this.verticalVelocity = this.jumpSpeed;
      this.isGrounded = false;
      SoundEffects.playThrow();
    }
  }

  private toggleFlashlight(): void {
    this.isFlashlightOn = !this.isFlashlightOn;
    this.flashlight.intensity = this.isFlashlightOn ? 1.8 : 0;
    SoundEffects.playGrab();
  }

  private tryGrabObject(): void {
    // 35m reach so the player can select album sleeves from anywhere down the aisle
    const ray = this.camera.getForwardRay(35.0);
    const hit = this.scene.pickWithRay(ray, (mesh) => this.registry.isInteractable(mesh as Mesh));

    if (hit && hit.hit && hit.pickedMesh) {
      const mesh = this.registry.getInteractableRoot(hit.pickedMesh as Mesh);
      if (!mesh) return;

      // 1. Selectable items with onSelect callback (Album Sleeves, Return Signboards, etc.)
      if (mesh.metadata?.onSelect) {
        mesh.metadata.onSelect();
        return;
      }

      // 2. Physical Track Record or Prop: must be within max physical reach
      if (hit.distance <= this.maxGrabReach) {
        if (mesh.metadata?.type === "cartridge" && mesh.metadata?.cartridge) {
          mesh.metadata.cartridge.activateDynamicPhysics();
        }

        // Clicking grabs it with physics
        if (mesh.physicsBody) {
          this.heldMesh = mesh;
          this.holdDistance = Math.max(
            this.minHoldDistance,
            Math.min(this.maxHoldDistance, Vector3.Distance(this.camera.position, mesh.position))
          );
          this.registry.setHeldMesh(mesh);
          SoundEffects.playGrab();

          if (this.crosshairEl) {
            this.crosshairEl.className = "holding";
          }

          if (!mesh.rotationQuaternion) {
            mesh.rotationQuaternion = Quaternion.FromEulerAngles(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
          }
          this.targetHoldRotation = mesh.rotationQuaternion.clone();
        }
      }
    }
  }

  public getHeldMesh(): Mesh | null {
    return this.heldMesh;
  }

  public snapHeldMeshUpright(): void {
    if (!this.heldMesh) return;
    this.snapMeshUpright(this.heldMesh);
  }

  public snapMeshUpright(mesh: Mesh): void {
    if (!mesh) return;
    const currentRot = mesh.rotationQuaternion || Quaternion.FromEulerAngles(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
    const euler = currentRot.toEulerAngles();
    const uprightQuat = Quaternion.FromEulerAngles(0, euler.y, 0);

    if (this.heldMesh === mesh) {
      this.targetHoldRotation.copyFrom(uprightQuat);
    }

    if (!mesh.rotationQuaternion) {
      mesh.rotationQuaternion = uprightQuat.clone();
    } else {
      mesh.rotationQuaternion.copyFrom(uprightQuat);
    }

    const body = mesh.physicsBody;
    if (body) {
      body.setAngularVelocity(Vector3.Zero());
    }

    SoundEffects.playGrab();
  }

  private releaseHeldMesh(): void {
    if (this.heldMesh) {
      this.registry.clearHeldHighlight(this.heldMesh);
      this.heldMesh = null;
      this.isRotatingLeft = false;
      this.isRotatingRight = false;
      this.isTiltingDown = false;
      this.isTiltingUp = false;
      if (this.crosshairEl) {
        this.crosshairEl.className = "";
      }
    }
  }

  private throwHeldMesh(): void {
    if (!this.heldMesh) return;

    const mesh = this.heldMesh;
    const body = mesh.physicsBody;

    if (body) {
      const forward = this.camera.getDirection(Vector3.Forward()).normalize();
      const mass = body.getMassProperties()?.mass ?? 1.0;
      const impulse = forward.scale(this.throwPower * Math.max(0.6, mass * 0.8));

      body.applyImpulse(impulse, mesh.position);
      SoundEffects.playThrow();
    }

    this.releaseHeldMesh();
  }

  private updateObjectInteraction(dt: number): void {
    // If not holding anything, check what player is aiming at for highlight/crosshair
    if (!this.heldMesh) {
      let hitMesh: Mesh | null = null;

      if (this.engine.isPointerLock) {
        const ray = this.camera.getForwardRay(35.0);
        const hit = this.scene.pickWithRay(ray, (mesh) => this.registry.isInteractable(mesh as Mesh));
        if (hit && hit.hit && hit.pickedMesh) {
          hitMesh = hit.pickedMesh as Mesh;
        }
      } else {
        const pick = this.scene.pick(
          this.scene.pointerX,
          this.scene.pointerY,
          (mesh) => this.registry.isInteractable(mesh as Mesh)
        );
        if (pick && pick.hit && pick.pickedMesh) {
          hitMesh = pick.pickedMesh as Mesh;
        }
      }

      if (hitMesh) {
        this.registry.setHoveredMesh(hitMesh);
        if (this.crosshairEl && this.crosshairEl.className !== "targeted") {
          this.crosshairEl.className = "targeted";
        }
      } else {
        this.registry.setHoveredMesh(null);
        if (this.crosshairEl && this.crosshairEl.className === "targeted") {
          this.crosshairEl.className = "";
        }
      }
      return;
    }

    // Holding an object: smoothly pull it to target hold point via physics velocity
    const mesh = this.heldMesh;
    const body = mesh.physicsBody;
    if (!body || mesh.isDisposed()) {
      this.releaseHeldMesh();
      return;
    }

    const forward = this.camera.getDirection(Vector3.Forward());
    const targetPos = this.camera.position.add(forward.scale(this.holdDistance));
    const currentPos = mesh.position;

    const delta = targetPos.subtract(currentPos);
    const distanceToTarget = delta.length();

    // If something pushed the object extremely far away (e.g. pinned behind thick wall), break grip
    if (distanceToTarget > 6.0) {
      this.releaseHeldMesh();
      return;
    }

    // Spring/velocity tracking: proportional pull speed capped for realism
    const pullSpeed = Math.min(22.0, distanceToTarget * 14.0);
    const desiredVelocity = delta.normalize().scale(pullSpeed);

    // Apply linear velocity
    body.setLinearVelocity(desiredVelocity);

    // Rotation controls from keys (Q/E for yaw, Z/C for pitch)
    const rotSpeed = 2.4; // ~140 deg/s
    if (this.isRotatingLeft) {
      const yawDelta = Quaternion.RotationAxis(Vector3.Up(), -rotSpeed * dt);
      this.targetHoldRotation = yawDelta.multiply(this.targetHoldRotation);
    }
    if (this.isRotatingRight) {
      const yawDelta = Quaternion.RotationAxis(Vector3.Up(), rotSpeed * dt);
      this.targetHoldRotation = yawDelta.multiply(this.targetHoldRotation);
    }
    if (this.isTiltingDown) {
      const camRight = this.camera.getDirection(Vector3.Right()).normalize();
      const pitchDelta = Quaternion.RotationAxis(camRight, rotSpeed * dt);
      this.targetHoldRotation = pitchDelta.multiply(this.targetHoldRotation);
    }
    if (this.isTiltingUp) {
      const camRight = this.camera.getDirection(Vector3.Right()).normalize();
      const pitchDelta = Quaternion.RotationAxis(camRight, -rotSpeed * dt);
      this.targetHoldRotation = pitchDelta.multiply(this.targetHoldRotation);
    }

    // Smoothly steer mesh rotation towards targetHoldRotation
    if (!mesh.rotationQuaternion) {
      mesh.rotationQuaternion = this.targetHoldRotation.clone();
    } else {
      Quaternion.SlerpToRef(mesh.rotationQuaternion, this.targetHoldRotation, Math.min(1.0, 16.0 * dt), mesh.rotationQuaternion);
    }

    // Zero out angular velocity while held so it follows commanded orientation stably
    body.setAngularVelocity(Vector3.Zero());
  }

  private spawnPropInFront(): void {
    const forward = this.camera.getDirection(Vector3.Forward());
    const spawnPos = this.camera.position.add(forward.scale(2.5));
    const initialVel = forward.scale(4.0);
    this.registry.spawnRandomProp(spawnPos, initialVel);
  }
}
