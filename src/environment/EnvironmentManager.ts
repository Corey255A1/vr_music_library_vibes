import {
  Scene,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator,
  Mesh,
  DynamicTexture,
} from "@babylonjs/core";
import { PhysicsManager } from "../physics/PhysicsManager";

export class EnvironmentManager {
  private scene: Scene;
  private physicsManager: PhysicsManager;
  public groundMesh!: Mesh;
  public shadowGenerator!: ShadowGenerator;
  public dirLight!: DirectionalLight;

  constructor(scene: Scene, physicsManager: PhysicsManager) {
    this.scene = scene;
    this.physicsManager = physicsManager;
  }

  public setup(): void {
    this.setupAtmosphere();
    this.setupLighting();
    this.createGround();
    this.createStructures();
  }

  private setupAtmosphere(): void {
    this.scene.clearColor = new Color4(0.06, 0.09, 0.14, 1.0);
    this.scene.ambientColor = new Color3(0.2, 0.25, 0.35);

    // Subtle atmospheric distance fog
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.004;
    this.scene.fogColor = new Color3(0.08, 0.11, 0.17);

    // Create a sky dome
    const sky = MeshBuilder.CreateSphere("skyDome", { diameter: 300, segments: 16, sideOrientation: Mesh.BACKSIDE }, this.scene);
    const skyMat = new StandardMaterial("skyMat", this.scene);
    skyMat.backFaceCulling = false;
    skyMat.diffuseColor = new Color3(0.05, 0.07, 0.12);
    skyMat.specularColor = Color3.Black();
    skyMat.emissiveColor = new Color3(0.04, 0.06, 0.1);
    sky.material = skyMat;
  }

  private setupLighting(): void {
    // Ambient soft fill light
    const hemiLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), this.scene);
    hemiLight.intensity = 0.55;
    hemiLight.groundColor = new Color3(0.12, 0.14, 0.18);
    hemiLight.diffuse = new Color3(0.85, 0.9, 1.0);

    // Main directional sun light casting soft shadows
    this.dirLight = new DirectionalLight("dirLight", new Vector3(-0.6, -1.2, -0.7).normalize(), this.scene);
    this.dirLight.position = new Vector3(25, 45, 25);
    this.dirLight.intensity = 1.3;
    this.dirLight.diffuse = new Color3(1.0, 0.96, 0.9);

    this.shadowGenerator = new ShadowGenerator(2048, this.dirLight);
    this.shadowGenerator.useBlurExponentialShadowMap = true;
    this.shadowGenerator.blurKernel = 32;
    this.shadowGenerator.bias = 0.001;
  }

  private createGround(): void {
    const size = 90;
    this.groundMesh = MeshBuilder.CreateGround("ground", { width: size, height: size }, this.scene);
    this.groundMesh.receiveShadows = true;
    this.groundMesh.checkCollisions = true;

    // Procedural high-contrast grid texture
    const groundTex = new DynamicTexture("groundTex", { width: 1024, height: 1024 }, this.scene, false);
    const ctx = groundTex.getContext();
    ctx.fillStyle = "#161b22";
    ctx.fillRect(0, 0, 1024, 1024);

    // Grid lines
    ctx.strokeStyle = "rgba(56, 139, 253, 0.35)";
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

    // Subdivisions
    ctx.strokeStyle = "rgba(240, 246, 252, 0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1024; x += step / 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1024);
      ctx.stroke();
    }
    for (let y = 0; y <= 1024; y += step / 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }
    groundTex.update();
    groundTex.uScale = 12;
    groundTex.vScale = 12;

    const groundMat = new StandardMaterial("groundMat", this.scene);
    groundMat.diffuseTexture = groundTex;
    groundMat.specularColor = new Color3(0.1, 0.12, 0.15);
    this.groundMesh.material = groundMat;

    // Ground physics body (thick box to prevent any pass-through)
    const groundCollisionMesh = MeshBuilder.CreateBox("groundCollider", { width: size, height: 2, depth: size }, this.scene);
    groundCollisionMesh.position.y = -1;
    groundCollisionMesh.isVisible = false;
    this.physicsManager.addStaticMesh(groundCollisionMesh, "box");

    // Perimeter boundary walls so objects and players don't fall off
    this.createBoundaryWalls(size);
  }

  private createBoundaryWalls(size: number): void {
    const wallHeight = 4;
    const wallThickness = 1.5;
    const half = size / 2;

    const wallMat = new StandardMaterial("wallMat", this.scene);
    wallMat.diffuseColor = new Color3(0.1, 0.14, 0.2);
    wallMat.alpha = 0.5;

    const wallConfigs = [
      { name: "northWall", pos: new Vector3(0, wallHeight / 2, half), size: { width: size, height: wallHeight, depth: wallThickness } },
      { name: "southWall", pos: new Vector3(0, wallHeight / 2, -half), size: { width: size, height: wallHeight, depth: wallThickness } },
      { name: "eastWall", pos: new Vector3(half, wallHeight / 2, 0), size: { width: wallThickness, height: wallHeight, depth: size } },
      { name: "westWall", pos: new Vector3(-half, wallHeight / 2, 0), size: { width: wallThickness, height: wallHeight, depth: size } },
    ];

    wallConfigs.forEach((c) => {
      const wall = MeshBuilder.CreateBox(c.name, c.size, this.scene);
      wall.position.copyFrom(c.pos);
      wall.material = wallMat;
      wall.receiveShadows = true;
      this.physicsManager.addStaticMesh(wall, "box");
    });
  }

  private createStructures(): void {
    const structureMat = new StandardMaterial("structureMat", this.scene);
    structureMat.diffuseColor = new Color3(0.18, 0.23, 0.3);
    structureMat.specularColor = new Color3(0.3, 0.35, 0.4);

    const accentMat = new StandardMaterial("accentMat", this.scene);
    accentMat.diffuseColor = new Color3(0.9, 0.45, 0.15);
    accentMat.specularColor = new Color3(0.5, 0.5, 0.5);

    // 1. Central Observation & Physics Staging Table
    const tableTop = MeshBuilder.CreateBox("tableTop", { width: 8, height: 0.4, depth: 5 }, this.scene);
    tableTop.position.set(0, 1.2, 3);
    tableTop.material = structureMat;
    tableTop.receiveShadows = true;
    this.shadowGenerator.addShadowCaster(tableTop);
    this.physicsManager.addStaticMesh(tableTop, "box");

    // Table legs
    const legPositions = [
      new Vector3(-3.6, 0.6, 1.2),
      new Vector3(3.6, 0.6, 1.2),
      new Vector3(-3.6, 0.6, 4.8),
      new Vector3(3.6, 0.6, 4.8),
    ];
    legPositions.forEach((pos, idx) => {
      const leg = MeshBuilder.CreateCylinder(`tableLeg_${idx}`, { height: 1.2, diameter: 0.3 }, this.scene);
      leg.position.copyFrom(pos);
      leg.material = structureMat;
      leg.receiveShadows = true;
      this.shadowGenerator.addShadowCaster(leg);
      this.physicsManager.addStaticMesh(leg, "cylinder");
    });

    // 2. Rolling Ramp Platform
    // Slanted ramp leading from ground to elevated platform
    const ramp = MeshBuilder.CreateBox("physicsRamp", { width: 5, height: 0.3, depth: 10 }, this.scene);
    ramp.position.set(-12, 1.8, 0);
    ramp.rotation.x = Math.PI / 8; // Sloped angle
    ramp.material = structureMat;
    ramp.receiveShadows = true;
    this.shadowGenerator.addShadowCaster(ramp);
    this.physicsManager.addStaticMesh(ramp, "box");

    // Ramp top platform
    const rampPlatform = MeshBuilder.CreateBox("rampPlatform", { width: 5, height: 0.4, depth: 5 }, this.scene);
    rampPlatform.position.set(-12, 3.6, 6.8);
    rampPlatform.material = structureMat;
    rampPlatform.receiveShadows = true;
    this.shadowGenerator.addShadowCaster(rampPlatform);
    this.physicsManager.addStaticMesh(rampPlatform, "box");

    // Ramp support pillars
    const rampPillar = MeshBuilder.CreateBox("rampPillar", { width: 4.6, height: 3.4, depth: 4.6 }, this.scene);
    rampPillar.position.set(-12, 1.7, 6.8);
    rampPillar.material = structureMat;
    this.physicsManager.addStaticMesh(rampPillar, "box");

    // 3. Stairs leading up to an elevated deck
    const stairSteps = 7;
    const stepHeight = 0.35;
    const stepDepth = 0.8;
    const stepWidth = 4;
    for (let i = 0; i < stairSteps; i++) {
      const step = MeshBuilder.CreateBox(`stair_${i}`, { width: stepWidth, height: (i + 1) * stepHeight, depth: stepDepth }, this.scene);
      step.position.set(14, ((i + 1) * stepHeight) / 2, -6 + i * stepDepth);
      step.material = structureMat;
      step.receiveShadows = true;
      this.shadowGenerator.addShadowCaster(step);
      this.physicsManager.addStaticMesh(step, "box");
    }

    // Elevated deck platform at the top of stairs
    const deck = MeshBuilder.CreateBox("deckPlatform", { width: 8, height: 0.4, depth: 8 }, this.scene);
    deck.position.set(14, stairSteps * stepHeight, -6 + stairSteps * stepDepth + 3.6);
    deck.material = accentMat;
    deck.receiveShadows = true;
    this.shadowGenerator.addShadowCaster(deck);
    this.physicsManager.addStaticMesh(deck, "box");

    // Support under deck
    const deckPillar = MeshBuilder.CreateBox("deckPillar", { width: 7.6, height: stairSteps * stepHeight, depth: 7.6 }, this.scene);
    deckPillar.position.set(14, (stairSteps * stepHeight) / 2, -6 + stairSteps * stepDepth + 3.6);
    deckPillar.material = structureMat;
    this.physicsManager.addStaticMesh(deckPillar, "box");

    // 4. Target Ring / Goal Area
    const targetBase = MeshBuilder.CreateCylinder("targetBase", { height: 0.15, diameter: 4 }, this.scene);
    targetBase.position.set(0, 0.08, 16);
    const targetMat = new StandardMaterial("targetMat", this.scene);
    targetMat.diffuseColor = new Color3(0.2, 0.7, 0.3);
    targetMat.specularColor = new Color3(0.2, 0.5, 0.2);
    targetBase.material = targetMat;
    targetBase.receiveShadows = true;
    this.physicsManager.addStaticMesh(targetBase, "cylinder");
  }
}
