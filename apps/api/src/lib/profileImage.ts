import sharp from "sharp";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const formats: Record<string, string> = {
  "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp",
};

export async function normalizeProfileImage(data: Buffer, contentType: string): Promise<Buffer> {
  if (!Buffer.isBuffer(data) || !data.length || data.length > MAX_AVATAR_BYTES || !formats[contentType]) {
    throw new Error("Choose a JPG, PNG or WEBP image up to 5 MB.");
  }
  const image = sharp(data, { limitInputPixels: 25_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (metadata.format !== formats[contentType] || (metadata.pages ?? 1) > 1) {
    throw new Error("Image content must match its type. Animated images are not supported.");
  }
  // Re-encoding strips metadata and prevents serving arbitrary uploaded bytes.
  return image.rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
}
