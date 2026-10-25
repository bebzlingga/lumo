import React, { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native"
import { badgeAccent, badgeAccentText, fontFamilies, onArtChrome, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { Icon, IconName, IconWeight } from "./Icon";
import { AppText } from "./ui";
import { Pressable } from "@/components/Pressable"

/**
 * The app's one page header, defined by the Habits screen: an outlined 38pt
 * icon button on each side with the title centred between them. A side with no
 * action still reserves its width, so the title centres on the SCREEN rather
 * than on whatever space is left beside a button.
 *
 * Pass `title` for the standard treatment; `centerContent` is the escape hatch
 * for a header that needs something other than a line of text.
 */
const BUTTON_SIZE = 38;
// 20, not 18: at 18 the glyph sat small inside its 38pt circle and the header
// controls read as fainter than everything they sit above.
const ICON_SIZE = 20;

type ScreenHeaderAction = {
  icon: IconName;
  label: string;
  onPress: () => void;
  iconWeight?: IconWeight;
  iconSize?: number;
  iconColor?: string;
  /**
   * The outline's colour, for a button that is not on the app's own canvas.
   *
   * `palette.hairline` is drawn for cream; over a photograph or an image the
   * ring vanishes. Callers that know what is behind them pass their own.
   */
  borderColor?: string;
  iconStyle?: StyleProp<ViewStyle>;
  /** Count pip on the button's shoulder. Hidden at 0, capped at "9+". */
  badge?: number;
  /**
   * A pip with no number, for "there is something here" rather than "there are
   * three of them".
   *
   * Ignored when `badge` is counting: a dot and a number in the same corner
   * would be two answers to one question.
   */
  dot?: boolean;
  /** The pip's colour. Defaults to the app's badge accent. */
  dotColor?: string;
  /**
   * Content drawn INSTEAD of the glyph — art, an avatar, a badge.
   *
   * Suppresses the button's outline too, because anything passed here brings
   * its own shape and a circle drawn around a hexagon reads as two shapes
   * fighting. `icon` stays required so a caller cannot end up with an action
   * that has no fallback glyph at all.
   */
  render?: ReactNode;
};

/**
 * What the round buttons stand on.
 *
 * `outline` is the app's default — a bare ring on flat canvas, so the controls
 * read as chrome rather than as actions competing with the page's own cards.
 *
 * `pill` is for the pages whose bar sits on backdrop ARTWORK: Home, Move and
 * Friends. On a painted sky a bare ring has nothing behind it, so the glyph is
 * read against whatever the plate happens to be doing at that spot — and the
 * buttons ended up looking fainter than the date pill or tab pill between them,
 * which were already wearing a fill. This gives all three of them the same
 * surface, which is the point: they sit in one bar and should read as one set.
 */
type HeaderButtonSurface = "outline" | "pill";

function HeaderButton({ action, surface }: { action: ScreenHeaderAction; surface: HeaderButtonSurface }) {
  const { palette, isDark } = useLumo();
  const badge = action.badge ?? 0;
  // Not behind `render`: that suppresses the outline because the content brings
  // its own shape, and a fill behind an avatar or a badge is either invisible or
  // a second disc around a disc.
  const filled = surface === "pill" && !action.render;

  return (
    <Pressable
      accessibilityRole="button"
      // The count belongs in the name, not just the picture — a screen reader
      // otherwise announces "Invitations" whether three are waiting or none.
      accessibilityLabel={badge ? `${action.label}, ${badge} pending` : action.label}
      onPress={action.onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.button,
        filled ? styles.buttonFilled : null,
        filled
          ? {
              backgroundColor: alpha(palette.card, onArtChrome.fill),
              // Dropped in dark mode, exactly as the pills do it: the navy has
              // nothing for a soft shadow to catch, so it only muddies the edge.
              shadowColor: isDark ? "transparent" : palette.shadow
            }
          : null,
        { borderColor: action.render ? "transparent" : (action.borderColor ?? palette.hairline), opacity: pressed ? 0.6 : 1 }
      ]}
    >
      <View pointerEvents="none" style={action.iconStyle}>
        {action.render ?? (
          <Icon
            name={action.icon}
            size={action.iconSize ?? ICON_SIZE}
            color={action.iconColor ?? palette.ink}
            weight={action.iconWeight ?? "bold"}
          />
        )}
      </View>
      {badge > 0 ? (
        // The ring in the canvas colour is what keeps the pip legible where it
        // overlaps the button's own outline.
        <View
          pointerEvents="none"
          style={[styles.badge, { backgroundColor: badgeAccent, borderColor: palette.canvas }]}
        >
          <AppText variant="caption" color={badgeAccentText} style={styles.badgeText}>
            {badge > 9 ? "9+" : badge}
          </AppText>
        </View>
      ) : action.dot ? (
        <View pointerEvents="none" style={[styles.dot, { backgroundColor: action.dotColor ?? badgeAccent }]} />
      ) : null}
    </Pressable>
  );
}

export function ScreenHeader({
  title,
  centerContent,
  centerLabel,
  onCenterPress,
  leftAction,
  rightAction,
  rightActions,
  buttonSurface = "outline",
  style
}: {
  /** Standard centred page title. Ignored when `centerContent` is given. */
  title?: string;
  centerContent?: ReactNode;
  centerLabel?: string;
  onCenterPress?: () => void;
  leftAction?: ScreenHeaderAction;
  rightAction?: ScreenHeaderAction;
  rightActions?: ScreenHeaderAction[];
  /** What the round buttons stand on — see `HeaderButtonSurface`. */
  buttonSurface?: HeaderButtonSurface;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useLumo();
  const resolvedRightActions = rightActions ?? (rightAction ? [rightAction] : []);
  // Both sides reserve the same width so the centre stays centred, even when
  // one side holds two buttons and the other none.
  const sideWidth =
    resolvedRightActions.length > 1
      ? resolvedRightActions.length * BUTTON_SIZE + (resolvedRightActions.length - 1) * spacing.sm
      : BUTTON_SIZE;
  const center =
    centerContent ??
    (title ? (
      <AppText color={palette.ink} numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
    ) : null);

  return (
    <View style={[styles.header, style]}>
      <View style={[styles.sideSlot, { width: sideWidth }]}>
        {leftAction ? <HeaderButton action={leftAction} surface={buttonSurface} /> : null}
      </View>
      {onCenterPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={centerLabel}
          onPress={onCenterPress}
          style={({ pressed }) => [styles.centerContent, { opacity: pressed ? 0.7 : 1 }]}
        >
          {center}
        </Pressable>
      ) : (
        /**
         * `none` for a plain TITLE — a word in the middle of the bar should
         * never swallow a touch meant for something behind it.
         *
         * But `centerContent` may be a control (the Move screen puts its
         * Today/Overall tabs here), and blocking pointers on that makes it
         * render perfectly and do nothing. So the block applies only when there
         * is nothing interactive to block.
         */
        <View pointerEvents={centerContent ? "box-none" : "none"} style={styles.centerContent}>
          {center}
        </View>
      )}
      <View style={[styles.sideSlot, styles.rightSlot, { width: sideWidth }]}>
        {resolvedRightActions.map((action) => (
          <HeaderButton key={action.label} action={action} surface={buttonSurface} />
        ))}
      </View>
    </View>
  );
}

/**
 * The marker `Screen` looks for to pin this bar above its scroller.
 *
 * A flag on the component rather than an import, because `ScreenHeader` already
 * imports `AppText` from `ui` — reading a property off the element's type lets
 * `Screen` recognise a header without the two files importing each other.
 */
ScreenHeader.isPageHeader = true;

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  sideSlot: {
    height: BUTTON_SIZE,
    justifyContent: "center"
  },
  rightSlot: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm
  },
  centerContent: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontFamily: fontFamilies.serifBlack,
    fontSize: 19,
    lineHeight: 25
  },
  // Outlined circle — no fill, so it reads as chrome rather than an action
  // competing with the page's own cards. The `pill` surface adds one, for the
  // pages whose bar stands on artwork; see `HeaderButtonSurface`.
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  // Geometry only — the fill and the shadow's colour come from the palette at
  // the use site, which is also where dark mode drops the shadow.
  buttonFilled: onArtChrome.shadow,
  // Overhangs the circle deliberately — tucked inside, it reads as part of the
  // glyph rather than as a count attached to the button.
  // Same corner as the counted pip, without the room for a number — so a screen
  // that has both never shifts its buttons. No ring: the pip sits on the
  // button's shoulder, clear of the outline, so it needs nothing to separate it.
  dot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: radius.pill
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  badgeText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 10,
    lineHeight: 13
  }
});
