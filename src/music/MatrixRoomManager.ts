import {
  Scene,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  TransformNode,
  DynamicTexture,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  Animation,
} from "@babylonjs/core";
import { PhysicsManager } from "../physics/PhysicsManager";
import { SoundEffects } from "../audio/SoundEffects";
import { MusicAlbum } from "./EmbyClient";

export interface AlbumSlot {
  genre: string;
  rackId: string;
  rackMesh: Mesh;
  shelfIndex: number;
  slotIndex: number;
  localPosition: Vector3;
  localRotation: Vector3;
}

export interface TrackSlot {
  rackMesh: Mesh;
  shelfIndex: number;
  slotIndex: number;
  localPosition: Vector3;
  localRotation: Vector3;
}

export interface GenreAisleConfig {
  name: string;
  albumCount: number;
  accentColor?: string;
  icon?: string;
}

export class MatrixRoomManager {
  private scene: Scene;
  private physicsManager: PhysicsManager;
  public shadowGenerator!: ShadowGenerator;

  public constructRoot: Mesh;
  public aislesContainer: TransformNode;
  public floorMesh!: Mesh;
  public ceilingTrussMesh!: Mesh;

  // Genre Album Racks
  public rackMeshes: Mesh[] = [];
  public albumSlots: AlbumSlot[] = [];
  public genrePrimaryPositions: Map<string, Vector3> = new Map();
  public originalRackPositions: Map<Mesh, Vector3> = new Map();
  public displacedGenreRack: Mesh | null = null;
  public activeGenres: string[] = [];

  // Selected Album Track Rack (dedicated presentation rack for grabable records)
  public trackRackRoot: Mesh;
  public trackRackHeaderMesh?: Mesh;
  public trackRackSignPlane?: Mesh;
  private trackRackHeaderTex?: DynamicTexture;
  public isTrackRackSummoned = false;
  public onTrackRackDismissRequested?: () => void;

  public targetAislesPos: Vector3 = Vector3.Zero();
  private isSliding = false;

  private constructLights: (HemisphericLight | DirectionalLight)[] = [];

  constructor(scene: Scene, physicsManager: PhysicsManager) {
    this.scene = scene;
    this.physicsManager = physicsManager;
    this.constructRoot = new Mesh("matrixConstructRoot", this.scene);
    this.aislesContainer = new TransformNode("matrixAislesContainer", this.scene);
    this.aislesContainer.parent = this.constructRoot;

    // Dedicated Track Presentation Rack Root (parented to aislesContainer to slide together)
    this.trackRackRoot = new Mesh("albumTrackRackRoot", this.scene);
    this.trackRackRoot.parent = this.aislesContainer;
    this.trackRackRoot.position.set(3.4, -3.5, 0); // Initially hidden below the floor
    this.trackRackRoot.rotation.y = -Math.PI / 2;
    this.trackRackRoot.setEnabled(false);

    // Smooth mechanical sliding observer for aisles
    this.scene.onBeforeRenderObservable.add(() => {
      const dist = Vector3.Distance(this.aislesContainer.position, this.targetAislesPos);
      if (dist > 0.01) {
        this.aislesContainer.position = Vector3.Lerp(this.aislesContainer.position, this.targetAislesPos, 0.12);
        if (!this.isSliding) {
          this.isSliding = true;
          SoundEffects.playWhoosh(0.7);
        }
      } else if (this.isSliding) {
        this.aislesContainer.position.copyFrom(this.targetAislesPos);
        this.isSliding = false;
        SoundEffects.playImpact(0.5, true);
      }
    });
  }

  public setup(): void {
    this.setupLighting();
    this.createConstructFloor();
    this.createCeilingTrusses();
    this.buildTrackRackStructure();
  }

  private setupLighting(): void {
    const hemi = new HemisphericLight("matrixHemiLight", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.85;
    hemi.diffuse = new Color3(0.96, 0.98, 1.0);
    hemi.groundColor = new Color3(0.75, 0.8, 0.88);
    this.constructLights.push(hemi);

    const dirLight = new DirectionalLight("matrixDirLight", new Vector3(-0.25, -1, -0.2).normalize(), this.scene);
    dirLight.position = new Vector3(10, 35, 10);
    dirLight.intensity = 1.1;
    dirLight.diffuse = new Color3(1.0, 1.0, 1.0);
    this.constructLights.push(dirLight);

    this.shadowGenerator = new ShadowGenerator(2048, dirLight);
    this.shadowGenerator.useBlurExponentialShadowMap = true;
    this.shadowGenerator.blurKernel = 32;
    this.shadowGenerator.bias = 0.001;
  }

  private createConstructFloor(): void {
    const size = 120;
    this.floorMesh = MeshBuilder.CreateGround("matrixFloor", { width: size, height: size }, this.scene);
    this.floorMesh.parent = this.constructRoot;
    this.floorMesh.receiveShadows = true;
    this.floorMesh.checkCollisions = false;

    const tex = new DynamicTexture("matrixFloorTex", { width: 1024, height: 1024 }, this.scene, false);
    const ctx = tex.getContext();
    ctx.fillStyle = "#f3f5f9";
    ctx.fillRect(0, 0, 1024, 1024);

    ctx.strokeStyle = "rgba(70, 95, 130, 0.18)";
    ctx.lineWidth = 4;
    const step = 64;
    for (let x = 0; x <= 1024; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
    }
    for (let y = 0; y <= 1024; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(40, 130, 240, 0.35)";
    for (let x = 0; x <= 1024; x += step) {
      for (let y = 0; y <= 1024; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    tex.update();
    tex.uScale = 15;
    tex.vScale = 15;

    const floorMat = new StandardMaterial("matrixFloorMat", this.scene);
    floorMat.diffuseTexture = tex;
    floorMat.specularColor = new Color3(0.5, 0.55, 0.65);
    floorMat.specularPower = 64;
    this.floorMesh.material = floorMat;

    const collider = MeshBuilder.CreateBox("matrixFloorCollider", { width: size, height: 2, depth: size }, this.scene);
    collider.position.y = -1;
    collider.isVisible = false;
    this.physicsManager.addStaticMesh(collider, "box");
    collider.checkCollisions = false;

    this.scene.clearColor = new Color4(0.92, 0.94, 0.97, 1.0);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.005;
    this.scene.fogColor = new Color3(0.92, 0.94, 0.97);

    // Glowing neon aisle floor guide tracks
    const trackMat = new StandardMaterial("trackMat", this.scene);
    trackMat.diffuseColor = new Color3(0.0, 0.6, 1.0);
    trackMat.emissiveColor = new Color3(0.0, 0.5, 0.9);

    const trackZ = 60;
    [-3.2, 3.2, -6.8, 6.8].forEach((x, idx) => {
      const strip = MeshBuilder.CreateBox(`aisleTrack_${idx}`, { width: 0.12, height: 0.02, depth: trackZ }, this.scene);
      strip.position.set(x, 0.01, 0);
      strip.material = trackMat;
      strip.parent = this.constructRoot;
    });
  }

  private createCeilingTrusses(): void {
    const trussMat = new StandardMaterial("trussMat", this.scene);
    trussMat.diffuseColor = new Color3(0.2, 0.24, 0.3);
    trussMat.specularColor = new Color3(0.4, 0.45, 0.5);

    this.ceilingTrussMesh = MeshBuilder.CreateBox("ceilingTrussCenter", { width: 14, height: 0.6, depth: 14 }, this.scene);
    this.ceilingTrussMesh.position.set(0, 16.5, 0);
    this.ceilingTrussMesh.material = trussMat;
    this.ceilingTrussMesh.parent = this.constructRoot;

    const beam1 = MeshBuilder.CreateBox("trussBeam1", { width: 40, height: 0.5, depth: 0.8 }, this.scene);
    beam1.position.set(0, 16.5, 0);
    beam1.material = trussMat;
    beam1.parent = this.constructRoot;

    const beam2 = MeshBuilder.CreateBox("trussBeam2", { width: 0.8, height: 0.5, depth: 40 }, this.scene);
    beam2.position.set(0, 16.5, 0);
    beam2.material = trussMat;
    beam2.parent = this.constructRoot;
  }

  /**
   * Cleans up existing dynamic aisles, rack meshes, and slot definitions.
   */
  public clearAisles(): void {
    for (const rack of this.rackMeshes) {
      rack.dispose(false, true);
    }
    this.rackMeshes = [];
    this.albumSlots = [];
    this.genrePrimaryPositions.clear();
    this.originalRackPositions.clear();
    this.displacedGenreRack = null;
    this.activeGenres = [];
    this.targetAislesPos.set(0, 0, 0);
    this.aislesContainer.position.set(0, 0, 0);
    this.hideTrackRack();
  }

  /**
   * Builds the Genre Album Racks directly from Emby's query of all genres.
   * Each rack displays the album sleeves for that genre and is selectable.
   */
  public buildGenreAlbumRacks(genreConfigs: GenreAisleConfig[]): void {
    this.clearAisles();

    if (genreConfigs.length === 0) return;

    this.activeGenres = genreConfigs.map((g) => g.name);

    const rackWidth = 5.0;
    const rackDepth = 0.65;
    const rackHeight = 2.8;
    const aisleXOffset = 4.6;
    const bayPitchZ = 5.8;

    const rackMat = new StandardMaterial("matrixRackMat", this.scene);
    rackMat.diffuseColor = new Color3(0.12, 0.15, 0.2);
    rackMat.specularColor = new Color3(0.6, 0.6, 0.6);

    const shelfMat = new StandardMaterial("matrixShelfMat", this.scene);
    shelfMat.diffuseColor = new Color3(0.85, 0.9, 0.95);
    shelfMat.emissiveColor = new Color3(0.15, 0.2, 0.25);

    // Stagger bays alternating left and right down the aisle
    const baySpots: Array<{ isLeft: boolean; xPos: number; zPos: number; facingRotY: number }> = [];
    const maxBaysNeeded = genreConfigs.reduce((sum, g) => sum + Math.max(1, Math.ceil(g.albumCount / 15)), 0);
    const pairsCount = Math.ceil(maxBaysNeeded / 2) + 2;

    for (let p = 0; p < pairsCount; p++) {
      let zOffset = 0;
      if (p > 0) {
        const sign = p % 2 === 1 ? 1 : -1;
        const mag = Math.ceil(p / 2);
        zOffset = sign * mag * bayPitchZ;
      }

      // Left bay (faces +X)
      baySpots.push({
        isLeft: true,
        xPos: -aisleXOffset,
        zPos: zOffset,
        facingRotY: Math.PI / 2,
      });

      // Right bay (faces -X)
      baySpots.push({
        isLeft: false,
        xPos: aisleXOffset,
        zPos: zOffset,
        facingRotY: -Math.PI / 2,
      });
    }

    let bayIndex = 0;
    let rackCounter = 0;

    for (const genreCfg of genreConfigs) {
      const baysNeeded = Math.max(1, Math.ceil(genreCfg.albumCount / 15));
      let isFirstBayOfGenre = true;

      for (let b = 0; b < baysNeeded; b++) {
        if (bayIndex >= baySpots.length) break;
        const spot = baySpots[bayIndex++];
        const rackId = `genreRack_${genreCfg.name.replace(/[^a-zA-Z0-9]/g, "_")}_${rackCounter++}`;

        const rackRoot = new Mesh(rackId, this.scene);
        rackRoot.position.set(spot.xPos, 0, spot.zPos);
        rackRoot.rotation.y = spot.facingRotY;
        rackRoot.parent = this.aislesContainer;
        this.rackMeshes.push(rackRoot);
        this.originalRackPositions.set(rackRoot, new Vector3(spot.xPos, 0, spot.zPos));

        if (isFirstBayOfGenre) {
          this.genrePrimaryPositions.set(genreCfg.name, new Vector3(spot.xPos, 0, spot.zPos));
          isFirstBayOfGenre = false;
        }

        // Frame uprights
        const postLeft = MeshBuilder.CreateBox(`${rackId}_postL`, { width: 0.08, height: rackHeight, depth: rackDepth }, this.scene);
        postLeft.position.set(-rackWidth / 2, rackHeight / 2, 0);
        postLeft.material = rackMat;
        postLeft.parent = rackRoot;

        const postRight = MeshBuilder.CreateBox(`${rackId}_postR`, { width: 0.08, height: rackHeight, depth: rackDepth }, this.scene);
        postRight.position.set(rackWidth / 2, rackHeight / 2, 0);
        postRight.material = rackMat;
        postRight.parent = rackRoot;

        // Rack backplate (attached to rackRoot for 100% unified movement)
        const backPlate = MeshBuilder.CreateBox(`${rackId}_backplate`, { width: rackWidth, height: rackHeight, depth: 0.05 }, this.scene);
        backPlate.position.set(0, rackHeight / 2, -rackDepth / 2 + 0.025);
        backPlate.material = rackMat;
        backPlate.parent = rackRoot;
        backPlate.checkCollisions = true;

        // 3 Shelves for Albums
        const shelfLevels = [0.75, 1.45, 2.15];
        shelfLevels.forEach((shelfY, shelfIdx) => {
          const shelfMesh = MeshBuilder.CreateBox(`${rackId}_shelf_${shelfIdx}`, { width: rackWidth, height: 0.06, depth: rackDepth * 0.9 }, this.scene);
          shelfMesh.position.set(0, shelfY, 0);
          shelfMesh.material = shelfMat;
          shelfMesh.parent = rackRoot;
          shelfMesh.checkCollisions = true;

          // LED under-glow strip
          const ledStrip = MeshBuilder.CreateBox(`${rackId}_led_${shelfIdx}`, { width: rackWidth * 0.96, height: 0.015, depth: 0.04 }, this.scene);
          ledStrip.position.set(0, shelfY - 0.035, rackDepth * 0.42);
          const ledMat = new StandardMaterial(`${rackId}_ledMat_${shelfIdx}`, this.scene);
          const accentCol = genreCfg.accentColor ? Color3.FromHexString(genreCfg.accentColor) : new Color3(0, 0.8, 1);
          ledMat.diffuseColor = accentCol;
          ledMat.emissiveColor = accentCol;
          ledStrip.material = ledMat;
          ledStrip.parent = rackRoot;

          // 5 Album slots per shelf
          const slotsPerShelf = 5;
          const slotSpacing = (rackWidth * 0.82) / (slotsPerShelf - 1);
          const startX = -(rackWidth * 0.82) / 2;

          for (let slotIdx = 0; slotIdx < slotsPerShelf; slotIdx++) {
            const localX = startX + slotIdx * slotSpacing;
            const localY = shelfY + 0.28;
            const localZ = rackDepth * 0.18;

            this.albumSlots.push({
              genre: genreCfg.name,
              rackId,
              rackMesh: rackRoot,
              shelfIndex: shelfIdx,
              slotIndex: slotIdx,
              localPosition: new Vector3(localX, localY, localZ),
              localRotation: Vector3.Zero(),
            });
          }
        });

        // Overhead Illuminated Genre Signboard
        const labelText = baysNeeded > 1 ? `${genreCfg.name} [BAY ${b + 1}/${baysNeeded}]` : genreCfg.name;
        this.createGenreHeader(rackRoot, rackWidth, rackHeight, labelText, genreCfg.accentColor || "#00e5ff", genreCfg.icon || "🎵");
      }
    }

    this.playSummonAnimation();
  }

  private createGenreHeader(
    rackRoot: Mesh,
    rackWidth: number,
    rackHeight: number,
    genreName: string,
    accentHex: string,
    icon: string
  ): void {
    const frame = MeshBuilder.CreateBox(`${rackRoot.name}_headerFrame`, { width: rackWidth * 0.9, height: 0.38, depth: 0.08 }, this.scene);
    frame.position.set(0, rackHeight + 0.24, 0);
    frame.parent = rackRoot;

    const frameMat = new StandardMaterial(`${rackRoot.name}_frameMat`, this.scene);
    frameMat.diffuseColor = new Color3(0.08, 0.1, 0.14);
    frameMat.specularColor = new Color3(0.4, 0.4, 0.4);
    frame.material = frameMat;

    const signPlane = MeshBuilder.CreatePlane(`${rackRoot.name}_headerSign`, { width: rackWidth * 0.9 * 0.96, height: 0.38 * 0.92 }, this.scene);
    signPlane.position.set(0, 0, 0.08 / 2 + 0.005);
    signPlane.rotation.y = Math.PI; // Face +Z so label renders upright and unmirrored to viewers in the aisle
    signPlane.parent = frame;

    const tex = new DynamicTexture(`${rackRoot.name}_headerTex`, { width: 512, height: 128 }, this.scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = "#0c1017";
    ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 496, 112);

    ctx.fillStyle = accentHex;
    ctx.fillRect(8, 8, 20, 20);
    ctx.fillRect(484, 8, 20, 20);
    ctx.fillRect(8, 100, 20, 20);
    ctx.fillRect(484, 100, 20, 20);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${icon}  ${genreName.toUpperCase()}`, 256, 64);
    tex.update();

    const mat = new StandardMaterial(`${rackRoot.name}_headerMat`, this.scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(0.9, 0.95, 1.0);
    mat.backFaceCulling = false;
    signPlane.material = mat;
  }

  /**
   * Builds the permanent physical structure for the dedicated Album Track Presentation Rack.
   */
  private buildTrackRackStructure(): void {
    const rackWidth = 4.8;
    const rackDepth = 0.65;
    const rackHeight = 2.8;

    const rackMat = new StandardMaterial("trackRackMat", this.scene);
    rackMat.diffuseColor = new Color3(0.1, 0.14, 0.22);
    rackMat.specularColor = new Color3(0.7, 0.7, 0.7);

    const shelfMat = new StandardMaterial("trackRackShelfMat", this.scene);
    shelfMat.diffuseColor = new Color3(0.88, 0.92, 0.98);
    shelfMat.emissiveColor = new Color3(0.2, 0.25, 0.35);

    // Left and right posts
    const postL = MeshBuilder.CreateBox("trackRack_postL", { width: 0.08, height: rackHeight, depth: rackDepth }, this.scene);
    postL.position.set(-rackWidth / 2, rackHeight / 2, 0);
    postL.material = rackMat;
    postL.parent = this.trackRackRoot;

    const postR = MeshBuilder.CreateBox("trackRack_postR", { width: 0.08, height: rackHeight, depth: rackDepth }, this.scene);
    postR.position.set(rackWidth / 2, rackHeight / 2, 0);
    postR.material = rackMat;
    postR.parent = this.trackRackRoot;

    // Backplate (parented to trackRackRoot for unified movement)
    const backPlate = MeshBuilder.CreateBox("trackRack_backplate", { width: rackWidth, height: rackHeight, depth: 0.05 }, this.scene);
    backPlate.position.set(0, rackHeight / 2, -rackDepth / 2 + 0.025);
    backPlate.material = rackMat;
    backPlate.parent = this.trackRackRoot;
    backPlate.checkCollisions = true;

    // 3 Shelves
    const shelfLevels = [0.75, 1.45, 2.15];
    shelfLevels.forEach((shelfY, shelfIdx) => {
      const shelfMesh = MeshBuilder.CreateBox(`trackRack_shelf_${shelfIdx}`, { width: rackWidth, height: 0.06, depth: rackDepth * 0.9 }, this.scene);
      shelfMesh.position.set(0, shelfY, 0);
      shelfMesh.material = shelfMat;
      shelfMesh.parent = this.trackRackRoot;
      shelfMesh.checkCollisions = true;

      // Glowing LED neon under-strip
      const led = MeshBuilder.CreateBox(`trackRack_led_${shelfIdx}`, { width: rackWidth * 0.96, height: 0.015, depth: 0.04 }, this.scene);
      led.position.set(0, shelfY - 0.035, rackDepth * 0.42);
      const ledMat = new StandardMaterial(`trackRack_ledMat_${shelfIdx}`, this.scene);
      ledMat.diffuseColor = new Color3(0, 0.9, 1);
      ledMat.emissiveColor = new Color3(0, 0.8, 1);
      led.material = ledMat;
      led.parent = this.trackRackRoot;
    });

    // Overhead dynamic signboard
    const headerFrame = MeshBuilder.CreateBox("trackRack_header", { width: rackWidth * 0.9, height: 0.42, depth: 0.08 }, this.scene);
    headerFrame.position.set(0, rackHeight + 0.26, 0);
    headerFrame.material = rackMat;
    headerFrame.parent = this.trackRackRoot;
    this.trackRackHeaderMesh = headerFrame;

    const signPlane = MeshBuilder.CreatePlane("trackRack_headerSign", { width: rackWidth * 0.9 * 0.96, height: 0.42 * 0.92 }, this.scene);
    signPlane.position.set(0, 0, 0.08 / 2 + 0.005);
    signPlane.rotation.y = Math.PI; // Face +Z so album title renders upright and unmirrored
    signPlane.parent = headerFrame;
    this.trackRackSignPlane = signPlane;

    this.trackRackHeaderTex = new DynamicTexture("trackRackHeaderTex", { width: 512, height: 128 }, this.scene, false);
    const headerMat = new StandardMaterial("trackRackHeaderMat", this.scene);
    headerMat.diffuseTexture = this.trackRackHeaderTex;
    headerMat.emissiveTexture = this.trackRackHeaderTex;
    headerMat.emissiveColor = new Color3(1, 1, 1);
    headerMat.backFaceCulling = false;
    signPlane.material = headerMat;
  }

  /**
   * Smoothly animates a mesh's position between two Vector3 points over durationMs.
   * Completely deterministic, immune to animation conflicts, and guaranteed to resolve.
   */
  private animateVector3Async(
    targetMesh: Mesh,
    from: Vector3,
    to: Vector3,
    durationMs: number,
    easing: (t: number) => number
  ): Promise<void> {
    // Clear any active babylon animations on targetMesh to avoid property conflicts
    this.scene.stopAnimation(targetMesh);
    targetMesh.animations = [];

    return new Promise((resolve) => {
      const startTime = performance.now();
      const startPos = from.clone();
      const endPos = to.clone();

      const observer = this.scene.onBeforeRenderObservable.add(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1.0, elapsed / Math.max(1, durationMs));
        const t = easing(progress);

        targetMesh.position.x = startPos.x + (endPos.x - startPos.x) * t;
        targetMesh.position.y = startPos.y + (endPos.y - startPos.y) * t;
        targetMesh.position.z = startPos.z + (endPos.z - startPos.z) * t;

        if (progress >= 1.0) {
          targetMesh.position.copyFrom(endPos);
          this.scene.onBeforeRenderObservable.remove(observer);
          resolve();
        }
      });
    });
  }

  /**
   * Finds a genre rack mesh matching the provided genre name.
   */
  public getRackForGenre(genreName: string): Mesh | undefined {
    const norm = genreName.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return this.rackMeshes.find((m) => m.name.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(norm));
  }

  /**
   * Smoothly slides the clicked genre rack backwards into the construct recess.
   * Resolves only when the animation completes so the track rack doesn't appear prematurely.
   */
  public async slideGenreRackBackAsync(sourceRackMesh?: Mesh): Promise<{ rackOrigin: Vector3; rackRotY: number }> {
    // 1. If another rack was previously displaced, restore it first
    if (this.displacedGenreRack && this.displacedGenreRack !== sourceRackMesh) {
      await this.restoreDisplacedRackAsync();
    }

    const rackOrigin = new Vector3(4.6, 0, 0);
    let rackRotY = -Math.PI / 2;

    if (!sourceRackMesh) {
      if (this.rackMeshes.length > 0) {
        sourceRackMesh = this.rackMeshes[0];
      } else {
        return { rackOrigin, rackRotY };
      }
    }

    this.displacedGenreRack = sourceRackMesh;
    const originalPos = this.originalRackPositions.get(sourceRackMesh) || sourceRackMesh.position.clone();
    if (!this.originalRackPositions.has(sourceRackMesh)) {
      this.originalRackPositions.set(sourceRackMesh, originalPos.clone());
    }
    rackOrigin.copyFrom(originalPos);
    rackRotY = sourceRackMesh.rotation.y;

    // Calculate backward offset (3.2m back along the rack's facing normal into the recess)
    const slideBackDistance = 3.2;
    const backwardOffset = new Vector3(
      -Math.sin(rackRotY) * slideBackDistance,
      0,
      -Math.cos(rackRotY) * slideBackDistance
    );
    const targetPushedPos = originalPos.add(backwardOffset);

    // If already slid back, resolve immediately
    if (Vector3.Distance(sourceRackMesh.position, targetPushedPos) < 0.05) {
      sourceRackMesh.position.copyFrom(targetPushedPos);
      return { rackOrigin, rackRotY };
    }

    SoundEffects.playWhoosh(0.85);

    // Smooth cubic ease-in-out over 450ms
    await this.animateVector3Async(
      sourceRackMesh,
      sourceRackMesh.position,
      targetPushedPos,
      450,
      (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    );

    SoundEffects.playImpact(0.55, true);
    return { rackOrigin, rackRotY };
  }

  /**
   * Configures the dedicated Track Presentation Rack beneath the floor in the vacated spot.
   */
  public prepareTrackRack(album: MusicAlbum, rackOrigin: Vector3, rackRotY: number): TrackSlot[] {
    this.trackRackRoot.parent = this.aislesContainer;
    this.trackRackRoot.rotation.y = rackRotY;
    // Submerged beneath the floor at the exact original position of the genre rack
    this.trackRackRoot.position.set(rackOrigin.x, -3.4, rackOrigin.z);
    this.trackRackRoot.setEnabled(true);
    this.isTrackRackSummoned = true;

    // Update dynamic signboard with album info + return prompt
    if (this.trackRackHeaderTex) {
      const ctx = this.trackRackHeaderTex.getContext() as unknown as CanvasRenderingContext2D;
      ctx.fillStyle = "#070b14";
      ctx.fillRect(0, 0, 512, 128);

      const dominantCol = album.dominantColorHex || "#00e5ff";
      ctx.strokeStyle = dominantCol;
      ctx.lineWidth = 5;
      ctx.strokeRect(6, 6, 500, 116);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 23px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const shortTitle = album.title.length > 26 ? album.title.substring(0, 24) + "…" : album.title;
      ctx.fillText(`💿  ${shortTitle.toUpperCase()}`, 256, 42);

      ctx.fillStyle = dominantCol;
      ctx.font = "bold 16px monospace";
      const shortArtist = album.artist.length > 28 ? album.artist.substring(0, 26) + "…" : album.artist;
      ctx.fillText(`${shortArtist.toUpperCase()} // TRACK CARTRIDGES`, 256, 76);

      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.font = "12px monospace";
      ctx.fillText(`[ CLICK HEADER OR 'RETURN' TO RESTORE ALBUM RACK ]`, 256, 104);

      this.trackRackHeaderTex.update();
    }

    // Generate slots for tracks across the 3 shelves (15 slots total: 3 shelves x 5 slots)
    const trackSlots: TrackSlot[] = [];
    const rackWidth = 4.8;
    const shelfLevels = [0.75, 1.45, 2.15];
    const slotsPerShelf = 5;
    const slotSpacing = (rackWidth * 0.82) / (slotsPerShelf - 1);
    const startSlotX = -(rackWidth * 0.82) / 2;

    shelfLevels.forEach((shelfY, shelfIdx) => {
      for (let slotIdx = 0; slotIdx < slotsPerShelf; slotIdx++) {
        const localX = startSlotX + slotIdx * slotSpacing;
        const localY = shelfY + 0.24;
        const localZ = 0.05;

        trackSlots.push({
          rackMesh: this.trackRackRoot,
          shelfIndex: shelfIdx,
          slotIndex: slotIdx,
          localPosition: new Vector3(localX, localY, localZ),
          localRotation: Vector3.Zero(),
        });
      }
    });

    return trackSlots;
  }

  /**
   * Rises the track presentation rack UP through the floor in the vacated spot.
   */
  public async riseTrackRackAsync(): Promise<void> {
    SoundEffects.playWhoosh(0.95);

    const startPos = this.trackRackRoot.position.clone();
    const endPos = new Vector3(startPos.x, 0.0, startPos.z);

    // Cubic ease-out over 500ms
    await this.animateVector3Async(
      this.trackRackRoot,
      startPos,
      endPos,
      500,
      (t) => 1 - Math.pow(1 - t, 3)
    );

    this.trackRackRoot.position.copyFrom(endPos);
    SoundEffects.playImpact(0.85, true);
  }

  /**
   * Sinks the Track Rack back down into the floor.
   */
  public async hideTrackRackAsync(): Promise<void> {
    if (!this.isTrackRackSummoned) return;

    SoundEffects.playWhoosh(0.8);

    const startPos = this.trackRackRoot.position.clone();
    const endPos = new Vector3(startPos.x, -3.5, startPos.z);

    // Cubic ease-in over 380ms
    await this.animateVector3Async(
      this.trackRackRoot,
      startPos,
      endPos,
      380,
      (t) => t * t * t
    );

    this.trackRackRoot.position.copyFrom(endPos);
    this.trackRackRoot.setEnabled(false);
    this.isTrackRackSummoned = false;
  }

  /**
   * Smoothly slides any displaced genre rack forward back to its original position.
   */
  public async restoreDisplacedRackAsync(): Promise<void> {
    if (!this.displacedGenreRack) return;

    const rackToRestore = this.displacedGenreRack;
    this.displacedGenreRack = null;
    const originalPos = this.originalRackPositions.get(rackToRestore);

    if (!originalPos) return;

    if (Vector3.Distance(rackToRestore.position, originalPos) < 0.05) {
      rackToRestore.position.copyFrom(originalPos);
      return;
    }

    SoundEffects.playWhoosh(0.8);

    // Cubic ease-out over 400ms
    await this.animateVector3Async(
      rackToRestore,
      rackToRestore.position,
      originalPos,
      400,
      (t) => 1 - Math.pow(1 - t, 3)
    );

    rackToRestore.position.copyFrom(originalPos);
    SoundEffects.playImpact(0.55, true);
  }

  public restoreDisplacedRack(): void {
    this.restoreDisplacedRackAsync();
  }

  public hideTrackRack(onComplete?: () => void): void {
    this.hideTrackRackAsync().then(() => this.restoreDisplacedRackAsync()).then(() => {
      if (onComplete) onComplete();
    });
  }

  public async summonTrackRack(album: MusicAlbum, sourceRackMesh?: Mesh): Promise<TrackSlot[]> {
    const slideResult = await this.slideGenreRackBackAsync(sourceRackMesh);
    const slots = this.prepareTrackRack(album, slideResult.rackOrigin, slideResult.rackRotY);
    await this.riseTrackRackAsync();
    return slots;
  }

  public slideAisles(deltaX: number, deltaZ: number): void {
    this.targetAislesPos.x = Math.max(-25, Math.min(25, this.targetAislesPos.x + deltaX));
    this.targetAislesPos.z = Math.max(-100, Math.min(100, this.targetAislesPos.z + deltaZ));
  }

  public slideToGenre(genreName: string): boolean {
    const pos = this.genrePrimaryPositions.get(genreName);
    if (!pos) return false;

    const targetZ = -pos.z;
    const targetX = pos.x < 0 ? 1.6 : -1.6;

    this.targetAislesPos.set(targetX, 0, targetZ);
    return true;
  }

  public resetAislesPosition(): void {
    this.targetAislesPos.set(0, 0, 0);
  }

  public getAislesPosition(): Vector3 {
    return this.aislesContainer.position.clone();
  }

  public getActiveGenres(): string[] {
    return [...this.activeGenres];
  }

  public playSummonAnimation(): void {
    SoundEffects.playThrow();

    this.rackMeshes.forEach((rack, idx) => {
      const finalX = rack.position.x;
      const startX = finalX > 0 ? finalX + 22 : finalX - 22;

      const anim = new Animation(
        `rackSummon_${idx}`,
        "position.x",
        60,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CONSTANT
      );

      const delayFrames = (idx % 6) * 5;
      anim.setKeys([
        { frame: 0, value: startX },
        { frame: delayFrames, value: startX },
        { frame: delayFrames + 36, value: finalX },
      ]);

      rack.animations = [anim];
      this.scene.beginAnimation(rack, 0, delayFrames + 36, false, 1.0, () => {
        SoundEffects.playImpact(0.7, true);
        rack.animations = [];
      });
    });
  }
}
