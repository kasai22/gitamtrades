"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, QrCode, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UploadedImage = { id: string; thumbUrl: string | null; qrDetected: boolean };

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_EDGE = 2000;

/** Client-side compression (LIST-03): resize to <= 2000px JPEG before upload to save students' data. */
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type !== "image/png") return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    // Browser can't decode it (e.g. some HEIC files); the server will validate and explain.
    return file;
  }
}

export function ImageUploader({
  images,
  onChange,
  max,
  isTicket,
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  max: number;
  isTicket: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  // Latest images for async upload callbacks (uploads append to it as they finish).
  const latest = useRef(images);
  useEffect(() => {
    latest.current = images;
  }, [images]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = max - latest.current.length - uploading;
    const selected = Array.from(files).slice(0, Math.max(0, room));
    if (selected.length < files.length) toast.warning(`You can add up to ${max} photos.`);
    setUploading((n) => n + selected.length);
    for (const file of selected) {
      try {
        const body = new FormData();
        body.append("file", await compress(file), file.name.replace(/\.[^.]+$/, ".jpg"));
        const response = await fetch("/api/uploads?kind=listing", { method: "POST", body });
        const json = (await response.json().catch(() => ({}))) as { id?: string; thumbUrl?: string; qrDetected?: boolean; error?: string };
        if (!response.ok || !json.id) throw new Error(json.error ?? "Upload failed. Try again.");
        const next = [...latest.current, { id: json.id, thumbUrl: json.thumbUrl ?? null, qrDetected: Boolean(json.qrDetected) }];
        latest.current = next;
        onChange(next);
        if (json.qrDetected) {
          toast.warning(isTicket ? "This photo shows a QR code. Ticket photos can't show QR codes; remove it or cover the code." : "This photo contains a QR code. It will be checked before the listing is shown.");
        }
      } catch (error) {
        toast.error(`${file.name}: ${(error as Error).message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const move = (index: number, delta: number) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4" aria-label="Photos" role="list">
        {images.map((image, index) => (
          <li key={image.id} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
            {image.thumbUrl && <Image src={image.thumbUrl} alt={`Photo ${index + 1}`} fill unoptimized sizes="160px" className="object-cover" />}
            {index === 0 && (
              <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white">
                <Star className="size-3" aria-hidden /> Cover
              </span>
            )}
            {image.qrDetected && (
              <span className="absolute top-1.5 right-1.5 rounded-full bg-warning p-1 text-warning-foreground" title="QR code detected">
                <QrCode className="size-3.5" aria-hidden />
                <span className="sr-only">QR code detected</span>
              </span>
            )}
            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 rounded-lg bg-black/55 p-0.5">
              <Button type="button" size="icon-sm" variant="ghost" className="text-white hover:bg-white/20 hover:text-white" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move photo ${index + 1} earlier`}>
                <ArrowLeft aria-hidden />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" className="text-white hover:bg-white/20 hover:text-white" onClick={() => onChange(images.filter((i) => i.id !== image.id))} aria-label={`Remove photo ${index + 1}`}>
                <Trash2 aria-hidden />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" className="text-white hover:bg-white/20 hover:text-white" disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label={`Move photo ${index + 1} later`}>
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <li key={`uploading-${i}`} className="flex aspect-square items-center justify-center rounded-xl border bg-muted" aria-label="Uploading photo">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          </li>
        ))}
        {images.length + uploading < max && (
          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-sm text-muted-foreground outline-none hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50",
              )}
            >
              <ImagePlus className="size-6" aria-hidden />
              Add photos
            </button>
          </li>
        )}
      </ul>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files)} />
      <p className="text-xs text-muted-foreground">
        Up to {max} photos (JPEG, PNG or WebP, max 8 MB each). The first photo is the cover. We remove location data from photos.
        {isTicket && " Never show the ticket's QR code, barcode or booking code. Ticket listings with photos are checked by the safety team before they're shown; listings without photos publish straight away."}
      </p>
    </div>
  );
}
