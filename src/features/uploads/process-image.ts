import "server-only";
import jsQR from "jsqr";
import sharp, { type Metadata } from "sharp";
import { MAX_UPLOAD_BYTES } from "@/lib/config";

export type ImageKind = "listing" | "avatar";

export class ImageRejectedError extends Error {}

type Format = "jpeg" | "png" | "webp" | "heic" | "gif" | "unknown";

/** Identify the real format from magic bytes; never trust the filename or the declared MIME type. */
export function sniffImageFormat(bytes: Uint8Array): Format {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    return "webp";
  }
  if (b.length >= 12 && String.fromCharCode(...b.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (["heic", "heix", "mif1", "msf1", "hevc", "avif"].includes(brand)) return "heic";
  }
  if (b.length >= 4 && String.fromCharCode(...b.slice(0, 4)) === "GIF8") return "gif";
  return "unknown";
}

export type ProcessedImage = {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  /** 16x16 average hash (hex). Equal hashes => near-identical images, used for reuse detection. */
  contentHash: string;
  qrDetected: boolean;
};

const SIZES: Record<ImageKind, { full: number; thumb: number }> = {
  listing: { full: 1600, thumb: 480 },
  avatar: { full: 400, thumb: 96 },
};

/**
 * LIST-03 upload safety: validates size and real format, decodes with a pixel limit (decompression
 * bomb guard), auto-orients, strips ALL metadata (EXIF incl. GPS location) by re-encoding to WebP,
 * creates a thumbnail, computes a perceptual hash and scans for QR codes.
 */
export async function processImage(bytes: Uint8Array, kind: ImageKind): Promise<ProcessedImage> {
  if (bytes.byteLength === 0) throw new ImageRejectedError("The file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageRejectedError(`Photos must be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }
  const format = sniffImageFormat(bytes);
  if (format === "heic") {
    throw new ImageRejectedError("HEIC photos aren't supported. Choose 'Most compatible' in your camera settings or upload a JPEG.");
  }
  if (format === "gif" || format === "unknown") {
    throw new ImageRejectedError("Upload a JPEG, PNG or WebP photo.");
  }

  const input = Buffer.from(bytes);
  const source = () => sharp(input, { limitInputPixels: 40_000_000, failOn: "error" }).rotate();
  let meta: Metadata;
  try {
    meta = await source().metadata();
  } catch {
    throw new ImageRejectedError("That photo couldn't be read. Try a different file.");
  }
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) {
    throw new ImageRejectedError("Photos need to be at least 200 × 200 pixels.");
  }

  const size = SIZES[kind];
  const fit = { fit: "inside" as const, withoutEnlargement: true };
  const [fullResult, thumb, hashPixels, qrPixels] = await Promise.all([
    source().resize({ width: size.full, height: size.full, ...fit }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true }),
    kind === "avatar"
      ? source().resize({ width: size.thumb, height: size.thumb, fit: "cover" }).webp({ quality: 75 }).toBuffer()
      : source().resize({ width: size.thumb, height: size.thumb, ...fit }).webp({ quality: 72 }).toBuffer(),
    source().resize(16, 16, { fit: "fill" }).greyscale().raw().toBuffer(),
    kind === "listing"
      ? source().resize({ width: 1000, height: 1000, ...fit }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      : Promise.resolve(null),
  ]);

  const mean = hashPixels.reduce((sum, v) => sum + v, 0) / hashPixels.length;
  let bits = "";
  for (const value of hashPixels) bits += value >= mean ? "1" : "0";
  const contentHash = (bits.match(/.{4}/g) ?? []).map((nibble) => Number.parseInt(nibble, 2).toString(16)).join("");

  let qrDetected = false;
  if (qrPixels) {
    const data = new Uint8ClampedArray(qrPixels.data.buffer, qrPixels.data.byteOffset, qrPixels.data.byteLength);
    qrDetected = jsQR(data, qrPixels.info.width, qrPixels.info.height, { inversionAttempts: "attemptBoth" }) !== null;
  }

  return {
    full: fullResult.data,
    thumb,
    width: fullResult.info.width,
    height: fullResult.info.height,
    contentHash,
    qrDetected,
  };
}
