import { Engine } from "@babylonjs/core";
import { VRController } from "../controls/VRController";
import { DesktopController } from "../controls/DesktopController";
import { EmbyClient } from "../music/EmbyClient";
import { MusicPlayer } from "../music/MusicPlayer";
import { MatrixRoomManager } from "../music/MatrixRoomManager";
import { MusicShelfManager } from "../music/MusicShelfManager";
import { AisleControlStation } from "../music/AisleControlStation";

export class HUD {
  private engine: Engine;
  private vrController: VRController;
  private desktopController: DesktopController;

  private fpsEl: HTMLElement | null = null;
  private objectsEl: HTMLElement | null = null;
  private xrStatusEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimeout: number | null = null;
  private lastFpsUpdate: number = 0;

  // Music & Matrix Subsystems
  private embyClient?: EmbyClient;
  private musicPlayer?: MusicPlayer;
  private matrixRoom?: MatrixRoomManager;
  private shelfManager?: MusicShelfManager;
  private controlStation?: AisleControlStation;

  private embyModalEl: HTMLElement | null = null;
  private embyStatusPill: HTMLElement | null = null;
  private embyServerUrlInput: HTMLInputElement | null = null;
  private embyApiKeyInput: HTMLInputElement | null = null;
  private embyUserIdInput: HTMLInputElement | null = null;

  private musicTitleEl: HTMLElement | null = null;
  private musicArtistEl: HTMLElement | null = null;
  private musicThumbEl: HTMLImageElement | null = null;
  private musicTimeEl: HTMLElement | null = null;
  private musicPlayBtn: HTMLElement | null = null;
  private musicVolumeSlider: HTMLInputElement | null = null;
  private musicSearchInput: HTMLInputElement | null = null;

  private genreSelectEl: HTMLSelectElement | null = null;

  constructor(
    engine: Engine,
    vrController: VRController,
    desktopController: DesktopController
  ) {
    this.engine = engine;
    this.vrController = vrController;
    this.desktopController = desktopController;

    this.fpsEl = document.getElementById("fps-counter");
    this.objectsEl = document.getElementById("objects-counter");
    this.xrStatusEl = document.getElementById("xr-status");
    this.toastEl = document.getElementById("toast-notification");
    this.genreSelectEl = document.getElementById("hud-genre-select") as HTMLSelectElement;
  }

  public setup(): void {
    this.setupConstructControls();
  }

  public setMusicComponents(
    embyClient: EmbyClient,
    musicPlayer: MusicPlayer,
    matrixRoom: MatrixRoomManager,
    shelfManager: MusicShelfManager,
    controlStation: AisleControlStation
  ): void {
    this.embyClient = embyClient;
    this.musicPlayer = musicPlayer;
    this.matrixRoom = matrixRoom;
    this.shelfManager = shelfManager;
    this.controlStation = controlStation;

    this.setupEmbyModal();
    this.setupMusicPlayerHud();
    this.setupAisleNavigationControls();
    this.refreshGenreOptions();
  }

  private setupConstructControls(): void {
    // Snap Upright button
    const btnSnap = document.getElementById("btn-snap-upright");
    if (btnSnap) {
      btnSnap.addEventListener("click", (e) => {
        e.stopPropagation();
        this.desktopController.snapHeldMeshUpright();
        this.showToast("⬆️ Snapped cartridge upright");
      });
    }

    // Summon Racks button
    const btnSummon = document.getElementById("btn-summon-racks");
    if (btnSummon) {
      btnSummon.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.matrixRoom) {
          this.matrixRoom.playSummonAnimation();
          this.showToast("⚡ Sliding racks summoned!");
        }
      });
    }
  }

  private setupAisleNavigationControls(): void {
    if (!this.matrixRoom) return;

    // Directional buttons in HUD
    const btnFwd = document.getElementById("btn-slide-fwd");
    if (btnFwd) {
      btnFwd.addEventListener("click", (e) => {
        e.stopPropagation();
        this.matrixRoom?.slideAisles(0, -3.0);
        this.controlStation?.setSummonedGenre("MANUAL SLIDE");
      });
    }

    const btnBack = document.getElementById("btn-slide-back");
    if (btnBack) {
      btnBack.addEventListener("click", (e) => {
        e.stopPropagation();
        this.matrixRoom?.slideAisles(0, 3.0);
        this.controlStation?.setSummonedGenre("MANUAL SLIDE");
      });
    }

    const btnLeft = document.getElementById("btn-slide-left");
    if (btnLeft) {
      btnLeft.addEventListener("click", (e) => {
        e.stopPropagation();
        this.matrixRoom?.slideAisles(-2.0, 0);
        this.controlStation?.setSummonedGenre("MANUAL SLIDE");
      });
    }

    const btnRight = document.getElementById("btn-slide-right");
    if (btnRight) {
      btnRight.addEventListener("click", (e) => {
        e.stopPropagation();
        this.matrixRoom?.slideAisles(2.0, 0);
        this.controlStation?.setSummonedGenre("MANUAL SLIDE");
      });
    }

    const btnReset = document.getElementById("btn-slide-reset");
    if (btnReset) {
      btnReset.addEventListener("click", (e) => {
        e.stopPropagation();
        this.matrixRoom?.resetAislesPosition();
        this.controlStation?.setSummonedGenre("ORIGIN");
        this.showToast("🔄 Aisles centered at origin");
      });
    }

    // Genre Jump dropdown in HUD
    if (this.genreSelectEl) {
      this.genreSelectEl.addEventListener("change", () => {
        const genre = this.genreSelectEl?.value;
        if (genre && this.matrixRoom) {
          this.matrixRoom.slideToGenre(genre);
          this.controlStation?.setSummonedGenre(genre);
          this.showToast(`⚡ Summoning ${genre} aisle...`);
        }
      });
    }
  }

  /**
   * Refreshes the genre options in the HUD dropdown and 3D Control Station.
   */
  public refreshGenreOptions(): void {
    if (!this.matrixRoom) return;
    const genres = this.matrixRoom.getActiveGenres();

    if (this.genreSelectEl) {
      this.genreSelectEl.innerHTML = '<option value="">⚡ Summon Genre Sector...</option>';
      for (const genre of genres) {
        const opt = document.createElement("option");
        opt.value = genre;
        opt.textContent = `Sector: ${genre}`;
        this.genreSelectEl.appendChild(opt);
      }
    }

    // Update 3D buttons on the console
    if (this.controlStation) {
      this.controlStation.updateGenreButtons(genres);
    }
  }

  private setupEmbyModal(): void {
    this.embyModalEl = document.getElementById("emby-modal");
    this.embyStatusPill = document.getElementById("emby-status-pill");
    this.embyServerUrlInput = document.getElementById("emby-server-url") as HTMLInputElement;
    this.embyApiKeyInput = document.getElementById("emby-api-key") as HTMLInputElement;
    this.embyUserIdInput = document.getElementById("emby-user-id") as HTMLInputElement;

    const btnOpenEmby = document.getElementById("btn-open-emby");
    const btnCloseEmby = document.getElementById("btn-close-emby");
    const btnTestEmby = document.getElementById("btn-test-emby");
    const btnSyncEmby = document.getElementById("btn-sync-emby");

    if (this.embyClient && this.embyServerUrlInput && this.embyApiKeyInput && this.embyUserIdInput) {
      const cfg = this.embyClient.getConfig();
      this.embyServerUrlInput.value = cfg.serverUrl;
      this.embyApiKeyInput.value = cfg.apiKey;
      this.embyUserIdInput.value = cfg.userId || "";

      if (this.embyClient.isConfigured()) {
        this.updateEmbyStatus(true, "Configured (Ready to Sync)");
      }
    }

    btnOpenEmby?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.embyModalEl?.classList.add("open");
    });

    btnCloseEmby?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.embyModalEl?.classList.remove("open");
    });

    btnTestEmby?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!this.embyClient) return;

      this.saveEmbyInputs();
      this.updateEmbyStatus(false, "Testing connection...");

      const success = await this.embyClient.testConnection();
      if (success) {
        this.updateEmbyStatus(true, "Online & Verified");
        this.showToast("✅ Connected to Emby Media Server!");
      } else {
        this.updateEmbyStatus(false, "Connection Failed");
        this.showToast("❌ Could not connect to Emby. Check URL & API key.");
      }
    });

    btnSyncEmby?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!this.embyClient || !this.shelfManager) return;

      this.saveEmbyInputs();
      this.showToast("⏳ Querying genres and albums from Emby...");
      this.updateEmbyStatus(false, "Syncing catalog...");

      try {
        const res = await this.shelfManager.loadEmbyLibrary(this.embyClient);
        this.refreshGenreOptions();
        this.updateEmbyStatus(true, `Online (${res.genres.length} genres, ${res.albumCount} albums)`);
        this.showToast(`🎶 Built ${res.genres.length} genre aisles with ${res.albumCount} albums! Click any album to open its tracks.`);
        this.embyModalEl?.classList.remove("open");
      } catch (err: any) {
        console.error("Emby sync error:", err);
        this.updateEmbyStatus(false, "Sync Error");
        this.showToast(`❌ Sync error: ${err.message || err}`);
      }
    });
  }

  private saveEmbyInputs(): void {
    if (!this.embyClient) return;
    this.embyClient.saveConfig({
      serverUrl: this.embyServerUrlInput?.value || "http://localhost:8096",
      apiKey: this.embyApiKeyInput?.value || "",
      userId: this.embyUserIdInput?.value || undefined,
    });
  }

  private updateEmbyStatus(online: boolean, text: string): void {
    if (!this.embyStatusPill) return;
    this.embyStatusPill.textContent = text;
    if (online) {
      this.embyStatusPill.className = "status-pill online";
    } else {
      this.embyStatusPill.className = "status-pill";
    }
  }

  private setupMusicPlayerHud(): void {
    this.musicTitleEl = document.getElementById("music-title-text");
    this.musicArtistEl = document.getElementById("music-artist-text");
    this.musicThumbEl = document.getElementById("music-cover-thumb") as HTMLImageElement;
    this.musicTimeEl = document.getElementById("music-time-display");
    this.musicPlayBtn = document.getElementById("btn-music-play");
    this.musicVolumeSlider = document.getElementById("music-volume-slider") as HTMLInputElement;
    this.musicSearchInput = document.getElementById("music-search-box") as HTMLInputElement;

    const btnPrev = document.getElementById("btn-music-prev");
    const btnNext = document.getElementById("btn-music-next");

    this.musicPlayBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.musicPlayer?.togglePlay();
    });

    btnPrev?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showToast("⏮ Previous track");
    });

    btnNext?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showToast("⏭ Next track");
    });

    this.musicVolumeSlider?.addEventListener("input", (e) => {
      e.stopPropagation();
      const vol = parseFloat(this.musicVolumeSlider?.value || "0.8");
      this.musicPlayer?.setVolume(vol);
    });

    this.musicSearchInput?.addEventListener("input", (e) => {
      e.stopPropagation();
      const q = this.musicSearchInput?.value || "";
      if (this.shelfManager) {
        const matches = this.shelfManager.filterCartridges(q);
        if (q.trim()) {
          this.showToast(`🔍 Found ${matches} matching cartridges`);
        }
      }
    });

    if (this.musicPlayer) {
      this.musicPlayer.onTrackChanged = (track) => {
        if (this.musicTitleEl) this.musicTitleEl.textContent = track.title.toUpperCase();
        if (this.musicArtistEl) this.musicArtistEl.textContent = `${track.artist} // ${track.album || ""}`;
        if (this.musicThumbEl) this.musicThumbEl.src = track.albumCoverUrl;
      };

      this.musicPlayer.onStateChanged = (isPlaying) => {
        if (this.musicPlayBtn) {
          this.musicPlayBtn.textContent = isPlaying ? "⏸" : "▶";
        }
      };
    }
  }

  public update(): void {
    const now = performance.now();

    // Update FPS & object counter every 500ms
    if (now - this.lastFpsUpdate > 500) {
      if (this.fpsEl) {
        this.fpsEl.textContent = `${Math.round(this.engine.getFps())} FPS`;
      }
      if (this.objectsEl) {
        const count = this.shelfManager ? this.shelfManager.getAllCartridges().length : 0;
        this.objectsEl.textContent = `Cartridges: ${count}`;
      }
      if (this.xrStatusEl) {
        const state = this.vrController.xrExperience?.baseExperience?.state;
        this.xrStatusEl.textContent = state ? `XR: ${state}` : "XR: Ready 🥽";
      }
      this.lastFpsUpdate = now;
    }

    // Update floating music player time
    if (this.musicPlayer && this.musicTimeEl) {
      const cur = this.formatTime(this.musicPlayer.getCurrentTime());
      const dur = this.formatTime(this.musicPlayer.getDuration());
      this.musicTimeEl.textContent = `${cur} / ${dur}`;
    }
  }

  private formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  public showToast(msg: string, durationMs: number = 3200): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add("show");

    if (this.toastTimeout !== null) {
      clearTimeout(this.toastTimeout);
    }

    this.toastTimeout = window.setTimeout(() => {
      this.toastEl?.classList.remove("show");
      this.toastTimeout = null;
    }, durationMs);
  }
}
