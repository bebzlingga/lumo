import React from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { TEXT_SIZE_BUMP } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
// One module per icon, not the barrel: the package index re-exports all 1,512
// icons and Metro does not tree-shake, so a barrel import shipped every one.
import { ArchiveIcon } from "phosphor-react-native/src/icons/Archive";
import { ArrowClockwiseIcon } from "phosphor-react-native/src/icons/ArrowClockwise";
import { ArrowDownIcon } from "phosphor-react-native/src/icons/ArrowDown";
import { ArrowLeftIcon } from "phosphor-react-native/src/icons/ArrowLeft";
import { ArrowRightIcon } from "phosphor-react-native/src/icons/ArrowRight";
import { ArrowUpIcon } from "phosphor-react-native/src/icons/ArrowUp";
import { BarbellIcon } from "phosphor-react-native/src/icons/Barbell";
import { BellIcon } from "phosphor-react-native/src/icons/Bell";
import { BookIcon } from "phosphor-react-native/src/icons/Book";
import { BookOpenIcon } from "phosphor-react-native/src/icons/BookOpen";
import { BrainIcon } from "phosphor-react-native/src/icons/Brain";
import { BookmarkSimpleIcon } from "phosphor-react-native/src/icons/BookmarkSimple";
import { BroomIcon } from "phosphor-react-native/src/icons/Broom";
import { CalendarBlankIcon } from "phosphor-react-native/src/icons/CalendarBlank";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { ChartBarIcon } from "phosphor-react-native/src/icons/ChartBar";
import { ChartLineUpIcon } from "phosphor-react-native/src/icons/ChartLineUp";
import { ChatCircleTextIcon } from "phosphor-react-native/src/icons/ChatCircleText";
import { ChatsCircleIcon } from "phosphor-react-native/src/icons/ChatsCircle";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { CirclesThreePlusIcon } from "phosphor-react-native/src/icons/CirclesThreePlus";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { ClockIcon } from "phosphor-react-native/src/icons/Clock";
import { CloudArrowUpIcon } from "phosphor-react-native/src/icons/CloudArrowUp";
import { CoffeeIcon } from "phosphor-react-native/src/icons/Coffee";
import { CrownIcon } from "phosphor-react-native/src/icons/Crown";
import { DotsThreeVerticalIcon } from "phosphor-react-native/src/icons/DotsThreeVertical";
import { DownloadSimpleIcon } from "phosphor-react-native/src/icons/DownloadSimple";
import { DropIcon } from "phosphor-react-native/src/icons/Drop";
import { EyeIcon } from "phosphor-react-native/src/icons/Eye";
import { EyeSlashIcon } from "phosphor-react-native/src/icons/EyeSlash";
import { FacebookLogoIcon } from "phosphor-react-native/src/icons/FacebookLogo";
import { FootprintsIcon } from "phosphor-react-native/src/icons/Footprints";
import { FireIcon as PhosphorFireIcon } from "phosphor-react-native/src/icons/Fire";
import { GearIcon } from "phosphor-react-native/src/icons/Gear";
import { HeadphonesIcon } from "phosphor-react-native/src/icons/Headphones";
import { HeartIcon } from "phosphor-react-native/src/icons/Heart";
import { HeartbeatIcon } from "phosphor-react-native/src/icons/Heartbeat";
import { HouseIcon } from "phosphor-react-native/src/icons/House";
import { InfoIcon } from "phosphor-react-native/src/icons/Info";
import { QuestionMarkIcon } from "phosphor-react-native/src/icons/QuestionMark";
import { ImageIcon } from "phosphor-react-native/src/icons/Image";
import { JarIcon } from "phosphor-react-native/src/icons/Jar";
import { LightningIcon } from "phosphor-react-native/src/icons/Lightning";
import { ListChecksIcon } from "phosphor-react-native/src/icons/ListChecks";
import { LockIcon } from "phosphor-react-native/src/icons/Lock";
import { MedalIcon } from "phosphor-react-native/src/icons/Medal";
import { MicrophoneIcon } from "phosphor-react-native/src/icons/Microphone";
import { MinusCircleIcon } from "phosphor-react-native/src/icons/MinusCircle";
import { MoneyIcon } from "phosphor-react-native/src/icons/Money";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";
import { MoonIcon } from "phosphor-react-native/src/icons/Moon";
import { NoteIcon } from "phosphor-react-native/src/icons/Note";
import { PaintBrushIcon } from "phosphor-react-native/src/icons/PaintBrush";
import { PillIcon } from "phosphor-react-native/src/icons/Pill";
import { PaletteIcon } from "phosphor-react-native/src/icons/Palette";
import { PaperclipIcon } from "phosphor-react-native/src/icons/Paperclip";
import { PauseIcon } from "phosphor-react-native/src/icons/Pause";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";
import { PersonSimpleWalkIcon } from "phosphor-react-native/src/icons/PersonSimpleWalk";
import { PlayIcon } from "phosphor-react-native/src/icons/Play";
import { PlusCircleIcon } from "phosphor-react-native/src/icons/PlusCircle";
import { QrCodeIcon } from "phosphor-react-native/src/icons/QrCode";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { PlusSquareIcon } from "phosphor-react-native/src/icons/PlusSquare";
import { PulseIcon } from "phosphor-react-native/src/icons/Pulse";
import { SelectionPlusIcon } from "phosphor-react-native/src/icons/SelectionPlus";
import { SlidersHorizontalIcon } from "phosphor-react-native/src/icons/SlidersHorizontal";
import { SmileyIcon } from "phosphor-react-native/src/icons/Smiley";
import { SmileyWinkIcon } from "phosphor-react-native/src/icons/SmileyWink";
import { SmileyXEyesIcon } from "phosphor-react-native/src/icons/SmileyXEyes";
import { SmileyMehIcon } from "phosphor-react-native/src/icons/SmileyMeh";
import { SmileySadIcon } from "phosphor-react-native/src/icons/SmileySad";
import { ShuffleIcon } from "phosphor-react-native/src/icons/Shuffle";
import { SparkleIcon } from "phosphor-react-native/src/icons/Sparkle";
import { TargetIcon } from "phosphor-react-native/src/icons/Target";
import { SquaresFourIcon } from "phosphor-react-native/src/icons/SquaresFour";
import { StarIcon } from "phosphor-react-native/src/icons/Star";
import { SunIcon } from "phosphor-react-native/src/icons/Sun";
import { TimerIcon } from "phosphor-react-native/src/icons/Timer";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { TreeIcon } from "phosphor-react-native/src/icons/Tree";
import { TrophyIcon } from "phosphor-react-native/src/icons/Trophy";
import { ShareFatIcon } from "phosphor-react-native/src/icons/ShareFat";
import { UploadSimpleIcon } from "phosphor-react-native/src/icons/UploadSimple";
import { UserCirclePlusIcon } from "phosphor-react-native/src/icons/UserCirclePlus";
import { UserCircleIcon } from "phosphor-react-native/src/icons/UserCircle";
import { UserIcon } from "phosphor-react-native/src/icons/User";
import { UsersThreeIcon } from "phosphor-react-native/src/icons/UsersThree";
import { WineIcon } from "phosphor-react-native/src/icons/Wine";
import { XCircleIcon } from "phosphor-react-native/src/icons/XCircle";
import type { Icon as PhosphorIcon, IconWeight as PhosphorWeight } from "phosphor-react-native";
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
  | "circlesThreePlus"
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
  | "share"
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
  circlesThreePlus: CirclesThreePlusIcon,
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
  share: ShareFatIcon,
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
/** A 0.3 back layer all but vanishes on the near-black canvas. */
const DUOTONE_OPACITY_DARK = 0.45;

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
  const { settings, isDark, palette } = useLumo();
  // Dark mode lifts the two dim greys a step — muted → subtle, subtle → body —
  // here rather than at ~40 call sites; a grey glyph on near-black reads dimmer
  // than grey text of the same value.
  const tone = isDark ? (color === palette.muted ? palette.subtle : color === palette.subtle ? palette.body : color) : color;
  const bump = TEXT_SIZE_BUMP[settings.textSize] ?? 0;
  const sized = typeof size === "number" ? size + bump : size;

  if (name === "streakFire") {
    return <FireIcon size={typeof sized === "number" ? sized : 20} />;
  }

  const Component = iconMap[name];
  const phosphorWeight = weightMap[weight];

  return (
    <Component
      color={tone}
      size={sized}
      weight={phosphorWeight}
      style={style}
      duotoneOpacity={phosphorWeight === "duotone" ? (isDark ? DUOTONE_OPACITY_DARK : DUOTONE_OPACITY) : undefined}
    />
  );
}
