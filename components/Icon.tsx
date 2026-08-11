import React from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { TEXT_SIZE_BUMP } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import {
  ArchiveIcon,
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BarbellIcon,
  BellIcon,
  BookIcon,
  BookOpenIcon,
  BrainIcon,
  BookmarkSimpleIcon,
  BroomIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  ChatCircleTextIcon,
  ChatsCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CloudArrowUpIcon,
  CoffeeIcon,
  CrownIcon,
  DotsThreeVerticalIcon,
  DownloadSimpleIcon,
  DropIcon,
  EyeIcon,
  EyeSlashIcon,
  FacebookLogoIcon,
  FootprintsIcon,
  FireIcon as PhosphorFireIcon,
  GearIcon,
  HeadphonesIcon,
  HeartIcon,
  HeartbeatIcon,
  HouseIcon,
  InfoIcon,
  QuestionMarkIcon,
  ImageIcon,
  JarIcon,
  LightningIcon,
  ListChecksIcon,
  LockIcon,
  MedalIcon,
  MicrophoneIcon,
  MinusCircleIcon,
  MoneyIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  NoteIcon,
  PaintBrushIcon,
  PillIcon,
  PaletteIcon,
  PaperclipIcon,
  PauseIcon,
  PencilSimpleIcon,
  PersonSimpleWalkIcon,
  PlayIcon,
  PlusCircleIcon,
  QrCodeIcon,
  PlusIcon,
  PlusSquareIcon,
  PulseIcon,
  SelectionPlusIcon,
  SlidersHorizontalIcon,
  SmileyIcon,
  SmileyWinkIcon,
  SmileyXEyesIcon,
  SmileyMehIcon,
  SmileySadIcon,
  ShuffleIcon,
  SparkleIcon,
  TargetIcon,
  SquaresFourIcon,
  StarIcon,
  SunIcon,
  TimerIcon,
  TrashIcon,
  TreeIcon,
  TrophyIcon,
  UploadSimpleIcon,
  UserCirclePlusIcon,
  UserCircleIcon,
  UserIcon,
  UsersThreeIcon,
  WineIcon,
  XCircleIcon,
  type Icon as PhosphorIcon,
  type IconWeight as PhosphorWeight
} from "phosphor-react-native";
import { FireIcon } from "./FireIcon";

/**
 * Central icon registry, backed by Phosphor.
 *
 * `IconName` values are PERSISTED (a habit stores its icon as one of these
 * strings, see Habit.emoji), so names must never be removed or renamed —
 * only their underlying glyph may change.
 */
export type IconWeight = "linear" | "outline" | "thin" | "light" | "regular" | "bold" | "fill" | "duotone" | "bulk";

export type IconName =
  | "activity"
  | "archive"
  | "bookmark"
  | "lock"
  | "arrowDown"
  | "arrowLeft"
  | "arrowRight"
  | "arrowUp"
  | "award"
  | "back"
  | "book"
  | "brain"
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
  | "dotsThree"
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
  | "footprints"
  | "forward"
  | "gallery"
  | "glass"
  | "grid"
  | "headphone"
  | "health"
  | "heart"
  | "home"
  | "info"
  | "question"
  | "messageEdit"
  | "messages"
  | "milk"
  | "minusCircle"
  | "microphone"
  | "money"
  | "moodGreat"
  | "moodStruggling"
  | "moon"
  | "note"
  | "attachment"
  | "notifications"
  | "friends"
  | "pause"
  | "pill"
  | "play"
  | "plus"
  | "plusCircle"
  | "plusDashed"
  | "qrCode"
  | "refresh"
  | "search"
  | "settings"
  | "shuffle"
  | "sliders"
  | "smiley"
  | "sparkle"
  | "star"
  | "target"
  | "streakFire"
  | "sun"
  | "taskSquare"
  | "timer"
  | "trash"
  | "tree"
  | "trophy"
  | "upload"
  | "user"
  | "walk"
  | "userCircle"
  | "userCircleAdd"
  | "weight"
  | "zap";

const iconMap: Record<IconName, PhosphorIcon> = {
  activity: PulseIcon,
  archive: ArchiveIcon,
  bookmark: BookmarkSimpleIcon,
  lock: LockIcon,
  arrowDown: ArrowDownIcon,
  arrowLeft: ArrowLeftIcon,
  arrowRight: ArrowRightIcon,
  arrowUp: ArrowUpIcon,
  award: MedalIcon,
  back: ArrowLeftIcon,
  book: BookOpenIcon,
  brain: BrainIcon,
  book1: BookIcon,
  broom: BroomIcon,
  brush: PaintBrushIcon,
  calendar: CalendarBlankIcon,
  chart: ChartBarIcon,
  chart2: ChartLineUpIcon,
  check: CheckIcon,
  checkCircle: CheckCircleIcon,
  chevronDown: CaretDownIcon,
  clock: ClockIcon,
  colorFilter: PaletteIcon,
  close: XCircleIcon,
  coffee: CoffeeIcon,
  dotsThree: DotsThreeVerticalIcon,
  drop: DropIcon,
  download: DownloadSimpleIcon,
  edit: PencilSimpleIcon,
  cloudPlus: CloudArrowUpIcon,
  crown1: CrownIcon,
  elementPlus: PlusSquareIcon,
  emojiHappy: SmileyIcon,
  emojiNormal: SmileyMehIcon,
  emojiSad: SmileySadIcon,
  eye: EyeIcon,
  eyeSlash: EyeSlashIcon,
  facebook: FacebookLogoIcon,
  footprints: FootprintsIcon,
  fire: PhosphorFireIcon,
  forward: ArrowRightIcon,
  gallery: ImageIcon,
  glass: WineIcon,
  grid: SquaresFourIcon,
  headphone: HeadphonesIcon,
  health: HeartbeatIcon,
  heart: HeartIcon,
  home: HouseIcon,
  info: InfoIcon,
  question: QuestionMarkIcon,
  // Phosphor has no milk glyph; a jar is the closest honest stand-in.
  milk: JarIcon,
  minusCircle: MinusCircleIcon,
  microphone: MicrophoneIcon,
  money: MoneyIcon,
  moodGreat: SmileyWinkIcon,
  moodStruggling: SmileyXEyesIcon,
  moon: MoonIcon,
  note: NoteIcon,
  attachment: PaperclipIcon,
  notifications: BellIcon,
  friends: UsersThreeIcon,
  pause: PauseIcon,
  pill: PillIcon,
  play: PlayIcon,
  plus: PlusIcon,
  plusCircle: PlusCircleIcon,
  plusDashed: SelectionPlusIcon,
  qrCode: QrCodeIcon,
  refresh: ArrowClockwiseIcon,
  search: MagnifyingGlassIcon,
  settings: GearIcon,
  shuffle: ShuffleIcon,
  sliders: SlidersHorizontalIcon,
  smiley: SmileyIcon,
  sparkle: SparkleIcon,
  target: TargetIcon,
  messageEdit: ChatCircleTextIcon,
  messages: ChatsCircleIcon,
  star: StarIcon,
  // Placeholder mapping — "streakFire" short-circuits to the FireIcon SVG in
  // the Icon component and never reaches this map.
  streakFire: PhosphorFireIcon,
  sun: SunIcon,
  taskSquare: ListChecksIcon,
  timer: TimerIcon,
  trash: TrashIcon,
  tree: TreeIcon,
  trophy: TrophyIcon,
  upload: UploadSimpleIcon,
  user: UserIcon,
  walk: PersonSimpleWalkIcon,
  userCircle: UserCircleIcon,
  userCircleAdd: UserCirclePlusIcon,
  weight: BarbellIcon,
  zap: LightningIcon
};

export function isIconName(value: string): value is IconName {
  return value in iconMap;
}

/**
 * Maps this app's weight vocabulary onto Phosphor's six weights.
 *
 * "bulk" (by far the most-used here) was Iconsax's two-tone style, so it maps
 * to Phosphor's `duotone`. Phosphor's duotone defaults to a fainter 0.2 back
 * layer than Iconsax's, so DUOTONE_OPACITY nudges it back toward the density
 * the app was designed against.
 */
const weightMap: Record<IconWeight, PhosphorWeight> = {
  linear: "regular",
  outline: "regular",
  thin: "thin",
  light: "light",
  regular: "regular",
  bold: "bold",
  fill: "fill",
  duotone: "duotone",
  bulk: "duotone"
};

const DUOTONE_OPACITY = 0.3;

export function Icon({
  name,
  size = 20,
  color,
  weight = "regular",
  style
}: {
  name: IconName;
  size?: number | string;
  color?: string;
  weight?: IconWeight;
  style?: StyleProp<ViewStyle | Omit<TextStyle, "cursor">>;
}) {
  // Icons move with the reader's text size, so a row's glyph never shrinks
  // against the label beside it. Only numeric sizes are liftable — a percentage
  // string is already relative to its container.
  const { settings } = useLumo();
  const bump = TEXT_SIZE_BUMP[settings.textSize] ?? 0;
  const sized = typeof size === "number" ? size + bump : size;

  if (name === "streakFire") {
    return <FireIcon size={typeof sized === "number" ? sized : 20} />;
  }

  const Component = iconMap[name];
  const phosphorWeight = weightMap[weight];

  return (
    <Component
      color={color}
      size={sized}
      weight={phosphorWeight}
      style={style}
      duotoneOpacity={phosphorWeight === "duotone" ? DUOTONE_OPACITY : undefined}
    />
  );
}
