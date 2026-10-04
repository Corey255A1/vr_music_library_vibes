import {
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  DynamicTexture,
} from "@babylonjs/core";
import { MusicPlayer } from "./MusicPlayer";
import { MusicTrack } from "./EmbyClient";

export class JumbotronManager {
  private scene: Scene;
  private musicPlayer: MusicPlayer;

  public jumbotronRoot: Mesh;
  private screenMeshes: Mesh[] = [];
  private screenTexture: DynamicTexture;
  private tickerTexture: DynamicTexture;
  private tickerMesh!: Mesh;

  // Cached HTML image elements for instant canvas rendering
  private currentCoverImg: HTMLImageElement | null = null;
  private currentArtistImg: HTMLImageElement | null = null;
  private lastTrackId: string | null = null;

  // Visualizer peak bar values for arena look
  private peakBars: number[] = new Array(32).fill(0);
  private tickerOffset = 0;

  constructor(scene: Scene, musicPlayer: MusicPlayer) {
    this.scene = scene;
    this.musicPlayer = musicPlayer;

    this.jumbotronRoot = new Mesh("jumbotronRoot", this.scene);
    this.jumbotronRoot.position.set(0, 11.5, 0);

    // Dynamic screen texture shared across the 4 display faces
    this.screenTexture = new DynamicTexture("jumbotronScreenTex", { width: 1024, height: 1024 }, this.scene, false);
    this.tickerTexture = new DynamicTexture("jumbotronTickerTex", { width: 2048, height: 128 }, this.scene, false);

    this.buildJumbotronStructure();
  }

  private buildJumbotronStructure(): void {
    const chassisWidth = 7.6;
    const chassisHeight = 3.6;
    const chassisDepth = 7.6;

    // 1. Heavy Industrial Main Housing
    const chassisMat = new StandardMaterial("jumbotronChassisMat", this.scene);
    chassisMat.diffuseColor = new Color3(0.08, 0.1, 0.14);
    chassisMat.specularColor = new Color3(0.5, 0.5, 0.5);

    const mainBody = MeshBuilder.CreateBox("jumbotronBody", { width: chassisWidth, height: chassisHeight, depth: chassisDepth }, this.scene);
    mainBody.material = chassisMat;
    mainBody.parent = this.jumbotronRoot;

    // 2. Corner LED accent strips
    const accentMat = new StandardMaterial("jumbotronAccentMat", this.scene);
    accentMat.diffuseColor = new Color3(0, 0.8, 1);
    accentMat.emissiveColor = new Color3(0, 0.7, 1);

    const cornerOffsets = [
      [-chassisWidth / 2, -chassisDepth / 2],
      [chassisWidth / 2, -chassisDepth / 2],
      [-chassisWidth / 2, chassisDepth / 2],
      [chassisWidth / 2, chassisDepth / 2],
    ];
    cornerOffsets.forEach(([x, z], idx) => {
      const col = MeshBuilder.CreateBox(`cornerBezel_${idx}`, { width: 0.18, height: chassisHeight + 0.2, depth: 0.18 }, this.scene);
      col.position.set(x, 0, z);
      col.material = accentMat;
      col.parent = this.jumbotronRoot;
    });

    // 3. 4 Suspension Steel Cables rising to ceiling trusses
    const cableMat = new StandardMaterial("cableMat", this.scene);
    cableMat.diffuseColor = new Color3(0.18, 0.2, 0.24);

    cornerOffsets.forEach(([x, z], idx) => {
      const topPos = new Vector3(x * 0.7, 5.0, z * 0.7);
      const botPos = new Vector3(x * 0.95, chassisHeight / 2, z * 0.95);
      const cable = MeshBuilder.CreateTube(
        `jumboCable_${idx}`,
        { path: [botPos, topPos], radius: 0.035, tessellation: 8 },
        this.scene
      );
      cable.material = cableMat;
      cable.parent = this.jumbotronRoot;
    });

    // 4. 4 Massive Arena Display Screens (North, South, East, West)
    const screenMat = new StandardMaterial("jumbotronScreenMat", this.scene);
    screenMat.diffuseTexture = this.screenTexture;
    screenMat.emissiveTexture = this.screenTexture;
    screenMat.emissiveColor = new Color3(0.9, 0.9, 0.9);
    screenMat.specularColor = Color3.Black();

    const screenWidth = chassisWidth * 0.88;
    const screenHeight = chassisHeight * 0.82;
    const halfDepth = chassisDepth / 2 + 0.02;

    const screenConfigs = [
      { name: "screenNorth", pos: new Vector3(0, 0, halfDepth), rotY: Math.PI },
      { name: "screenSouth", pos: new Vector3(0, 0, -halfDepth), rotY: 0 },
      { name: "screenEast", pos: new Vector3(halfDepth, 0, 0), rotY: Math.PI / 2 },
      { name: "screenWest", pos: new Vector3(-halfDepth, 0, 0), rotY: -Math.PI / 2 },
    ];

    screenConfigs.forEach((cfg) => {
      const plane = MeshBuilder.CreatePlane(cfg.name, { width: screenWidth, height: screenHeight }, this.scene);
      plane.position.copyFrom(cfg.pos);
      plane.rotation.y = cfg.rotY;
      plane.material = screenMat;
      plane.parent = this.jumbotronRoot;
      this.screenMeshes.push(plane);
    });

    // 5. Lower 360-degree Ribbon Ticker Board
    this.tickerMesh = MeshBuilder.CreateCylinder("tickerRing", { diameter: chassisWidth * 1.05, height: 0.45, tessellation: 32 }, this.scene);
    this.tickerMesh.position.set(0, -chassisHeight / 2 - 0.28, 0);
    this.tickerMesh.parent = this.jumbotronRoot;

    const tickerMat = new StandardMaterial("tickerMat", this.scene);
    tickerMat.diffuseTexture = this.tickerTexture;
    tickerMat.emissiveTexture = this.tickerTexture;
    tickerMat.emissiveColor = new Color3(0.9, 0.9, 0.9);
    this.tickerMesh.material = tickerMat;
  }

  private preloadImagesForTrack(track: MusicTrack): void {
    if (this.lastTrackId === track.id) return;
    this.lastTrackId = track.id;

    // Load album cover
    const cover = new Image();
    cover.crossOrigin = "anonymous";
    cover.src = track.albumCoverUrl;
    cover.onload = () => {
      this.currentCoverImg = cover;
    };

    // Load artist photo
    const artist = new Image();
    artist.crossOrigin = "anonymous";
    artist.src = track.artistPhotoUrl;
    artist.onload = () => {
      this.currentArtistImg = artist;
    };
  }

  /**
   * Render loop update: draws real-time graphics, audio equalizer, and remaining time.
   */
  public update(): void {
    const track = this.musicPlayer.getCurrentTrack();
    if (track) {
      this.preloadImagesForTrack(track);
    }

    const isPlaying = this.musicPlayer.getIsPlaying();
    const progress = this.musicPlayer.getPlaybackProgress();
    const freqData = this.musicPlayer.getFrequencyData();

    // 1. Draw Main Jumbotron Screen (1024x1024)
    const ctx = this.screenTexture.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 1024, 1024);

    // Screen Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1024);
    bgGrad.addColorStop(0, "#080c14");
    bgGrad.addColorStop(0.7, "#0d131f");
    bgGrad.addColorStop(1, "#05070a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 1024);

    // High-tech decorative frame
    const dominantColor = track?.dominantColorHex || "#00e5ff";
    ctx.strokeStyle = dominantColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 16, 992, 992);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, 972, 972);

    // Top Header Banner
    ctx.fillStyle = dominantColor;
    ctx.fillRect(30, 30, 964, 48);

    ctx.fillStyle = "#000000";
    ctx.font = "bold 22px 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("★ MATRIX ARENA AUDIO SYSTEM // LIVE 24-BIT MASTER", 46, 62);

    // Playback status badge (top right)
    ctx.fillStyle = isPlaying ? "#00ff88" : "#ffaa00";
    ctx.font = "bold 20px 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(isPlaying ? "▶ PLAYING" : "⏸ PAUSED", 975, 62);

    // Left Box: Album Cover
    const boxSize = 270;
    const albumX = 50;
    const albumY = 105;

    ctx.fillStyle = "#05070a";
    ctx.fillRect(albumX, albumY, boxSize, boxSize);
    ctx.strokeStyle = dominantColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(albumX, albumY, boxSize, boxSize);

    if (this.currentCoverImg && this.currentCoverImg.complete) {
      try {
        ctx.drawImage(this.currentCoverImg, albumX + 4, albumY + 4, boxSize - 8, boxSize - 8);
      } catch {
        // Fallback
      }
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ALBUM COVER", albumX + boxSize / 2, albumY + boxSize / 2);
    }

    // Right Box: Artist Graphic
    const artistX = 704;
    const artistY = 105;

    ctx.fillStyle = "#05070a";
    ctx.fillRect(artistX, artistY, boxSize, boxSize);
    ctx.strokeStyle = dominantColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(artistX, artistY, boxSize, boxSize);

    if (this.currentArtistImg && this.currentArtistImg.complete) {
      try {
        ctx.drawImage(this.currentArtistImg, artistX + 4, artistY + 4, boxSize - 8, boxSize - 8);
      } catch {
        // Fallback
      }
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ARTIST PHOTO", artistX + boxSize / 2, artistY + boxSize / 2);
    }

    // Center Details: Track Title & Artist
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px 'Segoe UI', Roboto, sans-serif";
    const title = track?.title || "STANDBY // NO TRACK LOADED";
    ctx.fillText(title.toUpperCase(), 512, 175);

    ctx.fillStyle = dominantColor;
    ctx.font = "bold 30px 'Segoe UI', Roboto, sans-serif";
    const artistName = track ? `${track.artist} • ${track.album}` : "SELECT A CARTRIDGE OFF THE SHELF";
    ctx.fillText(artistName, 512, 230);

    // Genre / Year Badge
    if (track?.genre) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.fillRect(360, 260, 304, 34);
      ctx.strokeStyle = dominantColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(360, 260, 304, 34);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px monospace";
      ctx.fillText(`GENRE: ${track.genre}  |  ${track.year || 2026}`, 512, 283);
    }

    // Progress Clock & Remaining Time Countdown
    const curMin = Math.floor(progress.currentSeconds / 60);
    const curSec = Math.floor(progress.currentSeconds % 60).toString().padStart(2, "0");
    const durMin = Math.floor(progress.durationSeconds / 60);
    const durSec = Math.floor(progress.durationSeconds % 60).toString().padStart(2, "0");
    const remMin = Math.floor(progress.remainingSeconds / 60);
    const remSec = Math.floor(progress.remainingSeconds % 60).toString().padStart(2, "0");

    const timeStr = `${curMin}:${curSec} / ${durMin}:${durSec}   [-${remMin}:${remSec}]`;

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px monospace";
    ctx.fillText(timeStr, 512, 355);

    // Scrubber Progress Bar
    const barX = 70;
    const barY = 380;
    const barW = 884;
    const barH = 22;

    ctx.fillStyle = "#161b22";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barW, barH);

    // Filled progress
    const fillW = Math.max(0, Math.min(barW, barW * progress.progress01));
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    fillGrad.addColorStop(0, "#00e5ff");
    fillGrad.addColorStop(1, dominantColor);
    ctx.fillStyle = fillGrad;
    ctx.fillRect(barX, barY, fillW, barH);

    // Scrubber Knob
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(barX + fillW, barY + barH / 2, 14, 0, Math.PI * 2);
    ctx.fill();

    // 2. Real-Time 32-Band Audio Visualizer Equalizer
    const visX = 50;
    const visY = 440;
    const visW = 924;
    const visH = 520;

    ctx.fillStyle = "rgba(5, 8, 14, 0.85)";
    ctx.fillRect(visX, visY, visW, visH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    ctx.strokeRect(visX, visY, visW, visH);

    const barCount = 32;
    const spacing = 6;
    const singleBarW = (visW - spacing * (barCount + 1)) / barCount;

    for (let i = 0; i < barCount; i++) {
      const rawVal = freqData[i] || 0;
      const normalized = rawVal / 255; // 0 to 1
      const barHeight = Math.max(8, normalized * (visH - 40));

      const bx = visX + spacing + i * (singleBarW + spacing);
      const by = visY + visH - barHeight - 15;

      // Update floating peak cap
      if (barHeight > this.peakBars[i]) {
        this.peakBars[i] = barHeight;
      } else {
        this.peakBars[i] = Math.max(0, this.peakBars[i] - 3.5);
      }

      // Bar gradient (electric cyan -> dominant color -> white peak)
      const grad = ctx.createLinearGradient(0, visY + visH, 0, by);
      grad.addColorStop(0, "rgba(0, 150, 255, 0.65)");
      grad.addColorStop(0.7, dominantColor);
      grad.addColorStop(1, "#ffffff");

      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, singleBarW, barHeight);

      // Peak cap line
      const peakY = visY + visH - this.peakBars[i] - 15;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(bx, Math.max(visY + 10, peakY - 4), singleBarW, 4);
    }

    this.screenTexture.update();

    // 3. Draw Lower 360-degree Ribbon Ticker
    const tCtx = this.tickerTexture.getContext() as unknown as CanvasRenderingContext2D;
    tCtx.fillStyle = "#0c1017";
    tCtx.fillRect(0, 0, 2048, 128);

    tCtx.strokeStyle = dominantColor;
    tCtx.lineWidth = 4;
    tCtx.strokeRect(4, 4, 2040, 120);

    tCtx.fillStyle = "#ffffff";
    tCtx.font = "bold 34px monospace";
    tCtx.textAlign = "left";

    this.tickerOffset = (this.tickerOffset - 3.5) % 1024;
    const tickerMsg = track
      ? `▶ NOW PLAYING: ${track.title} — ${track.artist}  •  ALBUM: ${track.album}  •  REMAINING: ${remMin}:${remSec}  •  EMBY HIGH FIDELITY STREAM   `
      : "▶ MATRIX ARENA SOUNDSYSTEM  •  SELECT A MUSIC CARTRIDGE OFF THE SHELF AND DROP INTO THE AISLE ALTAR   ";

    tCtx.fillText(tickerMsg + tickerMsg, this.tickerOffset, 76);
    this.tickerTexture.update();
  }
}
