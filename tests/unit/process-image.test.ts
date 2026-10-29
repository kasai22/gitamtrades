import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageRejectedError, processImage, sniffImageFormat } from "@/features/uploads/process-image";

const solid = (width = 800, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 110 } } });

describe("image upload safety (LIST-03)", () => {
  it("identifies formats by magic bytes, not by name", async () => {
    expect(sniffImageFormat(new Uint8Array(await solid().jpeg().toBuffer()))).toBe("jpeg");
    expect(sniffImageFormat(new Uint8Array(await solid().png().toBuffer()))).toBe("png");
    expect(sniffImageFormat(new Uint8Array(await solid().webp().toBuffer()))).toBe("webp");
    expect(sniffImageFormat(new TextEncoder().encode("<svg onload=alert(1)>"))).toBe("unknown");
  });

  it("rejects unsupported, empty and tiny files with actionable messages", async () => {
    await expect(processImage(new TextEncoder().encode("GIF89a........"), "listing")).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(processImage(new Uint8Array(), "listing")).rejects.toBeInstanceOf(ImageRejectedError);
    const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);
    await expect(processImage(heic, "listing")).rejects.toThrow(/HEIC/);
    await expect(processImage(new Uint8Array(await solid(100, 100).jpeg().toBuffer()), "listing")).rejects.toThrow(/200 × 200/);
  });

  it("re-encodes to WebP, resizes and strips EXIF metadata (including GPS)", async () => {
    const withExif = await solid(3000, 2000)
      .jpeg()
      .withExif({ IFD0: { Artist: "Student", Copyright: "GPS 17.7N 83.3E" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const result = await processImage(new Uint8Array(withExif), "listing");
    const meta = await sharp(result.full).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
    expect(meta.exif).toBeUndefined();
    expect((await sharp(result.thumb).metadata()).width).toBeLessThanOrEqual(480);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same perceptual hash for a re-compressed copy", async () => {
    const original = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#fff" } })
      .composite([{ input: await solid(300, 300).png().toBuffer(), left: 0, top: 0 }])
      .png()
      .toBuffer();
    const recompressed = await sharp(original).jpeg({ quality: 60 }).toBuffer();
    const [a, b] = await Promise.all([processImage(new Uint8Array(original), "listing"), processImage(new Uint8Array(recompressed), "listing")]);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("detects QR codes in photos (ticket QR guardrail)", async () => {
    const qr = await QRCode.toBuffer("https://tickets.example/redeem/ABC123XYZ", { width: 600, margin: 4 });
    expect((await processImage(new Uint8Array(qr), "listing")).qrDetected).toBe(true);
    expect((await processImage(new Uint8Array(await solid().jpeg().toBuffer()), "listing")).qrDetected).toBe(false);
  });
});
