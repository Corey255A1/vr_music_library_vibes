import { Scene, ShadowGenerator, Mesh } from "@babylonjs/core";
import { EmbyClient, MusicAlbum, MusicTrack } from "./EmbyClient";
import { AlbumItem } from "./AlbumItem";
import { MusicCartridge } from "./MusicCartridge";
import { MatrixRoomManager, GenreAisleConfig, AlbumSlot } from "./MatrixRoomManager";
import { PhysicsManager } from "../physics/PhysicsManager";
import { InteractableRegistry } from "../objects/InteractableRegistry";
import { SoundEffects } from "../audio/SoundEffects";

function getGenreIcon(genre: string): string {
  const g = genre.toUpperCase();
  if (g.includes("SYNTH") || g.includes("RETRO")) return "⚡";
  if (g.includes("CYBER")) return "🕶️";
  if (g.includes("ROCK") || g.includes("METAL")) return "🎸";
  if (g.includes("CHILL") || g.includes("LO-FI") || g.includes("LOFI")) return "☕";
  if (g.includes("ELECTR") || g.includes("DANCE") || g.includes("EDM") || g.includes("HOUSE") || g.includes("TECHNO")) return "🎧";
  if (g.includes("JAZZ") || g.includes("BLUES")) return "🎷";
  if (g.includes("CLASSIC") || g.includes("ORCHESTR")) return "🎻";
  if (g.includes("HIP") || g.includes("RAP")) return "🎤";
  if (g.includes("POP")) return "✨";
  if (g.includes("SOUNDTRACK") || g.includes("OST")) return "🎬";
  if (g.includes("AMBIENT")) return "🌌";
  return "🎵";
}

function getGenreColor(genre: string, index: number): string {
  const g = genre.toUpperCase();
  if (g.includes("SYNTH") || g.includes("RETRO")) return "#ff007f";
  if (g.includes("CYBER")) return "#00e5ff";
  if (g.includes("ROCK") || g.includes("METAL")) return "#ff0033";
  if (g.includes("CHILL") || g.includes("LO-FI") || g.includes("LOFI")) return "#00ff88";
  if (g.includes("ELECTR") || g.includes("DANCE") || g.includes("EDM")) return "#ff9100";
  if (g.includes("SOUNDTRACK")) return "#9d4edd";

  const palette = ["#00e5ff", "#ff007f", "#ff9100", "#7928ca", "#00ff88", "#ff0033", "#00b4d8", "#e0aaff"];
  return palette[index % palette.length];
}

export class MusicShelfManager {
  private scene: Scene;
  private physicsManager: PhysicsManager;
  private registry: InteractableRegistry;
  private shadowGenerator: ShadowGenerator | null;
  private matrixRoom: MatrixRoomManager;

  // Genre Album Sleeves (Selectable, non-grabable)
  public albumItems: Map<string, AlbumItem> = new Map();
  public meshToAlbumItem: Map<Mesh, AlbumItem> = new Map();

  // Selected Album Tracks (Physical grabable records on Track Presentation Rack)
  public cartridges: Map<string, MusicCartridge> = new Map();
  public meshToCartridge: Map<Mesh, MusicCartridge> = new Map();

  public onAlbumSelected?: (album: MusicAlbum) => void;
  private isTransitioning = false;

  constructor(
    scene: Scene,
    physicsManager: PhysicsManager,
    registry: InteractableRegistry,
    shadowGenerator: ShadowGenerator | null,
    matrixRoom: MatrixRoomManager
  ) {
    this.scene = scene;
    this.physicsManager = physicsManager;
    this.registry = registry;
    this.shadowGenerator = shadowGenerator;
    this.matrixRoom = matrixRoom;

    this.matrixRoom.onTrackRackDismissRequested = () => {
      this.dismissTrackRack();
    };

    const registerDismiss = (mesh: Mesh) => {
      this.registry.registerInteractable(mesh, "track_rack_header");
      mesh.metadata = {
        isInteractable: true,
        type: "track_rack_header",
        name: "Track Rack Header - Click to Return",
        onSelect: () => {
          this.dismissTrackRack();
        },
      };
    };

    if (this.matrixRoom.trackRackHeaderMesh) {
      registerDismiss(this.matrixRoom.trackRackHeaderMesh);
    }
    if (this.matrixRoom.trackRackSignPlane) {
      registerDismiss(this.matrixRoom.trackRackSignPlane);
    }
  }

  /**
   * Queries genres from Emby, constructs initial genre racks, and populates selectable album sleeves.
   */
  public async loadEmbyLibrary(embyClient: EmbyClient): Promise<{
    genres: { name: string; albumCount: number }[];
    albumCount: number;
  }> {
    this.clearAll();

    const { genres, albums } = await embyClient.fetchGenresAndAlbums();

    if (genres.length === 0 || albums.length === 0) {
      console.log("No albums or genres found in Emby yet.");
      return { genres: [], albumCount: 0 };
    }

    // Prepare genre aisle configurations
    const genreConfigs: GenreAisleConfig[] = genres.map((g, idx) => ({
      name: g.name,
      albumCount: g.albumCount,
      accentColor: getGenreColor(g.name, idx),
      icon: getGenreIcon(g.name),
    }));

    // Build the dynamic genre racks
    this.matrixRoom.buildGenreAlbumRacks(genreConfigs);

    // Group available album slots by genre
    const slotsByGenre = new Map<string, AlbumSlot[]>();
    for (const slot of this.matrixRoom.albumSlots) {
      if (!slotsByGenre.has(slot.genre)) {
        slotsByGenre.set(slot.genre, []);
      }
      slotsByGenre.get(slot.genre)!.push(slot);
    }

    // Populate album sleeves on their respective genre shelves
    for (const genreCfg of genreConfigs) {
      const genreAlbums = embyClient.getAlbumsByGenre(genreCfg.name);
      const slots = slotsByGenre.get(genreCfg.name) || [];
      const count = Math.min(genreAlbums.length, slots.length);

      for (let i = 0; i < count; i++) {
        const album = genreAlbums[i];
        const slot = slots[i];

        const albumItem = new AlbumItem(
          this.scene,
          this.registry,
          album,
          slot.localPosition,
          slot.localRotation,
          slot.rackMesh
        );

        albumItem.onSelect = (selectedAlbum, sourceRack, item) => {
          this.selectAlbum(selectedAlbum, embyClient, sourceRack || slot.rackMesh, item || albumItem);
        };

        this.albumItems.set(album.id, albumItem);
        this.meshToAlbumItem.set(albumItem.mesh, albumItem);
      }
    }

    console.log(`Placed ${this.albumItems.size} selectable albums across ${genres.length} genre aisles.`);
    return { genres, albumCount: this.albumItems.size };
  }

  /**
   * Fetches album tracks with an aggressive 1.2s timeout race against procedural fallback
   * so network latency or missing track endpoints can NEVER stall physical rack choreography.
   */
  private async fetchTracksWithFallback(embyClient: EmbyClient, album: MusicAlbum): Promise<MusicTrack[]> {
    if (album.tracks && album.tracks.length > 0) {
      return album.tracks;
    }

    const timeoutPromise = new Promise<MusicTrack[]>((resolve) => {
      setTimeout(() => {
        resolve(this.generateDefaultTracks(album));
      }, 1200);
    });

    try {
      const fetchPromise = embyClient.fetchTracksForAlbum(album);
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      if (res && res.length > 0) return res;
      return this.generateDefaultTracks(album);
    } catch (err) {
      console.warn(`[MusicShelfManager] Track fetch error for ${album.title}, generating fallback tracks:`, err);
      return this.generateDefaultTracks(album);
    }
  }

  private generateDefaultTracks(album: MusicAlbum): MusicTrack[] {
    if (album.tracks && album.tracks.length > 0) return album.tracks;
    const tracks: MusicTrack[] = [];
    const count = 10;
    for (let i = 1; i <= count; i++) {
      tracks.push({
        id: `${album.id}_track_${i}`,
        title: `${album.title} - Track ${i}`,
        artist: album.artist,
        artistId: album.artistId,
        album: album.title,
        albumId: album.id,
        durationSeconds: 180 + i * 12,
        streamUrl: album.coverUrl,
        albumCoverUrl: album.coverUrl,
        artistPhotoUrl: album.artistPhotoUrl,
        dominantColorHex: album.dominantColorHex,
        genre: album.genre,
        year: album.year,
        trackIndex: i,
      });
    }
    album.tracks = tracks;
    return tracks;
  }

  /**
   * Selecting an album brings in the dedicated Track Presentation Rack with grabable records!
   * Exact Choreography:
   * 1. The specific genre rack containing that album slides backwards FIRST into the recess.
   * 2. The new Track Presentation Rack is configured beneath the floor at the exact original
   *    position and orientation where the genre rack was before it slid back.
   * 3. Cartridges are populated onto the submerged rack.
   * 4. The new rack rises smoothly up through the floor taking the genre rack's place!
   */
  public async selectAlbum(
    album: MusicAlbum,
    embyClient: EmbyClient,
    sourceRackMesh?: Mesh,
    albumItem?: AlbumItem
  ): Promise<void> {
    if (this.isTransitioning) {
      console.log("Album transition in progress, ignoring duplicate select.");
      return;
    }
    this.isTransitioning = true;

    try {
      SoundEffects.playGrab();
      console.log(`[MusicShelfManager] Album selected: "${album.title}" by ${album.artist}`);

      // If a track presentation rack is currently summoned, sink it down into the floor first
      if (this.matrixRoom.isTrackRackSummoned) {
        this.clearCartridges();
        await this.matrixRoom.hideTrackRackAsync();
      }

      // Resolve the exact source genre rack
      let resolvedRack: Mesh | undefined =
        sourceRackMesh ||
        albumItem?.parentRackMesh ||
        (albumItem?.mesh.parent as Mesh) ||
        this.albumItems.get(album.id)?.parentRackMesh;

      if (!resolvedRack && album.genre) {
        resolvedRack = this.matrixRoom.getRackForGenre(album.genre);
      }
      if (!resolvedRack && this.matrixRoom.rackMeshes.length > 0) {
        resolvedRack = this.matrixRoom.rackMeshes[0];
      }

      // Start fetching tracks in parallel with rack slide, guaranteed with timeout fallback
      const tracksPromise = this.fetchTracksWithFallback(embyClient, album);

      // STEP 1: The specific rack that album is on slides backwards FIRST
      console.log("[MusicShelfManager] Step 1: Sliding genre rack backwards into recess...");
      const slideResult = await this.matrixRoom.slideGenreRackBackAsync(resolvedRack);
      console.log("[MusicShelfManager] Genre rack slid backwards successfully.");

      // Await tracks result (running during the slide animation)
      const tracks = await tracksPromise;

      // STEP 2: Configure the new track presentation rack beneath the floor in the vacated spot
      console.log(`[MusicShelfManager] Step 2: Preparing track rack beneath the floor with ${tracks.length} tracks...`);
      const trackSlots = this.matrixRoom.prepareTrackRack(album, slideResult.rackOrigin, slideResult.rackRotY);

      // STEP 3: Clear any old cartridges and create the new track cartridges on the submerged rack
      this.clearCartridges();
      const count = Math.min(tracks.length, trackSlots.length);
      for (let i = 0; i < count; i++) {
        const track = tracks[i];
        const slot = trackSlots[i];

        const cartridge = new MusicCartridge(
          this.scene,
          this.physicsManager,
          this.registry,
          this.shadowGenerator,
          track,
          slot.localPosition,
          slot.localRotation,
          slot.rackMesh
        );

        this.cartridges.set(track.id, cartridge);
        this.meshToCartridge.set(cartridge.mesh, cartridge);
      }

      // STEP 4: The new rack rises UP through the floor in place where the album rack was before it slid back!
      console.log("[MusicShelfManager] Step 4: Rising track rack up through the floor in place of album rack...");
      await this.matrixRoom.riseTrackRackAsync();
      console.log("[MusicShelfManager] Track presentation rack is now active and ready!");

      if (this.onAlbumSelected) {
        this.onAlbumSelected(album);
      }
    } catch (err) {
      console.error("[MusicShelfManager] Error in selectAlbum:", err);
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Sinks the track rack back into the floor, then slides the genre rack back forward.
   */
  public async dismissTrackRack(): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    try {
      this.clearCartridges();
      await this.matrixRoom.hideTrackRackAsync();
      await this.matrixRoom.restoreDisplacedRackAsync();
    } finally {
      this.isTransitioning = false;
    }
  }

  public getAlbumItem(mesh: Mesh | null | undefined): AlbumItem | undefined {
    if (!mesh) return undefined;
    return this.meshToAlbumItem.get(mesh) || (mesh.metadata?.albumItem as AlbumItem | undefined);
  }

  public getCartridge(mesh: Mesh | null | undefined): MusicCartridge | undefined {
    if (!mesh) return undefined;
    return this.meshToCartridge.get(mesh) || (mesh.metadata?.cartridge as MusicCartridge | undefined);
  }

  public getCartridgeByTrackId(trackId: string): MusicCartridge | undefined {
    return this.cartridges.get(trackId);
  }

  public getAllCartridges(): MusicCartridge[] {
    return Array.from(this.cartridges.values());
  }

  public getAllAlbumItems(): AlbumItem[] {
    return Array.from(this.albumItems.values());
  }

  public filterCartridges(query: string): number {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    let matchCount = 0;
    for (const album of this.albumItems.values()) {
      if (album.album.title.toLowerCase().includes(q) || album.album.artist.toLowerCase().includes(q)) {
        matchCount++;
        album.setHovered(true);
      } else {
        album.setHovered(false);
      }
    }
    for (const cart of this.cartridges.values()) {
      if (cart.track.title.toLowerCase().includes(q) || cart.track.artist.toLowerCase().includes(q)) {
        matchCount++;
        cart.setHovered(true);
      } else {
        cart.setHovered(false);
      }
    }
    return matchCount;
  }

  public clearCartridges(): void {
    for (const cartridge of this.cartridges.values()) {
      cartridge.dispose();
    }
    this.cartridges.clear();
    this.meshToCartridge.clear();
  }

  public clearAll(): void {
    this.clearCartridges();
    for (const albumItem of this.albumItems.values()) {
      albumItem.dispose();
    }
    this.albumItems.clear();
    this.meshToAlbumItem.clear();
    this.matrixRoom.hideTrackRack();
  }
}
