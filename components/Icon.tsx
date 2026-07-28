import {
  Add,
  AddCircle,
  Activity,
  Archive,
  ArrowDown2,
  ArrowDown3,
  ArrowLeft,
  ArrowLeft3,
  ArrowRight,
  ArrowRight3,
  ArrowUp3,
  ArrowRotateRight,
  Award,
  Book,
  Book1,
  Broom,
  Brush,
  Calendar,
  Chart2,
  ChartSquare,
  Check,
  Clock,
  CloseCircle,
  CloudPlus,
  Coffee,
  Crown1,
  Colorfilter,
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
  GalleryAdd,
  Glass,
  Grid4,
  Headphone,
  Health,
  Heart,
  Home,
  MagicStar,
  MessageEdit,
  Messages,
  Milk,
  MinusCirlce,
  Microphone2,
  Money,
  Moon,
  Note,
  Notification,
  Paperclip,
  Pause,
  Play,
  Profile2User,
  Setting2,
  Smileys,
  Star,
  Sun,
  TaskSquare,
  TickCircle,
  Timer,
  UserCirlceAdd,
  Trash,
  Tree,
  Weight,
  type Icon as IconsaxIcon,
  type IconProps as IconsaxIconProps
} from "iconsax-react-native";
import React from "react";
import { FireIcon } from "./FireIcon";

type IconsaxVariant = NonNullable<IconsaxIconProps["variant"]>;

export type IconWeight = "linear" | "outline" | "thin" | "light" | "regular" | "bold" | "fill" | "duotone" | "bulk";

export type IconName =
  | "activity"
  | "archive"
  | "arrowDown"
  | "arrowLeft"
  | "arrowRight"
  | "arrowUp"
  | "award"
  | "back"
  | "book"
  | "book1"
  | "broom"
  | "brush"
  | "calendar"
  | "chart"
  | "chart2"
  | "check"
  | "checkCircle"
  | "chevronDown"
  | "clock"
  | "colorFilter"
  | "close"
  | "coffee"
  | "drop"
  | "download"
  | "edit"
  | "cloudPlus"
  | "crown1"
  | "elementPlus"
  | "emojiHappy"
  | "emojiNormal"
  | "emojiSad"
  | "eye"
  | "eyeSlash"
  | "facebook"
  | "fire"
  | "forward"
  | "gallery"
  | "glass"
  | "grid"
  | "headphone"
  | "health"
  | "heart"
  | "home"
  | "messageEdit"
  | "messages"
  | "milk"
  | "minusCircle"
  | "microphone"
  | "money"
  | "moon"
  | "note"
  | "attachment"
  | "notifications"
  | "friends"
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
  | "streakFire"
  | "sun"
  | "taskSquare"
  | "timer"
  | "trash"
  | "tree"
  | "trophy"
  | "upload"
  | "userCircleAdd"
  | "weight"
  | "zap";

const iconMap: Record<IconName, IconsaxIcon> = {
  activity: Activity,
  archive: Archive,
  arrowDown: ArrowDown3,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp3,
  award: Award,
  back: ArrowLeft3,
  book: Book,
  book1: Book1,
  broom: Broom,
  brush: Brush,
  calendar: Calendar,
  chart: ChartSquare,
  chart2: Chart2,
  check: Check,
  checkCircle: TickCircle,
  chevronDown: ArrowDown2,
  clock: Clock,
  colorFilter: Colorfilter,
  close: CloseCircle,
  coffee: Coffee,
  drop: Drop,
  download: DocumentDownload,
  edit: Edit,
  cloudPlus: CloudPlus,
  crown1: Crown1,
  elementPlus: ElementPlus,
  emojiHappy: EmojiHappy,
  emojiNormal: EmojiNormal,
  emojiSad: EmojiSad,
  eye: Eye,
  eyeSlash: EyeSlash,
  facebook: Facebook,
  fire: Flashy,
  forward: ArrowRight3,
  gallery: GalleryAdd,
  glass: Glass,
  grid: Grid4,
  headphone: Headphone,
  health: Health,
  heart: Heart,
  home: Home,
  milk: Milk,
  minusCircle: MinusCirlce,
  microphone: Microphone2,
  money: Money,
  moon: Moon,
  note: Note,
  attachment: Paperclip,
  notifications: Notification,
  friends: Profile2User,
  pause: Pause,
  play: Play,
  plus: Add,
  plusCircle: AddCircle,
  plusDashed: AddCircle,
  refresh: ArrowRotateRight,
  settings: Setting2,
  smiley: Smileys,
  sparkle: MagicStar,
  messageEdit: MessageEdit,
  messages: Messages,
  star: Star,
  // Placeholder mapping — "streakFire" short-circuits to the FireIcon SVG in
  // the Icon component and never reaches the iconsax map.
  streakFire: Flashy,
  sun: Sun,
  taskSquare: TaskSquare,
  timer: Timer,
  trash: Trash,
  tree: Tree,
  trophy: Cup,
  upload: DocumentUpload,
  userCircleAdd: UserCirlceAdd,
  weight: Weight,
  zap: Flash
};

export function isIconName(value: string): value is IconName {
  return value in iconMap;
}

const weightVariantMap: Record<IconWeight, IconsaxVariant> = {
  linear: "Linear",
  outline: "Outline",
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
  if (name === "streakFire") {
    return <FireIcon size={typeof size === "number" ? size : 20} />;
  }

  const Component = iconMap[name];

  return <Component {...props} color={color} size={size} variant={weightVariantMap[weight]} />;
}
