import { useRouter } from "expo-router";
import React from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { MoveOptionGroup, MoveOptionRow } from "@/components/move/MoveOptionRow";
import { useMoveAccent } from "@/components/move/ChallengeUI";
import { Pressable } from "@/components/Pressable";
import { EmptyState } from "@/components/states";
import { AppText, Button, LumoInput } from "@/components/ui";
import { radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import type { Friendship } from "@/lib/friends";

/**
 * Choosing who is coming along.
 *
 * A dialog rather than a list on the page, so the card behind it stays a roster
 * of the people you picked rather than a scroll of everyone you know. Search
 * included: past a dozen friends the list alone stops being pickable.
 *
 * Shared by the challenge flow and the plain-move flow. It was written for the
 * first and copied for the second for about an hour, which is exactly how two
 * pickers end up disagreeing about what a tick means.
 *
 * Holds a DRAFT internally: ticking through a list is not the same act as
 * inviting somebody, so nothing is committed until Done — and dismissing the
 * sheet costs nothing.
 */
export function MoveFriendPicker({
  visible,
  /** Null while loading, so an empty list is not mistaken for "no friends". */
  friends,
  picked,
  /**
   * Friends who cannot be picked, and why, keyed by profile id.
   *
   * Absent means available: an offline lookup returns nothing and should fail
   * open rather than block somebody from inviting a free friend.
   */
  unavailable,
  onClose,
  onDone
}: {
  visible: boolean;
  friends: Friendship[] | null;
  picked: string[];
  unavailable?: Map<string, string>;
  onClose: () => void;
  onDone: (picked: string[]) => void;
}) {
  const router = useRouter();
  const { palette } = useLumo();
  const accent = useMoveAccent();

  const [draft, setDraft] = React.useState<string[]>(picked);
  const [query, setQuery] = React.useState("");

  // Re-seeded each time it opens, so a dismissed sheet leaves no half-made
  // selection behind for the next one to inherit.
  React.useEffect(() => {
    if (visible) {
      setDraft(picked);
      setQuery("");
    }
  }, [visible]);

  const searchable = (friends ?? []).filter((entry) => {
    const name = entry.profile.nickname || entry.profile.lumoId;

    return name.toLowerCase().includes(query.trim().toLowerCase());
  });

  function toggle(id: string) {
    setDraft((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.card, { backgroundColor: palette.card }]}>
          {friends && friends.length > 0 ? (
            // `surface`, not the input's default `card`: the dialog itself is a
            // card, and a field the same colour as the sheet behind it reads as
            // a label rather than something to type in.
            <LumoInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search friends…"
              autoCapitalize="none"
              style={{ backgroundColor: palette.surface }}
            />
          ) : null}

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {friends === null ? null : friends.length === 0 ? (
              <>
                <EmptyState icon="friends" title="No friends yet" body="Add a friend in Lumo and you can head out together." />
                <Button
                  label="Find Friends"
                  icon="userCircleAdd"
                  variant="ghost"
                  onPress={() => {
                    onClose();
                    router.push("/friends");
                  }}
                />
              </>
            ) : searchable.length === 0 ? (
              <EmptyState icon="search" title="Nobody by that name" body="Try a different search." />
            ) : (
              <MoveOptionGroup flush>
                {searchable.map((friend, index) => {
                  const id = friend.profile.id as string;
                  const blocked = unavailable?.get(id);
                  const isPicked = draft.includes(id) && !blocked;

                  return (
                    <MoveOptionRow
                      key={id}
                      title={friend.profile.nickname || friend.profile.lumoId}
                      // The Lumo ID stays put when picked: the tick already says
                      // they are in, and swapping the line underneath moves the
                      // one piece of information that tells two friends with the
                      // same first name apart.
                      subtitle={blocked ?? friend.profile.lumoId}
                      selected={isPicked}
                      disabled={Boolean(blocked)}
                      flush
                      onPress={() => toggle(id)}
                      last={index === searchable.length - 1}
                      leading={<Avatar config={friend.profile.avatar} size={44} />}
                      trailing={
                        <View
                          style={[
                            styles.check,
                            isPicked ? { backgroundColor: palette.greenDark, borderColor: palette.greenDark } : { borderColor: palette.hairline }
                          ]}
                        >
                          {isPicked ? <Icon name="check" size={11} color={palette.white} weight="bold" /> : null}
                        </View>
                      }
                    />
                  );
                })}
              </MoveOptionGroup>
            )}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={() => onDone(draft)}
            style={({ pressed }) => [styles.done, { backgroundColor: accent.primary, opacity: pressed ? 0.85 : 1 }]}
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
  scrim: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  // `radius.dialog` and an spacing.xl inset — the geometry every dialog in the
  // app shares, so a Lumo sheet is one shape wherever it opens.
  card: {
    maxHeight: "80%",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.dialog
  },
  list: {
    flexGrow: 0
  },
  done: {
    alignSelf: "flex-end",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill
  },
  check: {
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2
  }
});
