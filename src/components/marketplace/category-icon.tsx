import {
  Armchair,
  Bike,
  BookOpen,
  Camera,
  Dumbbell,
  Gamepad2,
  Headphones,
  LampDesk,
  Laptop,
  Music,
  Package,
  Palette,
  Shirt,
  Smartphone,
  Ticket,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  laptop: Laptop,
  smartphone: Smartphone,
  headphones: Headphones,
  "book-open": BookOpen,
  armchair: Armchair,
  "lamp-desk": LampDesk,
  shirt: Shirt,
  bike: Bike,
  dumbbell: Dumbbell,
  ticket: Ticket,
  "gamepad-2": Gamepad2,
  music: Music,
  camera: Camera,
  utensils: Utensils,
  palette: Palette,
  wrench: Wrench,
  package: Package,
} satisfies Record<string, LucideIcon>;

/** Icons an admin can assign to a category (validated server-side before saving). */
export const CATEGORY_ICON_NAMES = Object.keys(ICONS) as [keyof typeof ICONS, ...(keyof typeof ICONS)[]];

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = (ICONS as Record<string, LucideIcon>)[icon] ?? Package;
  return <Icon className={className} aria-hidden />;
}
