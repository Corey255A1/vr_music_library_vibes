import { Engine, Scene, Vector3 } from "@babylonjs/core";
import { PhysicsManager } from "./physics/PhysicsManager";
import { InteractableRegistry } from "./objects/InteractableRegistry";
import { DesktopController } from "./controls/DesktopController";
import { VRController } from "./controls/VRController";
import { HUD } from "./ui/HUD";
import { EmbyClient } from "./music/EmbyClient";
import { MusicPlayer } from "./music/MusicPlayer";
import { MatrixRoomManager } from "./music/MatrixRoomManager";
import { MusicShelfManager } from "./music/MusicShelfManager";
import { AisleControlStation } from "./music/AisleControlStation";
import { AisleAltarPillar } from "./music/AisleAltarPillar";
import { JumbotronManager } from "./music/JumbotronManager";

async function bootstrap() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error("Render canvas not found!");
  }

  // Initialize Babylon Engine with antialiasing
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    adaptToDeviceRatio: true,
  });

  const scene = new Scene(engine);

  try {
    // 1. Initialize Havok Physics
    console.log("Initializing Havok Physics engine...");
    const physicsManager = await PhysicsManager.initPhysics(scene);

    // 2. Setup Matrix Construct Room (Gun Room aesthetic, infinite white floor, sliding racks)
    console.log("Setting up Matrix Construct Room...");
    const matrixRoom = new MatrixRoomManager(scene, physicsManager);
    matrixRoom.setup();

    // 3. Setup Interactive Props Registry
    console.log("Initializing Interactable Registry...");
    const interactableRegistry = new InteractableRegistry(
      scene,
      physicsManager,
      matrixRoom.shadowGenerator
    );

    // 4. Setup Desktop Keyboard & Mouse FPS Controls
    console.log("Setting up Desktop FPS controls...");
    const desktopController = new DesktopController(
      scene,
      engine,
      interactableRegistry,
      physicsManager
    );
    desktopController.setup(canvas);
    // Position player camera directly in front of the Control Station looking down the aisle
    desktopController.camera.position.set(0, 1.75, -1.8);
    desktopController.camera.setTarget(new Vector3(0, 1.75, 6));

    // 5. Setup WebXR VR Controller (Teleportation, Motion Grabbing, Physics Throwing)
    console.log("Setting up WebXR VR controller subsystem...");
    const vrController = new VRController(scene, interactableRegistry);
    await vrController.setup([matrixRoom.floorMesh]);

    // 6. Setup Music & Matrix Subsystems
    console.log("Initializing Matrix Construct & Music Subsystems...");
    const embyClient = new EmbyClient();
    const musicPlayer = new MusicPlayer();

    // Dynamic Shelf Manager that builds aisles and loads cartridges per genre
    const musicShelfManager = new MusicShelfManager(
      scene,
      physicsManager,
      interactableRegistry,
      matrixRoom.shadowGenerator,
      matrixRoom
    );

    // 7. Setup Aisle Control Station (3D console for sliding aisles on X/Z plane)
    console.log("Setting up Aisle Control Station...");
    const controlStation = new AisleControlStation(scene, matrixRoom);

    // Initial catalog load directly from Emby if configured
    if (embyClient.isConfigured()) {
      console.log("Loading Emby library...");
      const res = await musicShelfManager.loadEmbyLibrary(embyClient);
      controlStation.updateGenreButtons(matrixRoom.getActiveGenres());
      console.log(`Loaded ${res.genres.length} genres from Emby.`);
    } else {
      console.log("Emby not configured yet. Open Emby Settings in HUD to connect.");
    }

    // When an album sleeve is clicked, notify HUD and player
    musicShelfManager.onAlbumSelected = (album) => {
      hud.showToast(`💿 Album: "${album.title}". Tracks loaded on record rack! Grab a track to play.`);
    };

    // 8. Setup Aisle Altar Pillar & Ceiling Arena Jumbotron
    const aisleAltar = new AisleAltarPillar(scene, musicPlayer);
    const jumbotron = new JumbotronManager(scene, musicPlayer);

    // 9. Wire up Cartridge Grab & Release to the Altar Pillar
    interactableRegistry.onObjectGrabbed = (mesh) => {
      const cartridge = musicShelfManager.getCartridge(mesh);
      if (cartridge) {
        cartridge.activateDynamicPhysics();

        let playerPos = desktopController.camera.position;
        let playerForward = desktopController.camera.getDirection(Vector3.Forward());

        if (vrController.xrExperience && vrController.xrExperience.baseExperience.camera) {
          playerPos = vrController.xrExperience.baseExperience.camera.globalPosition;
          playerForward = vrController.xrExperience.baseExperience.camera.getForwardRay().direction;
        }

        aisleAltar.onCartridgeGrabbed(cartridge, playerPos, playerForward);
        hud.showToast("⚡ Altar Pillar deployed! Drop album into glowing slot to play.");
      }
    };

    interactableRegistry.onObjectReleased = (mesh) => {
      const cartridge = musicShelfManager.getCartridge(mesh);
      if (cartridge) {
        aisleAltar.onCartridgeReleased(cartridge);
      }
    };

    // 10. Setup UI HUD & Emby Controls
    const hud = new HUD(
      engine,
      vrController,
      desktopController
    );
    hud.setup();
    hud.setMusicComponents(embyClient, musicPlayer, matrixRoom, musicShelfManager, controlStation);

    // 11. Engine Render Loop
    engine.runRenderLoop(() => {
      scene.render();
      hud.update();
      aisleAltar.update();
      jumbotron.update();
    });

    // Resize handling
    window.addEventListener("resize", () => {
      engine.resize();
    });

    console.log("BabylonJS Matrix Music Browser & Aisle Control Station loaded and ready!");
  } catch (err) {
    console.error("Error launching Matrix Music Browser:", err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  bootstrap();
});
