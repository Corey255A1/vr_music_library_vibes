import {
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  StandardMaterial,
  Mesh,
  Texture,
  DynamicTexture,
} from "@babylonjs/core";
import { MusicAlbum } from "./EmbyClient";
import { InteractableRegistry } from "../objects/InteractableRegistry";

export class AlbumItem {
  private scene: Scene;
  private registry: InteractableRegistry;
  public album: MusicAlbum;

  public mesh: Mesh;
  public parentRackMesh?: Mesh;
  private frontPlane: Mesh;
  private labelPlane: Mesh;
  private labelTex: DynamicTexture;

  public onSelect?: (album: MusicAlbum, rackMesh?: Mesh, item?: AlbumItem) => void;

  constructor(
    scene: Scene,
    registry: InteractableRegistry,
    album: MusicAlbum,
    localPos: Vector3,
    localRot: Vector3 = Vector3.Zero(),
    parentMesh?: Mesh
  ) {
    this.scene = scene;
    this.registry = registry;
    this.album = album;
    this.parentRackMesh = parentMesh;

    const width = 0.44;
    const height = 0.44;
    const depth = 0.025;

    // 1. Sleek Album Sleeve Box
    this.mesh = MeshBuilder.CreateBox(`albumSleeve_${album.id}`, { width, height, depth }, this.scene);
    if (parentMesh) {
      this.mesh.parent = parentMesh;
      this.mesh.position.copyFrom(localPos);
      this.mesh.rotation.copyFrom(localRot);
    } else {
      this.mesh.position.copyFrom(localPos);
      this.mesh.rotation.copyFrom(localRot);
    }

    const sleeveMat = new StandardMaterial(`sleeveMat_${album.id}`, this.scene);
    const dominantColor = Color3.FromHexString(album.dominantColorHex || "#00e5ff");
    sleeveMat.diffuseColor = new Color3(0.08, 0.1, 0.14);
    sleeveMat.specularColor = new Color3(0.5, 0.5, 0.5);
    sleeveMat.emissiveColor = dominantColor.scale(0.18);
    this.mesh.material = sleeveMat;

    // 2. Front Face Album Cover
    const faceZ = depth / 2 + 0.002;
    this.frontPlane = MeshBuilder.CreatePlane(`albumCover_${album.id}`, { width: width * 0.94, height: height * 0.94 }, this.scene);
    this.frontPlane.parent = this.mesh;
    this.frontPlane.position.set(0, 0, faceZ);
    this.frontPlane.rotation.y = Math.PI; // Face +Z so album artwork is unmirrored
    this.frontPlane.isPickable = true;

    const coverMat = new StandardMaterial(`coverMat_${album.id}`, this.scene);
    coverMat.backFaceCulling = false;
    coverMat.specularColor = new Color3(0.2, 0.2, 0.2);
    coverMat.emissiveColor = new Color3(0.95, 0.95, 0.95);

    const tex = new Texture(album.coverUrl, this.scene);
    coverMat.diffuseTexture = tex;
    coverMat.emissiveTexture = tex;
    this.frontPlane.material = coverMat;

    // 3. Floating 3D Hover Label (Billboard facing camera)
    this.labelPlane = MeshBuilder.CreatePlane(`albumLabel_${album.id}`, { width: 0.75, height: 0.16 }, this.scene);
    this.labelPlane.position.set(0, height / 2 + 0.12, 0.04);
    this.labelPlane.rotation.y = Math.PI; // Face +Z so label text is unmirrored
    this.labelPlane.parent = this.mesh;
    this.labelPlane.isPickable = false;
    this.labelPlane.isVisible = false; // Shown on hover

    this.labelTex = new DynamicTexture(`albumLabelTex_${album.id}`, { width: 512, height: 128 }, this.scene, false);
    const ctx = this.labelTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.fillStyle = "rgba(10, 14, 22, 0.92)";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = album.dominantColorHex || "#00e5ff";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const shortTitle = album.title.length > 24 ? album.title.substring(0, 22) + "…" : album.title;
    ctx.fillText(shortTitle, 256, 44);

    ctx.fillStyle = album.dominantColorHex || "#00e5ff";
    ctx.font = "18px monospace";
    const shortArtist = album.artist.length > 28 ? album.artist.substring(0, 26) + "…" : album.artist;
    ctx.fillText(`${shortArtist} • CLICK TO OPEN`, 256, 88);
    this.labelTex.update();

    const labelMat = new StandardMaterial(`albumLabelMat_${album.id}`, this.scene);
    labelMat.diffuseTexture = this.labelTex;
    labelMat.emissiveTexture = this.labelTex;
    labelMat.emissiveColor = new Color3(1, 1, 1);
    this.labelPlane.material = labelMat;

    // 4. Register with InteractableRegistry as a selectable album sleeve (NOT grabable physics)
    const sleeveMetadata = {
      isInteractable: true,
      type: "album_sleeve",
      name: `Album: ${album.title} - ${album.artist}`,
      album: this.album,
      albumItem: this,
      parentRackMesh: this.parentRackMesh,
      onSelect: () => {
        console.log(`Album sleeve selected: "${album.title}"`);
        if (this.onSelect) {
          this.onSelect(this.album, this.parentRackMesh, this);
        }
      },
    };
    this.mesh.metadata = sleeveMetadata;
    this.frontPlane.metadata = sleeveMetadata;
    this.registry.registerInteractable(this.mesh, "album_sleeve");
    this.registry.registerInteractable(this.frontPlane, "album_sleeve");
    this.registry.registerCompoundVisualMeshes(this.mesh, [this.mesh, this.frontPlane]);
  }

  public setHovered(hovered: boolean): void {
    this.labelPlane.isVisible = hovered;
    const mat = this.mesh.material as StandardMaterial;
    if (mat) {
      const col = Color3.FromHexString(this.album.dominantColorHex || "#00e5ff");
      mat.emissiveColor = hovered ? col.scale(0.6) : col.scale(0.18);
    }
  }

  public dispose(): void {
    this.registry.unregisterInteractable(this.mesh);
    this.registry.unregisterInteractable(this.frontPlane);
    this.labelTex.dispose();
    this.labelPlane.dispose();
    this.frontPlane.dispose();
    this.mesh.dispose();
  }
}

