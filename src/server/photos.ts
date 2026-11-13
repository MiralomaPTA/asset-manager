import sharp, { type Sharp } from "sharp";
import { config } from "@/server/config";
import type { FileKind, FileStore } from "@/server/adapters/types";

/**
 * Photos arrive from the browser already converted from HEIC and shrunk to at
 * most 1600 px. The server re-encodes them anyway: that applies the phone's
 * rotation, strips location and other metadata, and guarantees a JPEG. Item
 * photos also get a 480 × 360 thumbnail for the catalog cards.
 */

export class PhotoError extends Error {}

const FULL = { width: 1600, height: 1600 };
const THUMB = { width: 480, height: 360 };

async function normalize(bytes: Uint8Array): Promise<Sharp> {
  if (bytes.byteLength === 0) throw new PhotoError("The photo is empty. Try choosing it again.");
  if (bytes.byteLength > config.maxPhotoBytes) throw new PhotoError("That photo is too large. Try a smaller one.");
  const image = sharp(bytes, { failOn: "error" });
  try {
    await image.metadata();
  } catch {
    throw new PhotoError("That file isn't a photo we can read. Use a JPG or PNG.");
  }
  return image.rotate();
}

async function full(image: Sharp): Promise<Buffer> {
  return image.clone().resize({ ...FULL, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

/** Stores an item photo and its thumbnail. */
export async function storeItemPhoto(files: FileStore, bytes: Uint8Array, uploader: string, itemName: string): Promise<{ photoId: string; thumbId: string }> {
  const image = await normalize(bytes);
  const [big, small] = await Promise.all([
    full(image),
    image.clone().resize({ ...THUMB, fit: "cover", position: "attention" }).jpeg({ quality: 78, mozjpeg: true }).toBuffer(),
  ]);
  const base = itemName.replace(/[^\w -]+/g, "").trim().slice(0, 60) || "item";
  const [photo, thumb] = await Promise.all([
    files.put({ name: `${base}.jpg`, mimeType: "image/jpeg", bytes: big, kind: "photo", uploader }),
    files.put({ name: `${base} (thumbnail).jpg`, mimeType: "image/jpeg", bytes: small, kind: "thumb", uploader }),
  ]);
  return { photoId: photo.id, thumbId: thumb.id };
}

/** Stores a photo taken at return. */
export async function storeReturnPhoto(files: FileStore, bytes: Uint8Array, uploader: string, lineId: string): Promise<string> {
  const big = await full(await normalize(bytes));
  const kind: FileKind = "return";
  return (await files.put({ name: `${lineId} return.jpg`, mimeType: "image/jpeg", bytes: big, kind, uploader })).id;
}
