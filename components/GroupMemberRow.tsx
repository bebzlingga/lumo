import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { FireIcon } from "@/components/FireIcon";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import type { GroupMember } from "@/lib/friends";

// Weekly MVP crown — gold in both themes.
export const CROWN_GOLD = "#F0B429";

function ActionButton({
  label,
  icon,
  tint,
  dimmed = false,
  onPress
}: {
  label: string;
  icon: React.ReactNode;
  tint: string;
  dimmed?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, { backgroundColor: tint, opacity: pressed ? 0.7 : dimmed ? 0.5 : 1 }]}
    >
      {icon}
    </Pressable>
  );
}

/**
 * A member row in the Team tab. For the group owner, a long press on the
 * avatar/name asks to remove that member; the dialog it raises is what actually
 * confirms it. Only the membership goes — their history stays and returns if
 * they're re-added.
 *
 * A plain long press, not the 1.5s armed hold with a filling ring this row used
 * to use: that made the gesture its own confirmation, so removing somebody
 * meant clearing two gates, and holding still for a second and a half inside a
 * scroll view is easy to lose to a stray finger. The dialog is the gate.
 */
export function GroupMemberRow({
  member,
  index,
  isLast,
  isMvp,
  cheers,
  isSelf,
  canRemove,
  outOfCheers,
  onNudge,
  onCheer,
  onRemove
}: {
  member: GroupMember;
  index: number;
  isLast: boolean;
  isMvp: boolean;
  cheers: number;
  isSelf: boolean;
  canRemove: boolean;
  outOfCheers: boolean;
  onNudge: () => void;
  onCheer: () => void;
  onRemove: () => void;
}) {
  const { palette } = useLumo();
  const name = member.profile.nickname || "Lumo user";

  // The warning buzz lands with the dialog, not with the removal — it is the
  // cue that the long press registered and something destructive is being
  // asked, which is exactly when the finger is still down.
  function handleLongPress() {
    if (!canRemove) {
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    onRemove();
  }

  return (
    <View
      style={[
        styles.row,
        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
        index === 0 && styles.rowFirst,
        isLast && styles.rowLast
      ]}
    >
      <AppText variant="caption" color={palette.muted} style={styles.rank}>
        {index + 1}
      </AppText>
      <Pressable
        disabled={!canRemove}
        onLongPress={handleLongPress}
        accessibilityRole={canRemove ? "button" : undefined}
        accessibilityLabel={canRemove ? `Remove ${name} from the group` : undefined}
        accessibilityHint={canRemove ? "Press and hold, then confirm" : undefined}
        style={({ pressed }) => [styles.pressArea, canRemove && pressed && styles.pressAreaHeld]}
      >
        {/* Circular at full size — the portrait carries its own backdrop, so
            clipping it round IS the disc (the rule the Friends list follows). */}
        <Avatar config={member.profile.avatar ?? defaultAvatar()} size={42} />
        <View style={styles.text}>
          <View style={styles.nameRow}>
            <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.name}>
              {isSelf ? "You" : name}
            </AppText>
            {isMvp ? <Icon name="crown1" size={14} color={CROWN_GOLD} weight="bulk" /> : null}
          </View>
          <View style={styles.metaRow}>
            <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.meta}>
              {member.contribution} {member.contribution === 1 ? "completion" : "completions"}
            </AppText>
            {cheers > 0 ? (
              <>
                <FireIcon size={10} />
                <AppText variant="caption" color={palette.subtle} style={styles.meta}>
                  ×{cheers}
                </AppText>
              </>
            ) : null}
          </View>
        </View>
      </Pressable>
      {!isSelf ? (
        <View style={styles.actions}>
          {!member.checkedInToday ? (
            <ActionButton
              label={`Nudge ${name}`}
              tint={alpha(palette.greenDark, "14")}
              icon={<Icon name="messages" size={16} color={palette.greenDark} weight="bulk" />}
              onPress={onNudge}
            />
          ) : null}
          <ActionButton
            label={`Cheer ${name}`}
            tint={alpha(palette.glow, "33")}
            dimmed={outOfCheers}
            icon={<FireIcon size={16} />}
            onPress={onCheer}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  rowFirst: {
    paddingTop: 0
  },
  rowLast: {
    paddingBottom: 0
  },
  rank: {
    width: 16,
    fontFamily: fontFamilies.lexendBold,
    textAlign: "center"
  },
  pressArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  // Owner-only, and only while the finger is down: the one hint that this half
  // of the row answers to a press at all. Light — it marks the touch, it is not
  // the removal happening.
  pressAreaHeld: {
    opacity: 0.6
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs
  },
  name: {
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  meta: {
    fontFamily: fontFamilies.lexend
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  }
});
