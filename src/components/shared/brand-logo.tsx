import Image from "next/image";
import { appConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

// Generated from "public/Gitam Marketplace Logo.png" (trimmed, resized). width/height are the largest
// display size (40px tall) so next/image serves small 1x/2x files; CSS height classes scale it down.
const LOGOS = {
  full: { src: "/logo.png", width: 187, height: 40 },
  mark: { src: "/logo-mark.png", width: 80, height: 40 },
} as const;

/**
 * The Gitam Marketplace logo. Size it with a height class (e.g. "h-9"); the width follows.
 * `full` is the mark plus wordmark; `mark` is the infinity/handshake symbol only.
 */
export function BrandLogo({
  variant = "full",
  className,
  eager,
  alt = appConfig.name,
}: {
  variant?: keyof typeof LOGOS;
  className?: string;
  /** Load immediately (above-the-fold logos such as the header). */
  eager?: boolean;
  /** Pass "" when the logo sits next to visible text that already names the app. */
  alt?: string;
}) {
  const logo = LOGOS[variant];
  return (
    <Image
      src={logo.src}
      width={logo.width}
      height={logo.height}
      alt={alt}
      loading={eager ? "eager" : undefined}
      className={cn("h-8 w-auto select-none", className)}
    />
  );
}
