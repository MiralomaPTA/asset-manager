"use client";

/**
 * Prepares a photo in the browser before it is sent: iPhone HEIC photos are
 * converted to JPEG, and anything larger than 1600 px is scaled down. That
 * keeps uploads to a few hundred KB, well under Vercel's 4.5 MB request limit.
 */

const MAX_SIDE = 1600;

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function preparePhoto(file: File): Promise<File> {
  let blob: Blob = file;
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    blob = Array.isArray(converted) ? converted[0] : converted;
  } else if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo (JPG, PNG or HEIC).");
  }
  const image = await decode(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.85));
  return new File([jpeg], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
