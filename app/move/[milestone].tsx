import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Alert, Modal, ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ChallengeHeadline, ChallengeSummary, TeamContributions, useMoveAccent } from "@/components/move/ChallengeUI";
import { MoveBadge } from "@/components/move/MoveBadge";
import { MoveOptionGroup, MoveOptionRow } from "@/components/move/MoveOptionRow";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/states";
import { AppText, Button, LumoInput, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { ME, useMove } from "@/context/MoveContext";
import { alpha, readableOn } from "@/lib/color";
import { friendsService, type Friendship } from "@/lib/friends";
import { challengeClient } from "@/lib/move/challengeClient";
import { pauseState, START_REFUSAL_COPY } from "@/lib/move/activeChallenge";
import { familyProgress, hasMilestone, hasVariant, isFamilyLocked, previousFamily } from "@/lib/move/achievements";
import { describeUnlockRule, findFamily } from "@/lib/move/challengeDefs";

/**
 * One milestone, and the three routes to its badge.
 *
 * The badge is the anchor at the top because it is what all three routes add up
 * to — alone, against a clock, and with friends. A finished route keeps its
 * tick in the list, so this screen doubles as the record of how far along the
 * badge is; there is nowhere else that shows it route by route.
 */
export default function MilestoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ milestone: string }>();
  const { palette, isDark, isPro } = useLumo();
  const accent = useMoveAccent();
  const move = useMove();

  const family = findFamily(params.milestone);
  const [selected, setSelected] = React.useState<string | null>(family?.variants[0]?.id ?? null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  /** Null while loading, so an empty list is not mistaken for "no friends". */
  const [friends, setFriends] = React.useState<Friendship[] | null>(null);
  const [picked, setPicked] = React.useState<string[]>([]);
  /**
   * Friends already on a challenge.
   *
   * A set, so ABSENT means available — an offline lookup returns empty and fails
   * open rather than blocking someone from inviting a free friend.
   */
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = React.useState(false);
  /**
   * The dialog's own working copy.
   *
   * Committed to `picked` on Done and thrown away otherwise, so ticking through
   * a list is not the same act as inviting somebody — and closing the sheet
   * without meaning to costs nothing.
   */
  const [draft, setDraft] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    let active = true;

    friendsService
      .listFriends()
      .then(async (list) => {
        // Accepted only — someone who has not accepted a friend request is not
        // somebody to hand a challenge to.
        const accepted = list.filter((entry) => entry.status === "accepted" && entry.profile.id);

        if (!active) {
          return;
        }

        setFriends(accepted);

        const taken = await challengeClient.busyFriends(accepted.map((entry) => entry.profile.id as string));

        if (active) {
          setBusy(taken);
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

  if (!family) {
    return (
      <Screen contentStyle={styles.content}>
        <ScreenHeader title="Challenge" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <AppText variant="bodySmall" color={palette.subtle}>
          That challenge is no longer available.
        </AppText>
      </Screen>
    );
  }

  const earned = hasMilestone(move.achievements, family.id);
  const routes = familyProgress(move.achievements, family);
  const chosen = family.variants.find((entry) => entry.id === selected) ?? null;
  /** The running challenge, but only if it belongs to THIS milestone. */
  const running = move.progress && move.progress.variant.milestoneId === family.id ? move.progress : null;
  // Another rung's challenge is what blocks this one. This rung's own is not a
  // block — it is what the screen is about.
  const blocked = move.active !== null && !running;
  const pause = running ? pauseState(running.challenge) : { can: false, left: 0 };
  // Reachable from the badges screens even when the list has it shut, so the
  // rule is stated here too rather than only being enforced in the list.
  const locked = isFamilyLocked(move.achievements, family);
  /**
   * A Pro rung, and the reader has not paid.
   *
   * Checked here as well as on the list, because the badges screens push
   * straight to a milestone — a rule enforced only where you usually enter from
   * is not a rule.
   */
  const needsPro = family.pro && !isPro;
  // The amber is a wash, so the label is darkened until it clears the card it
  // sits on rather than taking the raw token.
  const pauseInk = readableOn(palette.chartPartial, palette.card, 4.5);

  const team = chosen?.kind === "team" ? chosen : null;
  const pickedNames = picked.map((id) => {
    const friend = (friends ?? []).find((entry) => entry.profile.id === id);

    return friend?.profile.nickname || friend?.profile.lumoId || "A friend";
  });
  const short = team ? team.minFriends - picked.length : 0;
  // A team route cannot start a friend short: the roster IS the challenge, and
  // one that can never complete is worse than one that will not start.
  const ready = short <= 0;
  const pickedFriends = (friends ?? []).filter((entry) => picked.includes(entry.profile.id as string));
  const searchable = (friends ?? []).filter((entry) => {
    const name = entry.profile.nickname || entry.profile.lumoId;

    return name.toLowerCase().includes(query.trim().toLowerCase());
  });

  function toggleFriend(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  function toggleDraft(id: string) {
    setDraft((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  function openPicker() {
    setDraft(picked);
    setQuery("");
    setPickerOpen(true);
  }

  function start() {
    if (!chosen) {
      return;
    }

    const participants =
      chosen.kind === "team"
        ? [
            { userId: ME, name: "You", contributionM: 0, leftAt: null },
            ...picked.map((id, index) => ({ userId: id, name: pickedNames[index] ?? "A friend", contributionM: 0, leftAt: null }))
          ]
        : [];

    const result = move.startChallenge(chosen.id, participants);

    if (!result.ok) {
      setRefusal(START_REFUSAL_COPY[result.reason]);

      return;
    }

    router.replace("/move");
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader
        title={`${family.title.split(" ")[0]} Challenge`}
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
      />

      <View style={styles.hero}>
        <MoveBadge
          progress={{
            milestone: { id: family.id, title: family.title, description: "", target: family.distanceM, metric: "distance", tier: "bronze" },
            progress: earned ? family.distanceM : 0,
            target: family.distanceM,
            ratio: earned ? 1 : 0,
            unlocked: earned,
            unlockedAt: null
          }}
          size={148}
        />
        <AppText variant="bodySmall" color={palette.subtle} style={styles.heroBlurb}>
          {earned ? `${family.subtitle}. Badge earned.` : `${family.subtitle}. ${describeUnlockRule(family)}`}
        </AppText>
      </View>

      {needsPro ? (
        <View style={[styles.blocked, { backgroundColor: alpha(palette.accent, "1F") }]}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.blockedTitle}>
            A Lumo Pro challenge
          </AppText>
          <AppText variant="caption" color={palette.body} style={styles.blockedBody}>
            {family.title} and everything above it come with Lumo Pro. The first three rungs are free and stay free — including the
            badges you have already earned.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See Lumo Pro"
            onPress={() => router.push("/friends")}
            style={({ pressed }) => [styles.blockedButton, { borderColor: readableOn(palette.accent, palette.canvas, 3), opacity: pressed ? 0.7 : 1 }]}
          >
            <AppText variant="bodySmall" color={readableOn(palette.accent, palette.canvas, 4.5)}>
              See Lumo Pro
            </AppText>
          </Pressable>
        </View>
      ) : locked ? (
        <View style={[styles.blocked, { backgroundColor: accent.soft }]}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.blockedTitle}>
            Not yet
          </AppText>
          <AppText variant="caption" color={palette.body} style={styles.blockedBody}>
            Earn the {previousFamily(family)?.title} badge first. The ladder is walked in order.
          </AppText>
        </View>
      ) : running ? (
        // This rung is under way, so the screen shows the challenge rather than
        // a list of routes that cannot be started. Everything below — picking,
        // the summary, the start button — belongs to a decision already made.
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
              In progress
            </AppText>
            <AppText variant="caption" color={palette.subtle}>
              {routes.done} of {routes.total} routes done
            </AppText>
          </View>

          <ChallengeHeadline progress={running} />

          {/* Two ways out, weighted differently. A pause is the small one and
              reads as such; cancelling is red because it ends the challenge and
              cannot be undone — the movement is kept, the challenge is not. */}
          {running.variant.kind === "team" ? (
            <TeamContributions
              challenge={running.challenge}
              progress={running}
              members={running.challenge.participants.map((entry) => ({ userId: entry.userId, name: entry.name }))}
              meId={ME}
            />
          ) : null}

          <View style={styles.runningActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !pause.can }}
              accessibilityLabel={pause.can ? `Pause for a day, ${pause.left} left` : (pause.reason ?? "Cannot pause")}
              disabled={!pause.can}
              onPress={() =>
                Alert.alert("Pause for a day?", "The deadline moves out by one day. Your progress and everything you have walked stay put.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Pause a Day", onPress: () => move.pauseChallenge() }
                ])
              }
              style={({ pressed }) => [
                styles.pauseAction,
                { backgroundColor: alpha(palette.chartPartial, "26"), opacity: pressed ? 0.7 : pause.can ? 1 : 0.45 }
              ]}
            >
              <Icon name="pause" size={15} color={pauseInk} weight="bold" />
              <AppText variant="button" color={pauseInk} numberOfLines={1}>
                {pause.can ? `Pause (${pause.left})` : "No pauses"}
              </AppText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel this challenge"
              onPress={() =>
                Alert.alert(
                  "Cancel this challenge?",
                  "Your recorded movement stays in your Move history, but this challenge ends and the routes it would have earned stay unearned.",
                  [
                    { text: "Keep Going", style: "cancel" },
                    { text: "Cancel Challenge", style: "destructive", onPress: () => move.leaveChallenge() }
                  ]
                )
              }
              style={({ pressed }) => [styles.dangerAction, { backgroundColor: palette.danger, opacity: pressed ? 0.85 : 1 }]}
            >
              <AppText variant="button" color={palette.white} numberOfLines={1}>
                Cancel
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : (
      <View style={[styles.section, styles.routes]}>
        <View style={styles.sectionHead}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
            Choose a route
          </AppText>
          <AppText variant="caption" color={palette.subtle}>
            {routes.done} of {routes.total} done
          </AppText>
        </View>

        <MoveOptionGroup>
          {family.variants.map((variant, index) => {
            const done = hasVariant(move.achievements, variant.id);

            return (
              <MoveOptionRow
                key={variant.id}
                icon={variant.kind === "team" ? "friends" : variant.durationDays === null ? "walk" : "calendar"}
                title={variant.title}
                subtitle={done ? "Done" : variant.description}
                selected={selected === variant.id}
                onPress={() => setSelected(variant.id)}
                trailing={done ? <Icon name="checkCircle" size={20} color={palette.greenDark} weight="bulk" /> : undefined}
                last={index === family.variants.length - 1}
              />
            );
          })}
        </MoveOptionGroup>
      </View>
      )}

      {/* The rule, stated where it applies, with the way out beside it. */}
      {running || locked || needsPro ? null : blocked ? (
        <View style={[styles.blocked, { backgroundColor: accent.soft }]}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.blockedTitle}>
            Active challenge in progress
          </AppText>
          <AppText variant="caption" color={palette.body} style={styles.blockedBody}>
            You can only have one active Move challenge at a time.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View active challenge"
            onPress={() => router.push("/move")}
            style={({ pressed }) => [styles.blockedButton, { borderColor: accent.glyph, opacity: pressed ? 0.7 : 1 }]}
          >
            <AppText variant="bodySmall" color={accent.glyph}>
              View Active Challenge
            </AppText>
          </Pressable>
        </View>
      ) : chosen ? (
        <>
          {/* Picking who is coming happens HERE, not on a screen of its own —
              the roster is part of the choice, and a route that needs friends
              should not hide behind a Continue button to say so. */}
          {team ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
                  Who is coming
                </AppText>
                <AppText variant="caption" color={ready ? palette.subtle : accent.glyph}>
                  {ready ? `${picked.length} invited` : `${short} more to go`}
                </AppText>
              </View>

              {/* Said before anybody is picked, because it is about THEM: a
                  friend without Pro cannot join a Pro challenge, and the
                  refusal would otherwise arrive after the invite went out. */}
              {family.pro ? (
                <AppText variant="caption" color={palette.subtle} style={styles.proNote}>
                  Friends need Lumo Pro to join a {family.title} challenge.
                </AppText>
              ) : null}

              {picked.length === 0 ? (
                // Carded like the route list and the summary, so the section
                // holds its shape whether or not anybody is on it. No title:
                // the section heading above already says what this is, and
                // "Nobody yet" only said it again in bolder type.
                <View style={[styles.friendsCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
                  <Icon name="friends" size={30} color={palette.subtle} weight="bulk" />
                  <AppText variant="bodySmall" color={palette.subtle} style={styles.friendsEmptyBody}>
                    This route is walked together — everyone covers the full distance, side by side.
                  </AppText>
                  <Button label="Add Friends" icon="userCircleAdd" variant="ghost" onPress={openPicker} />
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
                        onPress={() => toggleFriend(id)}
                        last={index === pickedFriends.length - 1}
                        leading={<Avatar config={friend.profile.avatar} size={44} />}
                      />
                    );
                  })}

                  {/* Inside the card, under a rule: it acts on the list above
                      it, and a button floating below the card read as if it
                      belonged to the section rather than to the roster. */}
                  <View style={[styles.rosterAction, { borderTopColor: palette.hairline }]}>
                    {/* Shorter than the app-wide control height: this one is a
                        row inside a card, not a control on a page. */}
                    <Button
                      label="Edit Invites"
                      icon="userCircleAdd"
                      iconSize={15}
                      variant="ghost"
                      onPress={openPicker}
                      style={styles.rosterButton}
                      labelStyle={styles.rosterButtonLabel}
                    />
                  </View>
                </MoveOptionGroup>
              )}
            </View>
          ) : null}

          {/* The summary sits under the list it describes, so changing route
              and reading what it means are the same glance. */}
          <View style={styles.section}>
            <AppText variant="bodySmall" color={palette.ink} style={styles.sectionTitle}>
              What you are taking on
            </AppText>
            <ChallengeSummary variant={chosen} family={family} withNames={pickedNames} />
          </View>

          {refusal ? (
            <AppText variant="caption" color={palette.danger} style={styles.refusal}>
              {refusal}
            </AppText>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            accessibilityLabel={ready ? `Start ${chosen.title}` : `Invite ${short} more`}
            onPress={() => (ready ? start() : undefined)}
            disabled={!ready}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: ready ? accent.primary : palette.surface, opacity: pressed && ready ? 0.85 : 1 }
            ]}
          >
            <AppText color={ready ? palette.white : palette.muted} style={styles.ctaLabel}>
              {ready ? "Start Challenge" : `Invite ${short} more ${short === 1 ? "friend" : "friends"}`}
            </AppText>
          </Pressable>
        </>
      ) : null}

      {/* Picking happens in a dialog so the card above stays a roster rather
          than a scroll of everyone you know. Search included: past a dozen
          friends the list alone stops being pickable. */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.pickerScrim}>
          <View style={[styles.pickerCard, { backgroundColor: palette.card }]}>
            {friends && friends.length > 0 ? (
              // `surface`, not the input's default `card`: the dialog itself is
              // a card, and a field the same colour as the sheet behind it
              // reads as a label rather than something to type in.
              <LumoInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search friends…"
                autoCapitalize="none"
                style={{ backgroundColor: palette.surface }}
              />
            ) : null}

            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {friends === null ? null : friends.length === 0 ? (
                <>
                  <EmptyState
                    icon="friends"
                    title="No friends yet"
                    body="Add a friend in Lumo and you can take this route on together."
                  />
                  <Button
                    label="Find Friends"
                    icon="userCircleAdd"
                    variant="ghost"
                    onPress={() => {
                      setPickerOpen(false);
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
                    const isPicked = draft.includes(id);
                    // One challenge at a time applies to them too, so the invite
                    // would be refused on arrival. Saying so here beats letting
                    // it fail later for a reason nobody could see.
                    const taken = busy.has(id);

                    return (
                      <MoveOptionRow
                        key={id}
                        title={friend.profile.nickname || friend.profile.lumoId}
                        // The Lumo ID stays put when picked: the tick already
                        // says they are in, and swapping the line underneath
                        // moves the one piece of information that identifies
                        // two friends with the same first name.
                        subtitle={taken ? "Already on a challenge" : friend.profile.lumoId}
                        selected={isPicked && !taken}
                        disabled={taken}
                        flush
                        onPress={() => toggleDraft(id)}
                        last={index === searchable.length - 1}
                        leading={<Avatar config={friend.profile.avatar} size={44} />}
                        trailing={
                          <View
                            style={[
                              styles.friendCheck,
                              isPicked && !taken
                                ? { backgroundColor: palette.greenDark, borderColor: palette.greenDark }
                                : { borderColor: palette.hairline }
                            ]}
                          >
                            {isPicked && !taken ? <Icon name="check" size={11} color={palette.white} weight="bold" /> : null}
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
              onPress={() => {
                setPicked(draft);
                setPickerOpen(false);
              }}
              style={({ pressed }) => [styles.pickerDone, { backgroundColor: accent.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <AppText variant="button" color={palette.white}>
                Done
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    // Separates the badge and its line from the choosing below — the hero says
    // what this rung IS, and the rest of the screen is what to do about it.
    paddingBottom: spacing.md
  },
  heroBlurb: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center",
    maxWidth: 300
  },
  // Heading to content. At spacing.xs the label sat on top of the card it
  // introduces, reading as part of it rather than above it.
  section: {
    gap: spacing.sm
  },
  // The route list ends the decision; the summary below it is the consequence.
  // Without this they read as one long stack of rows.
  // The screen's own stack gap (spacing.lg) already separates these two, and
  // the extra padding on top of it read as a break rather than a step.
  routes: {
    paddingBottom: 0
  },
  refusal: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center"
  },
  proNote: {
    fontFamily: fontFamilies.lexend
  },
  // Side by side and equal width: two ways out of the same challenge, so
  // neither should read as the bigger door.
  runningActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.lg
  },
  pauseAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 46,
    borderRadius: radius.pill
  },
  dangerAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: radius.pill
  },
  // The summary card's inset, so the two cards on this screen match — with
  // more air over the glyph, which has nothing above it to sit under.
  friendsCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2
  },
  // Air top and bottom, so a roster of one or two does not sit tight against
  // the card's own edge the way a full-height list of routes does.
  rosterGroup: {
    paddingVertical: spacing.xs
  },
  rosterAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xs,
    marginTop: spacing.xs
  },
  rosterButton: {
    minHeight: 32
  },
  rosterButtonLabel: {
    fontSize: 13,
    lineHeight: 18
  },
  friendsEmptyBody: {
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280
  },
  pickerScrim: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  // `radius.dialog` and an spacing.xl inset — the geometry every dialog in the
  // app shares, so a Lumo sheet is one shape wherever it opens.
  pickerCard: {
    maxHeight: "80%",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.dialog
  },
  pickerList: {
    flexGrow: 0
  },
  pickerDone: {
    alignSelf: "flex-end",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill
  },
  friendCheck: {
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2
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
  blocked: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.card
  },
  blockedTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  blockedBody: {
    fontFamily: fontFamilies.lexend
  },
  blockedButton: {
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: spacing.ml,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  // Set apart from the summary above it: this is the commit, not the last row
  // of what it describes.
  cta: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    marginTop: spacing.sm,
    borderRadius: radius.pill
  },
  ctaLabel: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 16
  }
});
