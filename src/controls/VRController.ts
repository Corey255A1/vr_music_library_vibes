import {
  Scene,
  Vector3,
  Quaternion,
  Mesh,
  Ray,
  WebXRDefaultExperience,
  WebXRInputSource,
  WebXRControllerComponent,
  WebXRState,
} from "@babylonjs/core";
import { InteractableRegistry } from "../objects/InteractableRegistry";
import { SoundEffects } from "../audio/SoundEffects";

interface HandGrabState {
  source: WebXRInputSource;
  heldMesh: Mesh | null;
  prevPosition: Vector3;
  velocity: Vector3;
}

export class VRController {
  private scene: Scene;
  private registry: InteractableRegistry;
  public xrExperience: WebXRDefaultExperience | null = null;
  private activeHands: Map<string, HandGrabState> = new Map();
  public isSupported: boolean = false;

  constructor(scene: Scene, registry: InteractableRegistry) {
    this.scene = scene;
    this.registry = registry;
  }

  public async setup(floorMeshes: Mesh[]): Promise<boolean> {
    try {
      if (typeof navigator === "undefined" || !("xr" in navigator)) {
        console.log("WebXR is not available on this browser/device.");
        this.isSupported = false;
        return false;
      }

      this.xrExperience = await this.scene.createDefaultXRExperienceAsync({
        floorMeshes,
        disableTeleportation: false,
      });

      this.isSupported = true;

      // Handle XR state changes
      this.xrExperience.baseExperience.onStateChangedObservable.add((state) => {
        const xrStatusEl = document.getElementById("xr-status");
        if (state === WebXRState.IN_XR) {
          if (xrStatusEl) xrStatusEl.innerText = "XR: In VR Session";
          console.log("Entered WebXR VR Session");
        } else if (state === WebXRState.NOT_IN_XR) {
          if (xrStatusEl) xrStatusEl.innerText = "XR: Available";
          console.log("Exited WebXR VR Session");
          this.releaseAllGrabs();
        }
      });

      // Hook controller inputs
      this.xrExperience.input.onControllerAddedObservable.add((controller) => {
        this.handleControllerAdded(controller);
      });

      this.xrExperience.input.onControllerRemovedObservable.add((controller) => {
        this.handleControllerRemoved(controller);
      });

      // Render loop velocity tracker and carry updater
      this.scene.onBeforeRenderObservable.add(() => {
        const dt = this.scene.getEngine().getDeltaTime() / 1000;
        this.updateHands(dt);
      });

      return true;
    } catch (err) {
      console.warn("WebXR initialization failed or not supported:", err);
      this.isSupported = false;
      return false;
    }
  }

  private handleControllerAdded(controller: WebXRInputSource): void {
    const handState: HandGrabState = {
      source: controller,
      heldMesh: null,
      prevPosition: Vector3.Zero(),
      velocity: Vector3.Zero(),
    };

    const id = controller.uniqueId;
    this.activeHands.set(id, handState);

    controller.onMotionControllerInitObservable.add((motionController) => {
      // Setup squeeze (grip) button for grabbing
      const squeezeComp = motionController.getComponentOfType(WebXRControllerComponent.SQUEEZE_TYPE);
      const triggerComp = motionController.getComponentOfType(WebXRControllerComponent.TRIGGER_TYPE);

      const grabComponent = squeezeComp || triggerComp;
      if (grabComponent) {
        grabComponent.onButtonStateChangedObservable.add((component) => {
          if (component.changes.pressed) {
            if (component.pressed) {
              this.onHandGrabPress(handState);
            } else {
              this.onHandGrabRelease(handState);
            }
          }
        });
      }

      // Thumbstick button click to snap held object upright
      const thumbstickComp = motionController.getComponentOfType(WebXRControllerComponent.THUMBSTICK_TYPE);
      if (thumbstickComp) {
        thumbstickComp.onButtonStateChangedObservable.add((component) => {
          if (component.changes.pressed && component.pressed && handState.heldMesh) {
            this.snapMeshUpright(handState.heldMesh);
          }
        });
      }
    });
  }

  private handleControllerRemoved(controller: WebXRInputSource): void {
    const handState = this.activeHands.get(controller.uniqueId);
    if (handState) {
      this.onHandGrabRelease(handState);
      this.activeHands.delete(controller.uniqueId);
    }
  }

  private onHandGrabPress(hand: HandGrabState): void {
    if (hand.heldMesh) return;

    const grip = hand.source.grip || hand.source.pointer;
    if (!grip) return;

    const handPos = grip.position;

    // 1. Near grab check: search for an interactable within 0.8m radius
    let closestMesh: Mesh | null = null;
    let closestDist = 0.8;

    for (const mesh of this.scene.meshes) {
      const root = this.registry.getInteractableRoot(mesh as Mesh);
      if (root && root.physicsBody) {
        const d = Vector3.Distance(handPos, root.position);
        if (d < closestDist) {
          closestDist = d;
          closestMesh = root;
        }
      }
    }

    // 2. If no object is directly touched, try ray grab or ray selection from pointer
    if (!closestMesh && hand.source.pointer) {
      const ray = new Ray(Vector3.Zero(), Vector3.Zero(), 25.0);
      hand.source.getWorldPointerRayToRef(ray);
      const hit = this.scene.pickWithRay(ray, (m) => this.registry.isInteractable(m as Mesh));
      if (hit && hit.hit && hit.pickedMesh) {
        const root = this.registry.getInteractableRoot(hit.pickedMesh as Mesh);
        if (root && (root.metadata?.onSelect || hit.distance < 6.0)) {
          closestMesh = root;
        }
      }
    }

    if (!closestMesh) return;

    // 1. Selectable items with onSelect callback in VR (Album Sleeves, Return Signboards, etc.)
    if (closestMesh.metadata?.onSelect) {
      closestMesh.metadata.onSelect();
      try {
        hand.source.motionController?.pulse(0.4, 40);
      } catch {}
      return;
    }

    // 2. Grabable Record: Activate dynamic Havok body on grab
    if (closestMesh.metadata?.type === "cartridge" && closestMesh.metadata?.cartridge) {
      closestMesh.metadata.cartridge.activateDynamicPhysics();
    }

    if (closestMesh.physicsBody) {
      hand.heldMesh = closestMesh;
      this.registry.setHeldMesh(closestMesh);
      SoundEffects.playGrab();

      // Trigger haptic feedback pulse if supported
      try {
        hand.source.motionController?.pulse(0.6, 60);
      } catch {
        // Haptics optional
      }
    }
  }

  private onHandGrabRelease(hand: HandGrabState): void {
    if (!hand.heldMesh) return;

    const mesh = hand.heldMesh;
    const body = mesh.physicsBody;

    if (body) {
      // Inherit controller release velocity to throw objects in VR!
      const throwSpeed = hand.velocity.scale(1.4);
      body.setLinearVelocity(throwSpeed);
      SoundEffects.playThrow();
    }

    this.registry.clearHeldHighlight(mesh);
    hand.heldMesh = null;
  }

  private releaseAllGrabs(): void {
    for (const hand of this.activeHands.values()) {
      this.onHandGrabRelease(hand);
    }
  }

  private updateHands(dt: number): void {
    if (dt <= 0) return;

    for (const hand of this.activeHands.values()) {
      const grip = hand.source.grip || hand.source.pointer;
      if (!grip) continue;

      const currentPos = grip.position;

      // Calculate instantaneous velocity
      const instantVelocity = currentPos.subtract(hand.prevPosition).scale(1 / dt);
      // Smooth velocity filtering
      hand.velocity = Vector3.Lerp(hand.velocity, instantVelocity, 0.4);
      hand.prevPosition.copyFrom(currentPos);

      // If holding an object in VR, pull it to the controller grip
      if (hand.heldMesh) {
        const mesh = hand.heldMesh;
        const body = mesh.physicsBody;
        if (!body || mesh.isDisposed()) {
          hand.heldMesh = null;
          continue;
        }

        const delta = currentPos.subtract(mesh.position);
        const pullSpeed = Math.min(25.0, delta.length() * 18.0);
        body.setLinearVelocity(delta.normalize().scale(pullSpeed));

        // Damp angular velocity while in hand
        body.setAngularVelocity(body.getAngularVelocity().scale(0.8));
      }
    }
  }

  public snapMeshUpright(mesh: Mesh): void {
    if (!mesh) return;
    const currentRot = mesh.rotationQuaternion || Quaternion.FromEulerAngles(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
    const euler = currentRot.toEulerAngles();
    const uprightQuat = Quaternion.FromEulerAngles(0, euler.y, 0);

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
}
