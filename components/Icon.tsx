import {
  Add,
  AddCircle,
  Activity,
  Archive,
  ArrowDown2,
  ArrowLeft3,
  ArrowRotateRight,
  Award,
  Book,
  Broom,
  Brush,
  Calendar,
  ChartSquare,
  Check,
  Clock,
  CloseCircle,
  Coffee,
  Cup,
  DocumentDownload,
  DocumentUpload,
  Drop,
  Edit,
  ElementPlus,
  EmojiHappy,
  EmojiNormal,
  EmojiSad,
  Eye,
  EyeSlash,
  Facebook,
  Flash,
  Flashy,
  Glass,
  Grid4,
  Headphone,
  Health,
  Heart,
  Home,
  MagicStar,
  Milk,
  MinusCirlce,
  Money,
  Moon,
  Note,
  Notification,
  Pause,
  Play,
  Setting3,
  Smileys,
  Star,
  Sun,
  TaskSquare,
  TickCircle,
  Timer,
  Trash,
  Tree,
  Weight,
  type Icon as IconsaxIcon,
  type IconProps as IconsaxIconProps
} from "iconsax-react-native";
import React from "react";

type IconsaxVariant = NonNullable<IconsaxIconProps["variant"]>;

export type IconWeight = "linear" | "thin" | "light" | "regular" | "bold" | "fill" | "duotone" | "bulk";

export type IconName =
  | "activity"
  | "archive"
  | "award"
  | "back"
  | "book"
  | "broom"
  | "brush"
  | "calendar"
  | "chart"
  | "check"
  | "checkCircle"
  | "chevronDown"
  | "clock"
  | "close"
  | "coffee"
  | "drop"
  | "download"
  | "edit"
  | "elementPlus"
  | "emojiHappy"
  | "emojiNormal"
  | "emojiSad"
  | "eye"
  | "eyeSlash"
  | "facebook"
  | "fire"
  | "glass"
  | "grid"
  | "headphone"
  | "health"
  | "heart"
  | "home"
  | "milk"
  | "minusCircle"
  | "money"
  | "moon"
  | "note"
  | "notifications"
  | "pause"
  | "play"
  | "plus"
  | "plusCircle"
  | "plusDashed"
  | "refresh"
  | "settings"
  | "smiley"
  | "sparkle"
  | "star"
  | "sun"
  | "taskSquare"
  | "timer"
  | "trash"
  | "tree"
  | "trophy"
  | "upload"
  | "weight"
  | "zap";

const iconMap: Record<IconName, IconsaxIcon> = {
  activity: Activity,
  archive: Archive,
  award: Award,
  back: ArrowLeft3,
  book: Book,
  broom: Broom,
  brush: Brush,
  calendar: Calendar,
  chart: ChartSquare,
  check: Check,
  checkCircle: TickCircle,
  chevronDown: ArrowDown2,
  clock: Clock,
  close: CloseCircle,
  coffee: Coffee,
  drop: Drop,
  download: DocumentDownload,
  edit: Edit,
  elementPlus: ElementPlus,
  emojiHappy: EmojiHappy,
  emojiNormal: EmojiNormal,
  emojiSad: EmojiSad,
  eye: Eye,
  eyeSlash: EyeSlash,
  facebook: Facebook,
  fire: Flashy,
  glass: Glass,
  grid: Grid4,
  headphone: Headphone,
  health: Health,
  heart: Heart,
  home: Home,
  milk: Milk,
  minusCircle: MinusCirlce,
  money: Money,
  moon: Moon,
  note: Note,
  notifications: Notification,
  pause: Pause,
  play: Play,
  plus: Add,
  plusCircle: AddCircle,
  plusDashed: AddCircle,
  refresh: ArrowRotateRight,
  settings: Setting3,
  smiley: Smileys,
  sparkle: MagicStar,
  star: Star,
  sun: Sun,
  taskSquare: TaskSquare,
  timer: Timer,
  trash: Trash,
  tree: Tree,
  trophy: Cup,
  upload: DocumentUpload,
  weight: Weight,
  zap: Flash
};

export function isIconName(value: string): value is IconName {
  return value in iconMap;
}

const weightVariantMap: Record<IconWeight, IconsaxVariant> = {
  linear: "Linear",
  thin: "TwoTone",
  light: "TwoTone",
  regular: "TwoTone",
  bold: "TwoTone",
  fill: "TwoTone",
  duotone: "TwoTone",
  bulk: "Bulk"
};

export function Icon({
  name,
  size = 20,
  color,
  weight = "regular",
  ...props
}: Omit<IconsaxIconProps, "variant"> & {
  name: IconName;
  weight?: IconWeight;
}) {
  const Component = iconMap[name];

  return <Component {...props} color={color} size={size} variant={weightVariantMap[weight]} />;
}
