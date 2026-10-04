/**
 * Emby Media Server REST API client.
 * Handles fetching genres, albums, and tracks directly from the user's Emby instance.
 */

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId: string;
  durationSeconds: number;
  streamUrl: string;
  albumCoverUrl: string;
  artistPhotoUrl: string;
  dominantColorHex: string;
  genre?: string;
  year?: number;
  trackIndex?: number;
}

export interface MusicAlbum {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  year?: number;
  genre?: string;
  coverUrl: string;
  artistPhotoUrl: string;
  dominantColorHex: string;
  tracks?: MusicTrack[];
}

export interface EmbyConfig {
  serverUrl: string;
  apiKey: string;
  userId?: string;
}

const STORAGE_KEY = "vr_world_emby_config";

export class EmbyClient {
  private config: EmbyConfig;
  private cachedAlbumsByGenre: Map<string, MusicAlbum[]> = new Map();
  private cachedAlbumsById: Map<string, MusicAlbum> = new Map();

  constructor() {
    this.config = this.loadConfig();
  }

  public loadConfig(): EmbyConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Ignore localStorage errors
    }
    return {
      serverUrl: "http://localhost:8096",
      apiKey: "",
    };
  }

  public saveConfig(config: EmbyConfig): void {
    this.config = {
      ...config,
      serverUrl: config.serverUrl.replace(/\/+$/, ""),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Ignore localStorage errors
    }
  }

  public getConfig(): EmbyConfig {
    return { ...this.config };
  }

  public isConfigured(): boolean {
    return Boolean(this.config.serverUrl && this.config.apiKey);
  }

  /**
   * Test connection to Emby server.
   */
  public async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const baseUrl = this.config.serverUrl.replace(/\/+$/, "");
      const embyBase = baseUrl.endsWith("/emby") ? baseUrl : `${baseUrl}/emby`;
      const url = `${embyBase}/System/Info?api_key=${encodeURIComponent(this.config.apiKey)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch all music genres and albums directly from Emby.
   * Groups albums by genre to build the initial genre racks.
   */
  public async fetchGenresAndAlbums(): Promise<{
    genres: { name: string; albumCount: number }[];
    albums: MusicAlbum[];
  }> {
    if (!this.isConfigured()) {
      console.warn("Emby server is not configured. Please enter your Server URL and API Key.");
      return { genres: [], albums: [] };
    }

    const baseUrl = this.config.serverUrl.replace(/\/+$/, "");
    const apiKey = this.config.apiKey;
    const embyBase = baseUrl.endsWith("/emby") ? baseUrl : `${baseUrl}/emby`;

    // 1. Fetch Music Albums with Genres & Artists
    const albumsUrl = `${embyBase}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&Fields=PrimaryImageAspectRatio,Overview,Genres,RunTimeTicks,ProductionYear,AlbumArtist&api_key=${encodeURIComponent(apiKey)}`;
    const albumsRes = await fetch(albumsUrl, { headers: { Accept: "application/json" } });

    if (!albumsRes.ok) {
      throw new Error(`Failed to fetch albums from Emby: HTTP ${albumsRes.status} (${albumsRes.statusText})`);
    }

    const albumsData = await albumsRes.json();
    const rawAlbums: any[] = albumsData.Items || [];

    this.cachedAlbumsByGenre.clear();
    this.cachedAlbumsById.clear();

    const albums: MusicAlbum[] = [];
    const defaultColors = ["#ff007f", "#00e5ff", "#ff9100", "#7928ca", "#00ff88", "#ff0033", "#00b4d8", "#e0aaff"];

    for (let i = 0; i < rawAlbums.length; i++) {
      const raw = rawAlbums[i];
      const albumId = raw.Id;
      const artist = raw.AlbumArtist || (raw.Artists && raw.Artists[0]) || "Unknown Artist";
      const artistId = raw.ArtistItems && raw.ArtistItems[0] ? raw.ArtistItems[0].Id : undefined;
      const color = defaultColors[i % defaultColors.length];

      // Form verified image URLs or fallback to dynamic SVG
      const imageTag = raw.ImageTags?.Primary || raw.PrimaryImageTag;
      const coverUrl = imageTag
        ? `${embyBase}/Items/${albumId}/Images/Primary?tag=${encodeURIComponent(imageTag)}&maxWidth=600&maxHeight=600&quality=90&api_key=${encodeURIComponent(apiKey)}`
        : EmbyClient.createSvgAlbumCover(raw.Name || "ALBUM", artist, color, "#141a24", "🎵");

      const artistPhotoUrl = artistId
        ? `${embyBase}/Items/${artistId}/Images/Primary?maxWidth=600&maxHeight=600&quality=90&api_key=${encodeURIComponent(apiKey)}`
        : EmbyClient.createSvgArtistPhoto(artist, color, "#0f141d");

      // Extract genre name
      const rawGenre = (raw.Genres && raw.Genres[0]) ? raw.Genres[0].trim() : "GENERAL";
      const normalizedGenre = rawGenre.toUpperCase();

      const album: MusicAlbum = {
        id: albumId,
        title: raw.Name || "Untitled Album",
        artist,
        artistId,
        year: raw.ProductionYear,
        genre: normalizedGenre,
        coverUrl,
        artistPhotoUrl,
        dominantColorHex: color,
      };

      albums.push(album);
      this.cachedAlbumsById.set(albumId, album);

      if (!this.cachedAlbumsByGenre.has(normalizedGenre)) {
        this.cachedAlbumsByGenre.set(normalizedGenre, []);
      }
      this.cachedAlbumsByGenre.get(normalizedGenre)!.push(album);
    }

    // Build genre summary list
    const genres: { name: string; albumCount: number }[] = [];
    for (const [genreName, genreAlbums] of this.cachedAlbumsByGenre.entries()) {
      genres.push({
        name: genreName,
        albumCount: genreAlbums.length,
      });
    }

    // Sort genres alphabetically
    genres.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`Emby: Loaded ${genres.length} genres and ${albums.length} albums.`);
    return { genres, albums };
  }

  /**
   * Fetch all audio tracks for a specific selected album.
   */
  public async fetchTracksForAlbum(album: MusicAlbum): Promise<MusicTrack[]> {
    if (album.tracks && album.tracks.length > 0) {
      return album.tracks;
    }

    if (!this.isConfigured()) {
      return [];
    }

    const baseUrl = this.config.serverUrl.replace(/\/+$/, "");
    const apiKey = this.config.apiKey;
    const embyBase = baseUrl.endsWith("/emby") ? baseUrl : `${baseUrl}/emby`;

    try {
      const songsUrl = `${embyBase}/Items?IncludeItemTypes=Audio&Recursive=true&ParentId=${encodeURIComponent(album.id)}&Fields=MediaSources,RunTimeTicks,ArtistItems,AlbumArtist,AlbumId,Genres,IndexNumber,ProductionYear&api_key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(songsUrl, { headers: { Accept: "application/json" } });

      if (!res.ok) {
        throw new Error(`Failed to fetch album tracks: HTTP ${res.status}`);
      }

      const data = await res.json();
      const rawSongs: any[] = data.Items || [];

      const tracks: MusicTrack[] = rawSongs.map((s, idx) => {
        const durationSeconds = s.RunTimeTicks ? Math.round(s.RunTimeTicks / 10000000) : 180;
        const streamUrl = `${embyBase}/Audio/${s.Id}/stream.mp3?static=true&api_key=${encodeURIComponent(apiKey)}`;

        return {
          id: s.Id,
          title: s.Name || `Track ${s.IndexNumber || idx + 1}`,
          artist: album.artist,
          artistId: album.artistId,
          album: album.title,
          albumId: album.id,
          durationSeconds,
          streamUrl,
          albumCoverUrl: album.coverUrl,
          artistPhotoUrl: album.artistPhotoUrl,
          dominantColorHex: album.dominantColorHex,
          genre: album.genre,
          year: album.year,
          trackIndex: s.IndexNumber || idx + 1,
        };
      });

      // If no separate tracks returned, create a single playable track for the album
      if (tracks.length === 0) {
        tracks.push({
          id: album.id,
          title: album.title,
          artist: album.artist,
          artistId: album.artistId,
          album: album.title,
          albumId: album.id,
          durationSeconds: 210,
          streamUrl: `${embyBase}/Audio/${album.id}/stream.mp3?static=true&api_key=${encodeURIComponent(apiKey)}`,
          albumCoverUrl: album.coverUrl,
          artistPhotoUrl: album.artistPhotoUrl,
          dominantColorHex: album.dominantColorHex,
          genre: album.genre,
          year: album.year,
          trackIndex: 1,
        });
      }

      album.tracks = tracks;
      return tracks;
    } catch (err) {
      console.error(`Error fetching tracks for album "${album.title}":`, err);
      // Fallback single track
      const fallbackTrack: MusicTrack = {
        id: album.id,
        title: album.title,
        artist: album.artist,
        artistId: album.artistId,
        album: album.title,
        albumId: album.id,
        durationSeconds: 210,
        streamUrl: `${embyBase}/Audio/${album.id}/stream.mp3?static=true&api_key=${encodeURIComponent(apiKey)}`,
        albumCoverUrl: album.coverUrl,
        artistPhotoUrl: album.artistPhotoUrl,
        dominantColorHex: album.dominantColorHex,
        genre: album.genre,
        year: album.year,
        trackIndex: 1,
      };
      album.tracks = [fallbackTrack];
      return album.tracks;
    }
  }

  public getAlbumsByGenre(genreName: string): MusicAlbum[] {
    return this.cachedAlbumsByGenre.get(genreName.toUpperCase()) || [];
  }

  public getAlbumById(albumId: string): MusicAlbum | undefined {
    return this.cachedAlbumsById.get(albumId);
  }

  /**
   * Procedural SVG Album Cover generator for fallback artwork.
   */
  public static createSvgAlbumCover(
    line1: string,
    line2: string,
    accentColor: string,
    bgColor: string,
    icon: string
  ): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
        <defs>
          <radialGradient id="bgGlow" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.35"/>
            <stop offset="60%" stop-color="${bgColor}" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#05070a" stop-opacity="1.0"/>
          </radialGradient>
        </defs>
        <rect width="600" height="600" fill="url(#bgGlow)"/>
        <g stroke="${accentColor}" stroke-opacity="0.15" stroke-width="1.5">
          <line x1="0" y1="150" x2="600" y2="150"/>
          <line x1="0" y1="300" x2="600" y2="300"/>
          <line x1="0" y1="450" x2="600" y2="450"/>
          <line x1="150" y1="0" x2="150" y2="600"/>
          <line x1="300" y1="0" x2="300" y2="600"/>
          <line x1="450" y1="0" x2="450" y2="600"/>
        </g>
        <rect x="25" y="25" width="550" height="550" fill="none" stroke="${accentColor}" stroke-width="3" stroke-opacity="0.6"/>
        <circle cx="300" cy="240" r="105" fill="#000000" fill-opacity="0.6" stroke="${accentColor}" stroke-width="4"/>
        <text x="300" y="275" font-family="'Segoe UI', Roboto, sans-serif" font-size="80" text-anchor="middle" fill="#ffffff">${icon}</text>
        <text x="300" y="420" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="40" text-anchor="middle" fill="#ffffff">${line1}</text>
        <text x="300" y="475" font-family="'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="32" text-anchor="middle" fill="${accentColor}">${line2}</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  /**
   * Procedural SVG Artist Portrait generator for back of cartridge.
   */
  public static createSvgArtistPhoto(artistName: string, accentColor: string, bgColor: string): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
        <defs>
          <linearGradient id="bgLinear" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${bgColor}"/>
            <stop offset="100%" stop-color="#0a0c10"/>
          </linearGradient>
        </defs>
        <rect width="600" height="600" fill="url(#bgLinear)"/>
        <circle cx="300" cy="220" r="90" fill="${accentColor}" fill-opacity="0.25" stroke="${accentColor}" stroke-width="3"/>
        <circle cx="300" cy="205" r="50" fill="#ffffff" fill-opacity="0.85"/>
        <path d="M 210 330 C 210 260, 390 260, 390 330 Z" fill="#ffffff" fill-opacity="0.75"/>
        <rect x="40" y="370" width="520" height="190" rx="12" fill="#0d1117" fill-opacity="0.85" stroke="${accentColor}" stroke-width="2"/>
        <text x="300" y="440" font-family="'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="34" text-anchor="middle" fill="#ffffff">${artistName}</text>
        <text x="300" y="475" font-family="monospace" font-size="16" text-anchor="middle" fill="${accentColor}">MASTER ARTIST FILE</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
}
