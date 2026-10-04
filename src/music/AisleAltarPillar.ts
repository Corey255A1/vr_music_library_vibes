import {
  Scene,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  PointLight,
  ParticleSystem,
  Texture,
  Animation,
  Quaternion,
  DynamicTexture,
  Matrix,
} from "@babylonjs/core";
import { MusicCartridge } from "./MusicCartridge";
import { MusicPlayer } from "./MusicPlayer";
import { SoundEffects } from "../audio/SoundEffects";

export class AisleAltarPillar {
  private scene: Scene;
  private musicPlayer: MusicPlayer;

  public pillarRoot: Mesh;
  public columnMesh: Mesh;
  public receptacleMesh: Mesh;
  public floorHatchMesh: Mesh;
  public beaconRing: Mesh;
  public guidanceSignMesh: Mesh;
  public altarLight: PointLight;

  private isDeployed = false;
  private isDockingInProgress = false;
  private heldCartridge: MusicCartridge | null = null;
  public dockedCartridge: MusicCartridge | null = null;

  private fireParticleSystem: ParticleSystem | null = null;

  constructor(scene: Scene, musicPlayer: MusicPlayer) {
    this.scene = scene;
    this.musicPlayer = musicPlayer;

    // Create Root Node submerged below floor initially
    this.pillarRoot = new Mesh("aisleAltarRoot", this.scene);
    this.pillarRoot.position.set(0, -2.4, 0);

    // 1. Floor Iris Hatch (remains flush with floor at Y=0.01)
    this.floorHatchMesh = MeshBuilder.CreateCylinder("floorIrisHatch", { diameter: 1.1, height: 0.03, tessellation: 24 }, this.scene);
    this.floorHatchMesh.position.set(0, 0.015, 0);
    const hatchMat = new StandardMaterial("hatchMat", this.scene);
    hatchMat.diffuseColor = new Color3(0.12, 0.15, 0.2);
    hatchMat.specularColor = new Color3(0.5, 0.5, 0.5);
    this.floorHatchMesh.material = hatchMat;
    this.floorHatchMesh.isVisible = false; // Becomes visible when active

    // 2. Rising Pedestal / Column
    this.columnMesh = MeshBuilder.CreateCylinder("altarColumn", { diameter: 0.65, height: 1.05, tessellation: 8 }, this.scene);
    this.columnMesh.position.set(0, 0.525, 0);
    this.columnMesh.parent = this.pillarRoot;

    const columnMat = new StandardMaterial("altarColumnMat", this.scene);
    columnMat.diffuseColor = new Color3(0.15, 0.18, 0.24);
    columnMat.specularColor = new Color3(0.7, 0.7, 0.7);
    this.columnMesh.material = columnMat;

    // Glowing vertical power conduits along column edges
    const conduitMat = new StandardMaterial("conduitMat", this.scene);
    conduitMat.diffuseColor = new Color3(0, 0.8, 1);
    conduitMat.emissiveColor = new Color3(0, 0.7, 1);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const pipe = MeshBuilder.CreateCylinder(`conduit_${i}`, { diameter: 0.04, height: 1.02 }, this.scene);
      pipe.position.set(Math.cos(angle) * 0.31, 0.525, Math.sin(angle) * 0.31);
      pipe.material = conduitMat;
      pipe.parent = this.pillarRoot;
    }

    // 3. Top Console & Receptacle Slot
    this.receptacleMesh = MeshBuilder.CreateBox("receptacleTop", { width: 0.68, height: 0.2, depth: 0.45 }, this.scene);
    this.receptacleMesh.position.set(0, 1.15, 0);
    this.receptacleMesh.parent = this.pillarRoot;

    const topMat = new StandardMaterial("altarTopMat", this.scene);
    topMat.diffuseColor = new Color3(0.1, 0.13, 0.18);
    topMat.specularColor = new Color3(0.8, 0.8, 0.8);
    this.receptacleMesh.material = topMat;

    // Glowing Cartridge Slot opening on top
    const slotGlow = MeshBuilder.CreateBox("slotGlow", { width: 0.48, height: 0.03, depth: 0.08 }, this.scene);
    slotGlow.position.set(0, 1.25, 0);
    slotGlow.material = conduitMat;
    slotGlow.parent = this.pillarRoot;

    // 4. Holographic Beacon Ring
    this.beaconRing = MeshBuilder.CreateTorus("altarBeaconRing", { diameter: 0.85, thickness: 0.02, tessellation: 32 }, this.scene);
    this.beaconRing.position.set(0, 1.45, 0);
    this.beaconRing.parent = this.pillarRoot;

    const ringMat = new StandardMaterial("beaconRingMat", this.scene);
    ringMat.diffuseColor = new Color3(0, 0.9, 1);
    ringMat.emissiveColor = new Color3(0, 0.85, 1);
    ringMat.alpha = 0.75;
    this.beaconRing.material = ringMat;

    // 5. Holographic 3D Guidance Sign
    this.guidanceSignMesh = MeshBuilder.CreatePlane("altarGuidanceSign", { width: 1.6, height: 0.42 }, this.scene);
    this.guidanceSignMesh.bakeTransformIntoVertices(Matrix.RotationY(Math.PI));
    this.guidanceSignMesh.position.set(0, 1.82, 0);
    this.guidanceSignMesh.parent = this.pillarRoot;
    this.guidanceSignMesh.billboardMode = Mesh.BILLBOARDMODE_Y;

    const signTex = new DynamicTexture("guidanceSignTex", { width: 512, height: 128 }, this.scene, false);
    const sCtx = signTex.getContext() as unknown as CanvasRenderingContext2D;
    sCtx.fillStyle = "rgba(10, 16, 26, 0.92)";
    sCtx.fillRect(0, 0, 512, 128);
    sCtx.strokeStyle = "#00e5ff";
    sCtx.lineWidth = 4;
    sCtx.strokeRect(6, 6, 500, 116);
    sCtx.fillStyle = "#ffffff";
    sCtx.font = "bold 28px 'Segoe UI', Roboto, sans-serif";
    sCtx.textAlign = "center";
    sCtx.textBaseline = "middle";
    sCtx.fillText("⬇ DROP ALBUM HERE ⬇", 256, 48);
    sCtx.fillStyle = "#00e5ff";
    sCtx.font = "bold 20px monospace";
    sCtx.fillText("INSERT TO PLAY SONG", 256, 90);
    signTex.update();

    const signMat = new StandardMaterial("guidanceSignMat", this.scene);
    signMat.diffuseTexture = signTex;
    signMat.emissiveTexture = signTex;
    signMat.emissiveColor = new Color3(1, 1, 1);
    signMat.backFaceCulling = false;
    this.guidanceSignMesh.material = signMat;

    // Dynamic light on the altar
    this.altarLight = new PointLight("altarLight", new Vector3(0, 1.4, 0), this.scene);
    this.altarLight.diffuse = new Color3(0, 0.8, 1);
    this.altarLight.intensity = 0;
    this.altarLight.parent = this.pillarRoot;
  }

  /**
   * Called when player picks up any MusicCartridge.
   * Altar rises smoothly from the floor in the aisle ahead of the player!
   */
  public onCartridgeGrabbed(cartridge: MusicCartridge, playerPos: Vector3, playerForward: Vector3): void {
    this.heldCartridge = cartridge;
    if (this.isDockingInProgress) return;

    // If already deployed near player, keep it raised and active
    if (this.isDeployed) {
      const distToPlayer = Vector3.Distance(playerPos, this.pillarRoot.position);
      if (distToPlayer < 4.5) {
        this.altarLight.intensity = 2.5;
        return;
      }
    }

    // Determine deployment position: 1.6m in front of player in aisle
    const flatForward = new Vector3(playerForward.x, 0, playerForward.z).normalize();
    let targetX = playerPos.x + flatForward.x * 1.6;
    const targetZ = playerPos.z + flatForward.z * 1.6;

    // Keep strictly within central walking aisle between shelves
    targetX = Math.max(-2.8, Math.min(2.8, targetX));

    this.pillarRoot.position.set(targetX, -2.4, targetZ);
    this.floorHatchMesh.position.set(targetX, 0.015, targetZ);
    this.floorHatchMesh.isVisible = true;

    // Rise animation from Y=-2.4 to Y=0.0
    this.isDeployed = true;
    SoundEffects.playHydraulicRise();

    const anim = new Animation(
      "altarRise",
      "position.y",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    anim.setKeys([
      { frame: 0, value: -2.4 },
      { frame: 35, value: 0.0 },
    ]);

    this.pillarRoot.animations = [anim];
    this.scene.beginAnimation(this.pillarRoot, 0, 35, false, 1.0, () => {
      this.altarLight.intensity = 2.5;
    });
  }

  /**
   * Called when held cartridge is released or moved near the altar.
   */
  public onCartridgeReleased(cartridge: MusicCartridge): void {
    if (this.isDockingInProgress) return;

    // Check distance between cartridge and receptacle slot (generous 2.0m radius for easy dropping)
    const slotWorldPos = this.receptacleMesh.getAbsolutePosition();
    const dist = Vector3.Distance(cartridge.mesh.position, slotWorldPos);

    if (dist < 2.0) {
      // Player dropped cartridge near or into receptacle: trigger dramatic dock & fire sequence!
      this.dockAndPlay(cartridge);
    } else {
      this.heldCartridge = null;
      // If player dropped it far away, sink pillar back after delay
      setTimeout(() => {
        if (!this.heldCartridge && !this.isDockingInProgress) {
          this.sinkPillar();
        }
      }, 3500);
    }
  }

  /**
   * Continuous update hook in render loop to detect if held cartridge is hovering right over the slot.
   */
  public update(): void {
    if (!this.isDeployed || this.isDockingInProgress) return;

    // Rotate beacon ring and gently pulse light
    this.beaconRing.rotation.y += 0.04;
    this.altarLight.intensity = 2.0 + Math.sin(performance.now() * 0.006) * 0.6;

    if (this.heldCartridge) {
      const slotWorldPos = this.receptacleMesh.getAbsolutePosition();
      const dist = Vector3.Distance(this.heldCartridge.mesh.position, slotWorldPos);

      // If held within 0.85m of slot, auto-dock
      if (dist < 0.85) {
        this.dockAndPlay(this.heldCartridge);
      }
    }
  }

  /**
   * Executes the full sequence:
   * 1. Dock cartridge into receptacle slot
   * 2. Ignite fiery particle burst matching album cover color
   * 3. Sinks pillar into floor
   * 4. Starts audio playback
   */
  public dockAndPlay(cartridge: MusicCartridge): void {
    if (this.isDockingInProgress) return;
    this.isDockingInProgress = true;
    this.dockedCartridge = cartridge;
    this.heldCartridge = null;

    // 1. Dock snap: disable physics and lock cartridge to pillar slot
    if (cartridge.mesh.physicsBody) {
      cartridge.mesh.physicsBody.dispose();
      cartridge.mesh.physicsBody = null;
    }

    cartridge.mesh.parent = this.pillarRoot;
    cartridge.mesh.position.set(0, 1.32, 0); // Inserted into slot
    cartridge.mesh.rotation.set(0, 0, 0);
    cartridge.mesh.rotationQuaternion = Quaternion.Identity();

    SoundEffects.playDockClick();

    // 2. Extract album dominant color
    const hexColor = cartridge.track.dominantColorHex || "#ff007f";
    const primaryColor = Color3.FromHexString(hexColor);

    // 3. Ignite Fiery Particle Effect
    this.igniteFieryParticleEffect(primaryColor);
    SoundEffects.playIgnitionFire();

    // 4. Delay briefly to let the fire roar, then sink pillar into floor
    setTimeout(() => {
      this.sinkPillarWithFire(() => {
        // 5. Start audio playback!
        this.musicPlayer.playTrack(cartridge.track);

        // Reset docked cartridge back to its shelf slot for future re-selection
        setTimeout(() => {
          cartridge.mesh.parent = null;
          cartridge.resetToShelf();
          this.isDockingInProgress = false;
        }, 1500);
      });
    }, 600);
  }

  private igniteFieryParticleEffect(flameColor: Color3): void {
    if (this.fireParticleSystem) {
      this.fireParticleSystem.dispose();
      this.fireParticleSystem = null;
    }

    // Dynamic fire particle system located at receptacle slot
    const ps = new ParticleSystem("altarFireParticles", 600, this.scene);
    ps.particleTexture = new Texture("https://playground.babylonjs.com/textures/flare.png", this.scene);

    ps.emitter = this.receptacleMesh;
    ps.minEmitBox = new Vector3(-0.25, 0.15, -0.05);
    ps.maxEmitBox = new Vector3(0.25, 0.15, 0.05);

    // Color gradient matching album art
    ps.color1 = new Color4(flameColor.r * 1.5, flameColor.g * 1.5, flameColor.b * 1.5, 1.0);
    ps.color2 = new Color4(flameColor.r, flameColor.g, flameColor.b, 0.85);
    ps.colorDead = new Color4(0.08, 0.04, 0.04, 0.0);

    ps.minSize = 0.12;
    ps.maxSize = 0.38;

    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 0.9;

    ps.emitRate = 450;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;

    ps.gravity = new Vector3(0, 4.0, 0); // Rise upward
    ps.direction1 = new Vector3(-0.3, 2.5, -0.3);
    ps.direction2 = new Vector3(0.3, 3.2, 0.3);

    ps.minAngularSpeed = -2.0;
    ps.maxAngularSpeed = 2.0;

    ps.start();
    this.fireParticleSystem = ps;

    // Tint light to match fire
    this.altarLight.diffuse = flameColor;
    this.altarLight.intensity = 2.5;
  }

  private sinkPillarWithFire(onComplete: () => void): void {
    SoundEffects.playHydraulicRise();

    const anim = new Animation(
      "altarSinkWithFire",
      "position.y",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    anim.setKeys([
      { frame: 0, value: 0.0 },
      { frame: 65, value: -2.4 },
    ]);

    this.pillarRoot.animations = [anim];
    this.scene.beginAnimation(this.pillarRoot, 0, 65, false, 1.0, () => {
      this.isDeployed = false;
      this.floorHatchMesh.isVisible = false;
      this.altarLight.intensity = 0;

      if (this.fireParticleSystem) {
        this.fireParticleSystem.stop();
        setTimeout(() => {
          this.fireParticleSystem?.dispose();
          this.fireParticleSystem = null;
        }, 1000);
      }

      onComplete();
    });
  }

  public sinkPillar(): void {
    if (!this.isDeployed || this.isDockingInProgress) return;

    SoundEffects.playHydraulicRise();

    const anim = new Animation(
      "altarSinkIdle",
      "position.y",
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    anim.setKeys([
      { frame: 0, value: this.pillarRoot.position.y },
      { frame: 40, value: -2.4 },
    ]);

    this.pillarRoot.animations = [anim];
    this.scene.beginAnimation(this.pillarRoot, 0, 40, false, 1.0, () => {
      this.isDeployed = false;
      this.floorHatchMesh.isVisible = false;
      this.altarLight.intensity = 0;
    });
  }
}
