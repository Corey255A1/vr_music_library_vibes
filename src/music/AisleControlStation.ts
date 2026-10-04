import {
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  DynamicTexture,
  PointerEventTypes,
} from "@babylonjs/core";
import { MatrixRoomManager } from "./MatrixRoomManager";
import { SoundEffects } from "../audio/SoundEffects";

export class AisleControlStation {
  private scene: Scene;
  private matrixRoom: MatrixRoomManager;

  public stationRoot: Mesh;
  private consoleDeck: Mesh;
  private screenTex: DynamicTexture;

  private genreButtonMeshes: Mesh[] = [];
  private currentSummonedGenre: string = "CENTRAL AISLE";

  constructor(scene: Scene, matrixRoom: MatrixRoomManager) {
    this.scene = scene;
    this.matrixRoom = matrixRoom;

    this.stationRoot = new Mesh("aisleControlStationRoot", this.scene);
    // Positioned directly in front of the player's starting vantage point
    this.stationRoot.position.set(0, 0, -0.6);

    // 1. Build Physical Station Pedestal
    this.createPedestal();
    this.consoleDeck = this.createConsoleDeck();
    const { screenTex } = this.createStatusScreen();
    this.screenTex = screenTex;

    // 2. Build 3D Directional D-Pad
    this.createDirectionalControls();

    // 3. Register Pointer Click Interaction (Desktop mouse raycast & VR raycast)
    this.setupPointerInteractions();

    // 4. Setup Keyboard Controls for Desktop (Arrow Keys)
    this.setupKeyboardControls();

    // 5. Hook into render loop to update screen telemetry
    this.scene.onBeforeRenderObservable.add(() => {
      this.updateScreenTelemetry();
    });
  }

  private createPedestal(): Mesh {
    // Octagonal futuristic column
    const col = MeshBuilder.CreateCylinder(
      "stationPedestal",
      { diameter: 0.72, height: 1.0, tessellation: 8 },
      this.scene
    );
    col.position.set(0, 0.5, 0);
    col.parent = this.stationRoot;
    col.checkCollisions = true;

    const colMat = new StandardMaterial("pedestalMat", this.scene);
    colMat.diffuseColor = new Color3(0.1, 0.13, 0.18);
    colMat.specularColor = new Color3(0.6, 0.6, 0.6);
    col.material = colMat;

    // Glowing base trim ring
    const ring = MeshBuilder.CreateTorus(
      "stationBaseRing",
      { diameter: 0.85, thickness: 0.03, tessellation: 32 },
      this.scene
    );
    ring.position.set(0, 0.02, 0);
    ring.parent = this.stationRoot;

    const ringMat = new StandardMaterial("baseRingMat", this.scene);
    ringMat.diffuseColor = new Color3(0, 0.8, 1);
    ringMat.emissiveColor = new Color3(0, 0.7, 1);
    ring.material = ringMat;

    // Vertical neon conduit channels along corners
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const conduit = MeshBuilder.CreateBox(
        `stationConduit_${i}`,
        { width: 0.03, height: 0.96, depth: 0.03 },
        this.scene
      );
      conduit.position.set(Math.cos(angle) * 0.34, 0.5, Math.sin(angle) * 0.34);
      conduit.material = ringMat;
      conduit.parent = this.stationRoot;
    }

    return col;
  }

  private createConsoleDeck(): Mesh {
    // Angled console surface tilted towards player at -Z
    const deck = MeshBuilder.CreateBox(
      "consoleDeck",
      { width: 0.95, height: 0.12, depth: 0.72 },
      this.scene
    );
    deck.position.set(0, 1.08, -0.04);
    deck.rotation.x = -Math.PI * 0.18; // 32 degree tilt facing player
    deck.parent = this.stationRoot;

    const deckMat = new StandardMaterial("deckMat", this.scene);
    deckMat.diffuseColor = new Color3(0.08, 0.1, 0.14);
    deckMat.specularColor = new Color3(0.7, 0.7, 0.7);
    deck.material = deckMat;

    // Glowing outer rim
    const rim = MeshBuilder.CreateBox(
      "consoleDeckRim",
      { width: 0.97, height: 0.015, depth: 0.74 },
      this.scene
    );
    rim.position.set(0, 0.065, 0);
    rim.parent = deck;

    const rimMat = new StandardMaterial("deckRimMat", this.scene);
    rimMat.diffuseColor = new Color3(0, 0.8, 1);
    rimMat.emissiveColor = new Color3(0, 0.6, 0.9);
    rim.material = rimMat;

    return deck;
  }

  private createStatusScreen(): { screenMesh: Mesh; screenTex: DynamicTexture; screenMat: StandardMaterial } {
    const screenMesh = MeshBuilder.CreatePlane(
      "consoleScreen",
      { width: 0.88, height: 0.28 },
      this.scene
    );
    screenMesh.position.set(0, 0.065, 0.18);
    screenMesh.rotation.x = -Math.PI / 2; // Flat on tilted deck
    screenMesh.parent = this.consoleDeck;

    const screenTex = new DynamicTexture(
      "consoleScreenTex",
      { width: 512, height: 160 },
      this.scene,
      false
    );
    const screenMat = new StandardMaterial("consoleScreenMat", this.scene);
    screenMat.diffuseTexture = screenTex;
    screenMat.emissiveTexture = screenTex;
    screenMat.emissiveColor = new Color3(0.9, 0.95, 1.0);
    screenMesh.material = screenMat;

    return { screenMesh, screenTex, screenMat };
  }

  private lastRenderedPosStr = "";
  private lastRenderedGenre = "";

  private updateScreenTelemetry(): void {
    const pos = this.matrixRoom.getAislesPosition();
    const posStr = `X: ${pos.x >= 0 ? "+" : ""}${pos.x.toFixed(1)}m | Z: ${pos.z >= 0 ? "+" : ""}${pos.z.toFixed(1)}m`;

    if (posStr === this.lastRenderedPosStr && this.currentSummonedGenre === this.lastRenderedGenre) {
      return;
    }
    this.lastRenderedPosStr = posStr;
    this.lastRenderedGenre = this.currentSummonedGenre;

    const ctx = this.screenTex.getContext() as unknown as CanvasRenderingContext2D;
    // Dark sci-fi cockpit background
    ctx.fillStyle = "#050811";
    ctx.fillRect(0, 0, 512, 160);

    // Cyan frame border
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 500, 148);

    // Title
    ctx.fillStyle = "#00e5ff";
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "left";
    ctx.fillText("MATRIX AISLE CONTROL SYSTEM // V7.2", 18, 30);

    // Coordinate telemetry
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px 'Segoe UI', monospace";
    ctx.fillText(`AISLE OFFSET: [ ${posStr} ]`, 18, 68);

    // Current Genre Focus
    ctx.fillStyle = "#8b949e";
    ctx.font = "14px monospace";
    ctx.fillText("SUMMONED SECTOR:", 18, 104);

    ctx.fillStyle = "#ff007f";
    ctx.font = "bold 22px 'Segoe UI', sans-serif";
    ctx.fillText(this.currentSummonedGenre.toUpperCase(), 175, 105);

    // Subtext instruction
    ctx.fillStyle = "#00ff88";
    ctx.font = "12px monospace";
    ctx.fillText("USE D-PAD / ARROW KEYS TO GLIDE AISLES TO YOUR ARM", 18, 138);

    this.screenTex.update();
  }

  private createDirectionalControls(): void {
    // Layout 3D tactile buttons on the lower deck:
    //      [ ⬆️ FWD ]
    // [ ⬅️ L ] [ 🔄 ] [ ➡️ R ]
    //      [ ⬇️ BACK ]
    const btnMatNormal = new StandardMaterial("ctrlBtnMatNormal", this.scene);
    btnMatNormal.diffuseColor = new Color3(0.08, 0.14, 0.22);
    btnMatNormal.specularColor = new Color3(0.7, 0.7, 0.7);

    const btnMatActive = new StandardMaterial("ctrlBtnMatActive", this.scene);
    btnMatActive.diffuseColor = new Color3(0, 0.8, 1);
    btnMatActive.emissiveColor = new Color3(0, 0.6, 0.9);

    const buttons = [
      {
        id: "btn_forward",
        label: "▲ FWD",
        localPos: new Vector3(0, 0.07, -0.06),
        action: () => {
          this.matrixRoom.slideAisles(0, -3.0);
          this.currentSummonedGenre = "MANUAL SLIDE";
        },
      },
      {
        id: "btn_back",
        label: "▼ BACK",
        localPos: new Vector3(0, 0.07, -0.26),
        action: () => {
          this.matrixRoom.slideAisles(0, 3.0);
          this.currentSummonedGenre = "MANUAL SLIDE";
        },
      },
      {
        id: "btn_left",
        label: "◄ LEFT",
        localPos: new Vector3(-0.16, 0.07, -0.16),
        action: () => {
          this.matrixRoom.slideAisles(-2.0, 0);
          this.currentSummonedGenre = "MANUAL SLIDE";
        },
      },
      {
        id: "btn_right",
        label: "RIGHT ►",
        localPos: new Vector3(0.16, 0.07, -0.16),
        action: () => {
          this.matrixRoom.slideAisles(2.0, 0);
          this.currentSummonedGenre = "MANUAL SLIDE";
        },
      },
      {
        id: "btn_reset",
        label: "RESET",
        localPos: new Vector3(0, 0.07, -0.16),
        action: () => {
          this.matrixRoom.resetAislesPosition();
          this.currentSummonedGenre = "ORIGIN";
        },
      },
    ];

    for (const b of buttons) {
      const isReset = b.id === "btn_reset";
      const btnMesh = MeshBuilder.CreateBox(
        b.id,
        { width: isReset ? 0.09 : 0.12, height: 0.03, depth: isReset ? 0.07 : 0.08 },
        this.scene
      );
      btnMesh.position.copyFrom(b.localPos);
      btnMesh.parent = this.consoleDeck;

      const mat = new StandardMaterial(`${b.id}_mat`, this.scene);
      mat.diffuseColor = isReset ? new Color3(0.2, 0.1, 0.1) : new Color3(0.1, 0.18, 0.26);
      mat.emissiveColor = isReset ? new Color3(0.4, 0.1, 0.1) : new Color3(0, 0.35, 0.55);
      btnMesh.material = mat;

      // Click action metadata
      btnMesh.metadata = {
        isInteractable: true,
        onControlStationAction: () => {
          this.pressButtonAnimation(btnMesh, b.action);
        },
      };

      // Label on top of button
      const labelPlane = MeshBuilder.CreatePlane(`${b.id}_label`, { width: 0.11, height: 0.06 }, this.scene);
      labelPlane.position.set(0, 0.016, 0);
      labelPlane.rotation.x = -Math.PI / 2;
      labelPlane.parent = btnMesh;

      const labelTex = new DynamicTexture(`${b.id}_tex`, { width: 128, height: 64 }, this.scene, false);
      const ctx = labelTex.getContext() as unknown as CanvasRenderingContext2D;
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px 'Segoe UI', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, 64, 32);
      labelTex.update();

      const labelMat = new StandardMaterial(`${b.id}_labelMat`, this.scene);
      labelMat.diffuseTexture = labelTex;
      labelMat.emissiveTexture = labelTex;
      labelMat.emissiveColor = new Color3(1, 1, 1);
      labelPlane.material = labelMat;
    }
  }

  /**
   * Builds 3D holographic genre quick-summon buttons on the outer wing edges of the console.
   */
  public updateGenreButtons(genres: string[]): void {
    // Dispose previous genre buttons
    for (const b of this.genreButtonMeshes) {
      b.dispose(false, true);
    }
    this.genreButtonMeshes = [];

    if (genres.length === 0) return;

    const btnWidth = 0.15;
    const btnHeight = 0.05;
    const maxPerRow = 3;

    genres.slice(0, 6).forEach((genre, idx) => {
      const row = Math.floor(idx / maxPerRow);
      const col = idx % maxPerRow;

      // Position across bottom console deck
      const startX = -0.32;
      const startZ = -0.36;
      const x = startX + col * (btnWidth + 0.03);
      const z = startZ - row * (btnHeight + 0.02);

      const btnMesh = MeshBuilder.CreateBox(
        `genreBtn_${genre}`,
        { width: btnWidth, height: 0.02, depth: btnHeight },
        this.scene
      );
      btnMesh.position.set(x, 0.07, z);
      btnMesh.parent = this.consoleDeck;

      const mat = new StandardMaterial(`genreBtnMat_${genre}`, this.scene);
      mat.diffuseColor = new Color3(0.12, 0.14, 0.2);
      mat.emissiveColor = new Color3(0.1, 0.2, 0.4);
      btnMesh.material = mat;

      btnMesh.metadata = {
        isInteractable: true,
        onControlStationAction: () => {
          this.pressButtonAnimation(btnMesh, () => {
            this.currentSummonedGenre = genre;
            this.matrixRoom.slideToGenre(genre);
          });
        },
      };

      // Genre label
      const labelPlane = MeshBuilder.CreatePlane(`genreBtnLabel_${genre}`, { width: btnWidth * 0.95, height: btnHeight * 0.9 }, this.scene);
      labelPlane.position.set(0, 0.012, 0);
      labelPlane.rotation.x = -Math.PI / 2;
      labelPlane.parent = btnMesh;

      const labelTex = new DynamicTexture(`genreBtnTex_${genre}`, { width: 128, height: 48 }, this.scene, false);
      const ctx = labelTex.getContext() as unknown as CanvasRenderingContext2D;
      ctx.fillStyle = "#0c1017";
      ctx.fillRect(0, 0, 128, 48);
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, 124, 44);

      ctx.fillStyle = "#00e5ff";
      ctx.font = "bold 13px 'Segoe UI', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const shortName = genre.length > 10 ? genre.substring(0, 9) + "…" : genre;
      ctx.fillText(shortName, 64, 24);
      labelTex.update();

      const labelMat = new StandardMaterial(`genreLabelMat_${genre}`, this.scene);
      labelMat.diffuseTexture = labelTex;
      labelMat.emissiveTexture = labelTex;
      labelMat.emissiveColor = new Color3(0.9, 0.95, 1);
      labelPlane.material = labelMat;

      this.genreButtonMeshes.push(btnMesh);
    });
  }

  private pressButtonAnimation(mesh: Mesh, action: () => void): void {
    SoundEffects.playGrab();
    const origY = mesh.position.y;
    mesh.position.y = origY - 0.015; // Press down

    setTimeout(() => {
      mesh.position.y = origY;
      action();
    }, 120);
  }

  private setupPointerInteractions(): void {
    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        const hit = pointerInfo.pickInfo;
        if (hit && hit.hit && hit.pickedMesh) {
          const action =
            hit.pickedMesh.metadata?.onControlStationAction ||
            hit.pickedMesh.parent?.metadata?.onControlStationAction;
          if (action) {
            action();
          }
        }
      }
    });
  }

  private setupKeyboardControls(): void {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      // Ignore when typing in input boxes
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "ArrowUp") {
        e.preventDefault();
        this.matrixRoom.slideAisles(0, -2.5);
        this.currentSummonedGenre = "MANUAL SLIDE";
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        this.matrixRoom.slideAisles(0, 2.5);
        this.currentSummonedGenre = "MANUAL SLIDE";
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        this.matrixRoom.slideAisles(-1.8, 0);
        this.currentSummonedGenre = "MANUAL SLIDE";
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        this.matrixRoom.slideAisles(1.8, 0);
        this.currentSummonedGenre = "MANUAL SLIDE";
      } else if (e.code === "KeyH" || e.code === "Digit0") {
        this.matrixRoom.resetAislesPosition();
        this.currentSummonedGenre = "ORIGIN";
      }
    });
  }

  public setSummonedGenre(genre: string): void {
    this.currentSummonedGenre = genre;
  }
}
