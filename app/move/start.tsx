import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { MoveSummaryCard, useMoveAccent } from "@/components/move/ChallengeUI";
import { MoveFriendPicker } from "@/components/move/MoveFriendPicker";
import { MoveOptionGroup, MoveOptionRow } from "@/components/move/MoveOptionRow";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Button, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { useMove } from "@/context/MoveContext";
import { friendsService, type Friendship } from "@/lib/friends";
import { findFamily } from "@/lib/move/challengeDefs";

/**
 * Setting out on an ordinary move.
 *
 * Deliberately the same shape as the challenge screen — a route to choose, a
 * roster underneath it when the route needs one, one button at the foot — even
 * though there is no target and no badge at the end of it. Somebody who has
 * started a challenge already knows how this page works.
 *
 * ## What "bring friends" does, and what it does not
 *
 * It records who you set out with, and their names travel with the activity to
 * the live screen and the summary. It does **not** notify them: an ad-hoc
 * "come and walk with me" has nowhere to be delivered — `nudgeMember` is scoped
 * to a group, and a plain move has no row on the server for anybody to join.
 * The copy is careful not to imply otherwise, and wiring a real invite is a
 * server change rather than a screen one.
 */

type Route = "alone" | "friends";

export default function MoveStartScreen() {
  const router = useRouter();
  const { palette, isDark } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();

  const [route, setRoute] = React.useState<Route>("alone");
  /** Null while loading, so an empty list is not mistaken for "no friends". */
  const [friends, setFriends] = React.useState<Friendship[] | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    friendsService
      .listFriends()
      .then((list) => {
        // Accepted only — somebody who has not accepted a friend request is not
        // somebody to take a walk with.
        const accepted = list.filter((entry) => entry.status === "accepted" && entry.profile.id);

        if (active) {
          setFriends(accepted);
        }
      })
      .catch(() => {
        if (active) {
          setFriends([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const pickedFriends = (friends ?? []).filter((entry) => picked.includes(entry.profile.id as string));
  const names = pickedFriends.map((entry) => entry.profile.nickname || entry.profile.lumoId);
  // Setting out alone is always allowed; bringing people needs at least one.
  const ready = route === "alone" || picked.length > 0;

  /**
   * What this move is, in the same shape the challenge screen uses.
   *
   * No goal and no reward, because there are none — an ordinary move is not a
   * challenge, and inventing a target for it would make one. The last row is
   * the honest answer to "what is this for": every metre counts toward the
   * lifetime total, and toward a challenge if one is running.
   */
  const challengeFamily = move.progress ? findFamily(move.progress.variant.milestoneId) : undefined;
  const summaryRows = [
    { icon: "walk" as const, label: "Goal", value: "No target — go as far as you like" },
    { icon: "calendar" as const, label: "Length", value: "Until you finish it" },
    { icon: "friends" as const, label: "Company", value: route === "alone" ? "On your own" : names.length > 0 ? names.join(", ") : "Nobody picked yet" },
    { icon: "sun" as const, label: "Starts", value: "As soon as you tap" },
    {
      icon: "target" as const,
      label: "Counts toward",
      value: challengeFamily ? `Your total and the ${challengeFamily.title} challenge` : "Your lifetime total"
    }
  ];

  function start() {
    if (!ready) {
      return;
    }

    /**
     * `replace`, not `push`: a recording in progress is not somewhere you
     * navigate to, and leaving this page on the stack would let somebody back
     * out of a live walk into the screen that started it.
     */
    router.replace({
      pathname: "/move/track",
      params: route === "friends" && names.length > 0 ? { with: names.join(", ") } : {}
    });
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader title="Move" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={styles.section}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
          How will you do it
        </AppText>

        <MoveOptionGroup>
          <MoveOptionRow
            icon="walk"
            title="Go it alone"
            subtitle="Just you, your route and the time it takes."
            selected={route === "alone"}
            onPress={() => setRoute("alone")}
          />
          <MoveOptionRow
            icon="friends"
            title="Bring friends"
            subtitle="Note who is with you. Their names ride along with this one."
            selected={route === "friends"}
            onPress={() => setRoute("friends")}
            last
          />
        </MoveOptionGroup>
      </View>

      {route === "friends" ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
              Who is coming
            </AppText>
            <AppText variant="caption" color={picked.length > 0 ? palette.subtle : accent.glyph}>
              {picked.length > 0 ? `${picked.length} coming` : "Pick at least one"}
            </AppText>
          </View>

          {picked.length === 0 ? (
            // Carded like the route list above, so the section holds its shape
            // whether or not anybody is on it.
            <View style={[styles.friendsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
              <Icon name="friends" size={22} color={palette.subtle} weight="bulk" />
              <AppText variant="caption" color={palette.subtle} style={styles.friendsEmptyBody}>
                Lumo will remember who you went with. They are not sent anything — this is your record of the walk.
              </AppText>
              <Button label="Add Friends" icon="userCircleAdd" variant="ghost" onPress={() => setPickerOpen(true)} />
            </View>
          ) : (
            <MoveOptionGroup style={styles.rosterGroup}>
              {pickedFriends.map((friend, index) => {
                const id = friend.profile.id as string;

                return (
                  <MoveOptionRow
                    key={id}
                    title={friend.profile.nickname || friend.profile.lumoId}
                    subtitle={friend.profile.lumoId}
                    selected
                    onPress={() => setPicked((current) => current.filter((entry) => entry !== id))}
                    last={index === pickedFriends.length - 1}
                    leading={<Avatar config={friend.profile.avatar} size={44} />}
                  />
                );
              })}

              {/* Inside the card, under a rule: it acts on the list above it. */}
              <View style={[styles.rosterAction, { borderTopColor: palette.hairline }]}>
                <Button
                  label="Edit"
                  icon="userCircleAdd"
                  iconSize={15}
                  variant="ghost"
                  onPress={() => setPickerOpen(true)}
                  style={styles.rosterButton}
                  labelStyle={styles.rosterButtonLabel}
                />
              </View>
            </MoveOptionGroup>
          )}
        </View>
      ) : null}

      {/* Under the choices it describes, so picking a route and reading what it
          means are the same glance — the challenge screen's own arrangement. */}
      <View style={styles.section}>
        <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
          What you are taking on
        </AppText>
        <MoveSummaryCard rows={summaryRows} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready }}
        accessibilityLabel={ready ? "Start moving" : "Pick at least one friend"}
        onPress={start}
        disabled={!ready}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: ready ? accent.primary : palette.surface, opacity: pressed && ready ? 0.85 : 1 }
        ]}
      >
        <AppText color={ready ? palette.white : palette.muted} style={styles.ctaLabel}>
          Start Moving
        </AppText>
      </Pressable>

      <MoveFriendPicker
        visible={pickerOpen}
        friends={friends}
        picked={picked}
        onClose={() => setPickerOpen(false)}
        onDone={(next) => {
          setPicked(next);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl
  },
  section: {
    /**
     * The air under each section's label — "How will you do it", "Who is
     * coming", "What you are taking on".
     *
     * 12 rather than 8: at 8 a label sat close enough to the card under it to
     * read as part of it, and this is the same gap the milestone screen — which
     * asks the same three questions in the same shape — already leaves.
     */
    gap: spacing.sm
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  friendsCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    // Shallower at the foot: the Add Friends button carries its own height, so
    // a full inset under it read as a gap rather than as the card's edge.
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  friendsEmptyBody: {
    // Regular, not the caption's semibold: this is a sentence explaining the
    // section, not a label on it.
    fontFamily: fontFamilies.lexend,
    textAlign: "center",
    lineHeight: 17,
    maxWidth: 280
  },
  rosterGroup: {
    paddingBottom: 0
  },
  rosterAction: {
    borderTopWidth: StyleSheet.hairlineWidth
  },
  rosterButton: {
    minHeight: 42
  },
  rosterButtonLabel: {
    fontSize: 13
  },
  cta: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: spacing.xs,
    borderRadius: radius.pill
  },
  ctaLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15
  }
});
