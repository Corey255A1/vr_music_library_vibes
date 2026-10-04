import {
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  Texture,
  DynamicTexture,
  Quaternion,
  ShadowGenerator,
  PhysicsMotionType,
} from "@babylonjs/core";
import { MusicTrack, EmbyClient } from "./EmbyClient";
import { PhysicsManager } from "../physics/PhysicsManager";
import { InteractableRegistry } from "../objects/InteractableRegistry";

export class MusicCartridge {
  public mesh: Mesh;
  public track: MusicTrack;
  public shelfHomePosition: Vector3;
  public shelfHomeRotation: Vector3;

  private scene: Scene;
  private physicsManager: PhysicsManager;
  private registry: InteractableRegistry;
  private frontPlane: Mesh;
  private backPlane: Mesh;
  private trackLabelPlane: Mesh;
  private trackLabelTex: DynamicTexture;
  private isDynamic = false;
  private initialParent?: Mesh;

  constructor(
    scene: Scene,
    physicsManager: PhysicsManager,
    registry: InteractableRegistry,
    shadowGenerator: ShadowGenerator | null,
    track: MusicTrack,
    initialPos: Vector3,
    initialRot: Vector3 = Vector3.Zero(),
    parentMesh?: Mesh
  ) {
    this.scene = scene;
    this.physicsManager = physicsManager;
    this.registry = registry;
    this.track = track;
    this.shelfHomePosition = initialPos.clone();
    this.shelfHomeRotation = initialRot.clone();
    this.initialParent = parentMesh;

    // 1. Core Cartridge Enclosure / Chassis
    const width = 0.44;
    const height = 0.44;
    const depth = 0.032;

    this.mesh = MeshBuilder.CreateBox(`cartridge_${track.id}`, { width, height, depth }, this.scene);
    if (parentMesh) {
      this.mesh.parent = parentMesh;
      this.mesh.position.copyFrom(initialPos);
      this.mesh.rotation.copyFrom(initialRot);
    } else {
      this.mesh.position.copyFrom(initialPos);
      this.mesh.rotation.copyFrom(initialRot);
    }

    // Chassis frame material with subtle dominant-color glow rim
    const dominantColor = Color3.FromHexString(track.dominantColorHex || "#ff007f");
    const frameMat = new StandardMaterial(`frameMat_${track.id}`, this.scene);
    frameMat.diffuseColor = new Color3(0.08, 0.1, 0.14);
    frameMat.specularColor = new Color3(0.4, 0.4, 0.4);
    frameMat.emissiveColor = dominantColor.scale(0.25);
    this.mesh.material = frameMat;
    this.mesh.receiveShadows = true;

    if (shadowGenerator) {
      shadowGenerator.addShadowCaster(this.mesh);
    }

    // 2. Front Face: Album Artwork
    const faceZOffset = depth / 2 + 0.003;
    this.frontPlane = MeshBuilder.CreatePlane(`front_${track.id}`, { width: width * 0.94, height: height * 0.94 }, this.scene);
    this.frontPlane.parent = this.mesh;
    this.frontPlane.position.set(0, 0, faceZOffset);
    this.frontPlane.rotation.y = Math.PI; // Face +Z so album artwork is unmirrored
    this.frontPlane.isPickable = false;

    const frontMat = new StandardMaterial(`frontMat_${track.id}`, this.scene);
    frontMat.backFaceCulling = false;
    frontMat.specularColor = new Color3(0.2, 0.2, 0.2);
    frontMat.emissiveColor = new Color3(0.95, 0.95, 0.95);

    // Load texture with automatic SVG fallback on any error/CORS block
    const frontTex = new Texture(
      track.albumCoverUrl,
      this.scene,
      false,
      false,
      undefined,
      undefined,
      () => {
        // Fallback procedural album cover
        console.log(`Album cover network fallback for: ${track.title}`);
        const fallbackUrl = EmbyClient.createSvgAlbumCover(
          track.album || track.title,
          track.artist,
          track.dominantColorHex,
          "#141a24",
          "🎵"
        );
        const fallbackTex = new Texture(fallbackUrl, this.scene);
        frontMat.diffuseTexture = fallbackTex;
        frontMat.emissiveTexture = fallbackTex;
      }
    );
    frontMat.diffuseTexture = frontTex;
    frontMat.emissiveTexture = frontTex;
    this.frontPlane.material = frontMat;

    // 3. Back Face: Artist Photo & Metadata Card
    this.backPlane = MeshBuilder.CreatePlane(`back_${track.id}`, { width: width * 0.94, height: height * 0.94 }, this.scene);
    this.backPlane.parent = this.mesh;
    this.backPlane.position.set(0, 0, -faceZOffset);
    this.backPlane.rotation.y = 0; // Natural plane normal faces -Z outwards to rear (unmirrored)
    this.backPlane.isPickable = false;

    const backMat = new StandardMaterial(`backMat_${track.id}`, this.scene);
    backMat.backFaceCulling = false;
    backMat.specularColor = new Color3(0.2, 0.2, 0.2);
    backMat.emissiveColor = new Color3(0.95, 0.95, 0.95);

    const backTex = new Texture(
      track.artistPhotoUrl,
      this.scene,
      false,
      false,
      undefined,
      undefined,
      () => {
        console.log(`Artist portrait network fallback for: ${track.artist}`);
        const fallbackUrl = EmbyClient.createSvgArtistPhoto(track.artist, track.dominantColorHex, "#0f141d");
        const fallbackTex = new Texture(fallbackUrl, this.scene);
        backMat.diffuseTexture = fallbackTex;
        backMat.emissiveTexture = fallbackTex;
      }
    );
    backMat.diffuseTexture = backTex;
    backMat.emissiveTexture = backTex;
    this.backPlane.material = backMat;

    // 4. Floating 3D Track Name Label (illuminates on hover)
    this.trackLabelPlane = MeshBuilder.CreatePlane(`trackLabel_${track.id}`, { width: 0.85, height: 0.18 }, this.scene);
    this.trackLabelPlane.position.set(0, height / 2 + 0.12, 0.04);
    this.trackLabelPlane.rotation.y = Math.PI; // Face +Z so hover text is unmirrored
    this.trackLabelPlane.parent = this.mesh;
    this.trackLabelPlane.isPickable = false;
    this.trackLabelPlane.isVisible = false;

    this.trackLabelTex = new DynamicTexture(`trackLabelTex_${track.id}`, { width: 512, height: 128 }, this.scene, false);
    const ctx = this.trackLabelTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = "rgba(8, 12, 20, 0.94)";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = track.dominantColorHex || "#00e5ff";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const trackIndexStr = track.trackIndex ? `${track.trackIndex}. ` : "";
    const fullTitle = `${trackIndexStr}${track.title}`;
    const shortTitle = fullTitle.length > 24 ? fullTitle.substring(0, 22) + "…" : fullTitle;
    ctx.fillText(shortTitle, 256, 44);

    ctx.fillStyle = track.dominantColorHex || "#00e5ff";
    ctx.font = "18px monospace";
    ctx.fillText(`${track.artist.substring(0, 24)} • GRAB TO PLAY`, 256, 88);
    this.trackLabelTex.update();

    const labelMat = new StandardMaterial(`trackLabelMat_${track.id}`, this.scene);
    labelMat.diffuseTexture = this.trackLabelTex;
    labelMat.emissiveTexture = this.trackLabelTex;
    labelMat.emissiveColor = new Color3(1, 1, 1);
    this.trackLabelPlane.material = labelMat;

    // 5. Cartridge rests parented to the rack structure without Havok body to maintain synchronized motion


    // 6. Register with InteractableRegistry
    this.registry.registerInteractable(this.mesh, "cartridge");
    this.mesh.metadata = {
      ...this.mesh.metadata,
      isInteractable: true,
      type: "cartridge",
      name: `Record: ${track.title} - ${track.artist}`,
      track: this.track,
      cartridge: this,
    };
    this.registry.registerCompoundVisualMeshes(this.mesh, [this.mesh, this.frontPlane, this.backPlane]);
  }

  public setHovered(hovered: boolean): void {
    if (this.trackLabelPlane && !this.trackLabelPlane.isDisposed()) {
      this.trackLabelPlane.isVisible = hovered;
    }
    const mat = this.mesh.material as StandardMaterial;
    if (mat) {
      const col = Color3.FromHexString(this.track.dominantColorHex || "#00e5ff");
      mat.emissiveColor = hovered ? col.scale(0.85) : col.scale(0.25);
    }
  }

  /**
   * Activates full dynamic physics when the player picks up the cartridge from the shelf.
   */
  public activateDynamicPhysics(): void {
    if (!this.mesh.physicsBody) {
      if (this.mesh.parent) {
        this.mesh.setParent(null);
      }
      this.physicsManager.addDynamicMesh(this.mesh, {
        shapeType: "box",
        mass: 0.8,
        friction: 0.6,
        restitution: 0.15,
      });
      this.isDynamic = true;
    } else if (!this.isDynamic) {
      if (this.mesh.parent) {
        this.mesh.setParent(null);
      }
      this.mesh.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
      this.isDynamic = true;
    }
  }

  public resetToShelf(): void {
    if (this.mesh.isDisposed()) return;

    if (this.mesh.physicsBody) {
      this.mesh.physicsBody.dispose();
      (this.mesh as any).physicsBody = null;
    }
    this.isDynamic = false;

    if (this.initialParent && !this.initialParent.isDisposed()) {
      this.mesh.parent = this.initialParent;
    }
    this.mesh.position.copyFrom(this.shelfHomePosition);
    if (!this.mesh.rotationQuaternion) {
      this.mesh.rotation.copyFrom(this.shelfHomeRotation);
    } else {
      this.mesh.rotationQuaternion.copyFrom(
        Quaternion.FromEulerAngles(
          this.shelfHomeRotation.x,
          this.shelfHomeRotation.y,
          this.shelfHomeRotation.z
        )
      );
    }
  }

  public dispose(): void {
    if (this.mesh.physicsBody) {
      this.mesh.physicsBody.dispose();
      (this.mesh as any).physicsBody = null;
    }
    this.registry.unregisterInteractable(this.mesh);
    this.trackLabelTex?.dispose();
    this.trackLabelPlane?.dispose();
    this.frontPlane.dispose();
    this.backPlane.dispose();
    this.mesh.dispose();
  }
}
