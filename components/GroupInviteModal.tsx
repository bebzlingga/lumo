import React from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Pressable } from "@/components/Pressable";
import { AppText } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import type { Friendship } from "@/lib/friends";

function InviteRowButton({ name, invited, onPress }: { name: string; invited: boolean; onPress: () => void }) {
  const { palette, isDark } = useLumo();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={invited ? `${name} invited` : `Invite ${name}`}
      accessibilityState={{ disabled: invited }}
      disabled={invited}
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowButton,
        {
          backgroundColor: invited ? alpha(palette.greenDark, "14") : isDark ? palette.green : palette.greenDark,
          opacity: pressed ? 0.8 : 1
        }
      ]}
    >
      <AppText variant="caption" color={invited ? palette.greenDark : palette.white} style={styles.rowButtonText}>
        {invited ? "Invited" : "Invite"}
      </AppText>
    </Pressable>
  );
}

/** Pick friends to invite into the group. Each row keeps its own sent state, so
 *  the sheet stays open while you work through the list. */
export function GroupInviteModal({
  visible,
  friends,
  hasFriends,
  isInvited,
  onInvite,
  onClose
}: {
  visible: boolean;
  /** Friends who aren't members yet. */
  friends: Friendship[];
  /** Whether the user has any friends at all — separates "all already in" from
   *  "nobody to invite yet". */
  hasFriends: boolean;
  isInvited: (lumoId: string) => boolean;
  onInvite: (friend: Friendship) => void;
  onClose: () => void;
}) {
  const { palette, isDark } = useLumo();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
        <View style={[styles.card, { backgroundColor: palette.card }]}>
          <AppText variant="titleSmall" color={palette.ink} style={styles.title}>
            Invite friends
          </AppText>
          <AppText variant="caption" color={palette.subtle} style={styles.hint}>
            They'll get an invitation on their profile to accept or decline.
          </AppText>

          {friends.length ? (
            // Bounded, so a long friends list can't push the Done button off
            // the bottom of the sheet.
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {friends.map((friend, index) => (
                <View
                  key={friend.profile.lumoId}
                  style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
                >
                  <Avatar config={friend.profile.avatar ?? defaultAvatar()} size={42} />
                  <View style={styles.text}>
                    <AppText variant="titleSmall" color={palette.ink} numberOfLines={1} style={styles.name}>
                      {friend.profile.nickname || "Lumo user"}
                    </AppText>
                    <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.id}>
                      {friend.profile.lumoId}
                    </AppText>
                  </View>
                  <InviteRowButton
                    name={friend.profile.nickname || "friend"}
                    invited={isInvited(friend.profile.lumoId)}
                    onPress={() => onInvite(friend)}
                  />
                </View>
              ))}
            </ScrollView>
          ) : (
            <AppText variant="caption" color={palette.subtle} style={styles.empty}>
              {hasFriends
                ? "All of your friends are already in this group."
                : "No friends to invite yet — add friends from the Friends tab first."}
            </AppText>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={onClose}
            style={({ pressed }) => [styles.done, { backgroundColor: isDark ? palette.green : palette.greenDark, opacity: pressed ? 0.85 : 1 }]}
          >
            <AppText variant="button" color={palette.white}>
              Done
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  card: {
    width: "100%",
    gap: spacing.sm,
    borderRadius: radius.dialog,
    padding: spacing.xl
  },
  title: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 20,
    lineHeight: 26
  },
  hint: {
    lineHeight: 17,
    opacity: 0.8,
    marginTop: -spacing.xs
  },
  list: {
    maxHeight: 320
  },
  listContent: {
    paddingVertical: spacing.xxs
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  name: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  id: {
    fontFamily: fontFamilies.lexend
  },
  empty: {
    lineHeight: 17,
    opacity: 0.8,
    paddingVertical: spacing.sm
  },
  rowButton: {
    minHeight: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm
  },
  rowButtonText: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  done: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    marginTop: spacing.xxs
  }
});
