import { Href, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { Alert, Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, LoadingState, LumoInput, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { defaultAvatar } from "@/lib/avatar";
import { alpha } from "@/lib/color";
import { timeAgo } from "@/lib/date";
import { featureBoardService, RequestUpdate, RequestVoter } from "@/lib/featureBoard";
import { FeatureRequest } from "@/types/habit";

const VOTERS_PAGE_SIZE = 10;

export default function RequestDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const requestId = typeof params.id === "string" ? params.id : "";
  const { isDark, palette, canUseFeatureBoard } = useLumo();
  const [request, setRequest] = useState<FeatureRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [voters, setVoters] = useState<RequestVoter[]>([]);
  const [updates, setUpdates] = useState<RequestUpdate[]>([]);
  const [hasMoreVoters, setHasMoreVoters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMoreRef = useRef(false);
  const [votePressed, setVotePressed] = useState(false);
  // Owner append-only updates once editing is locked; the composer stays
  // hidden until the Update button toggles it.
  const [showUpdateComposer, setShowUpdateComposer] = useState(false);
  const [updateDraft, setUpdateDraft] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);

  const loadVoters = useCallback(
    async (offset: number) => {
      const page = await featureBoardService.listVoters(requestId, offset, VOTERS_PAGE_SIZE);
      setVoters((current) => (offset === 0 ? page : [...current, ...page]));
      setHasMoreVoters(page.length === VOTERS_PAGE_SIZE);
    },
    [requestId]
  );

  // Loads on mount and re-loads on focus, so returning from the edit form
  // shows the fresh content.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      Promise.all([
        featureBoardService.getRequest(requestId),
        featureBoardService.listVoters(requestId, 0, VOTERS_PAGE_SIZE),
        featureBoardService.listUpdates(requestId)
      ]).then(([loadedRequest, firstVoters, loadedUpdates]) => {
        if (!active) {
          return;
        }
        setRequest(loadedRequest);
        setVoters(firstVoters);
        setUpdates(loadedUpdates);
        setHasMoreVoters(firstVoters.length === VOTERS_PAGE_SIZE);
        setLoading(false);
      });

      return () => {
        active = false;
      };
    }, [requestId])
  );

  async function loadMoreVoters() {
    if (loadingMoreRef.current || !hasMoreVoters) {
      return;
    }
    loadingMoreRef.current = true;
    try {
      await loadVoters(voters.length);
    } finally {
      loadingMoreRef.current = false;
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 120) {
      loadMoreVoters();
    }
  }

  function toggleVote() {
    if (!request || !canUseFeatureBoard) {
      return;
    }

    const nextVoted = !request.votedByMe;
    setRequest({ ...request, votedByMe: nextVoted, votes: Math.max(0, request.votes + (nextVoted ? 1 : -1)) });
    featureBoardService.setVote(request.id, nextVoted).then((ok) => {
      // Re-sync the voter list (and count) with the server either way.
      if (ok) {
        loadVoters(0);
      } else {
        featureBoardService.getRequest(requestId).then((fresh) => fresh && setRequest(fresh));
      }
    });
  }

  if (loading) {
    return <LoadingState />;
  }

  if (!request) {
    return (
      <Screen>
        <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />
        <AppText variant="bodySmall" color={palette.subtle} style={styles.missing}>
          This request could not be found — it may have been removed.
        </AppText>
      </Screen>
    );
  }

  const isBug = request.type === "bug";
  const created = new Date(request.createdAt);
  const dateLabel = created.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  // A vote endorses the exact words, so editing is open only while no one
  // else has voted (the database enforces the same rule).
  const outsideVotes = request.votes - (request.votedByMe ? 1 : 0);
  const canEditNow = request.mine && outsideVotes === 0;

  function confirmDeleteRequest() {
    if (!request) {
      return;
    }
    Alert.alert(
      isBug ? "Delete this bug report?" : "Delete this request?",
      "This permanently removes it for everyone, including its votes and updates.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const ok = await featureBoardService.deleteRequest(request.id);
            if (ok) {
              router.back();
            } else {
              Alert.alert("Couldn't delete", "Please check your connection and try again.");
            }
          }
        }
      ]
    );
  }

  function confirmDeleteUpdate(update: RequestUpdate) {
    Alert.alert("Delete update?", "This removes the update from the timeline for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const ok = await featureBoardService.deleteUpdate(update.id);
          if (ok) {
            setUpdates((current) => current.filter((item) => item.id !== update.id));
          } else {
            Alert.alert("Couldn't delete", "Please check your connection and try again.");
          }
        }
      }
    ]);
  }

  async function postUpdate() {
    if (!request || postingUpdate || !updateDraft.trim()) {
      return;
    }

    setPostingUpdate(true);
    try {
      const ok = await featureBoardService.addUpdate(request.id, updateDraft);

      if (!ok) {
        Alert.alert("Couldn't post update", "Please check your connection and try again.");
        return;
      }

      setUpdateDraft("");
      setShowUpdateComposer(false);
      setUpdates(await featureBoardService.listUpdates(request.id));
    } finally {
      setPostingUpdate(false);
    }
  }

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        centerContent={
          <View style={[styles.typePill, styles.headerPill, { backgroundColor: alpha(palette.greenDark, "12") }]}>
            <Icon name={isBug ? "zap" : "sparkle"} size={14} color={palette.greenDark} weight="bulk" />
            <AppText variant="caption" color={palette.greenDark} style={styles.typePillText}>
              {isBug ? "Bug report" : "Feature request"}
            </AppText>
          </View>
        }
        rightActions={
          request.mine
            ? [
                {
                  icon: "trash",
                  label: "Delete request",
                  iconColor: palette.danger,
                  iconSize: 20,
                  iconStyle: { transform: [{ translateY: 6 }] },
                  onPress: confirmDeleteRequest
                }
              ]
            : undefined
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={160}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.greenDark}
            onRefresh={async () => {
              setRefreshing(true);
              const [fresh, freshUpdates] = await Promise.all([
                featureBoardService.getRequest(requestId),
                featureBoardService.listUpdates(requestId),
                loadVoters(0)
              ]);
              if (fresh) {
                setRequest(fresh);
              }
              setUpdates(freshUpdates);
              setRefreshing(false);
            }}
          />
        }
      >
        {request.status === "in_progress" || request.status === "done" ? (
        <View style={styles.tagRow}>
          {request.status === "in_progress" ? (
            <View style={[styles.typePill, { backgroundColor: alpha(palette.chartPartial, "22") }]}>
              <AppText variant="caption" color={palette.chartPartial} style={styles.typePillText}>
                Ongoing
              </AppText>
            </View>
          ) : null}
          {request.status === "done" ? (
            <View style={[styles.typePill, { backgroundColor: alpha(palette.greenDark, "12") }]}>
              <AppText variant="caption" color={palette.greenDark} style={styles.typePillText}>
                {isBug ? "Fixed" : "Shipped"}
              </AppText>
            </View>
          ) : null}
        </View>
        ) : null}

        <AppText color={palette.ink} style={styles.title}>
          {request.title}
        </AppText>
        <AppText variant="caption" color={palette.subtle} style={styles.date}>
          Submitted{request.authorName ? ` by ${request.authorName}` : ""} on {dateLabel}
        </AppText>

        {request.photoUri ? <Image source={{ uri: request.photoUri }} style={styles.photo} resizeMode="cover" /> : null}

        {request.description ? (
          <AppText variant="bodySmall" color={palette.body} style={styles.description}>
            {request.description}
          </AppText>
        ) : null}

        {updates.length ? (
          <View style={[styles.timeline, { borderTopColor: palette.hairline }]}>
            {updates.map((update, index) => (
              <View key={update.id} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, { backgroundColor: palette.greenDark }]} />
                  {index < updates.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: alpha(palette.greenDark, "26") }]} /> : null}
                </View>
                <View style={styles.timelineContent}>
                  <View style={styles.updateHead}>
                    <AppText variant="caption" color={palette.subtle} style={styles.updateMeta}>
                      UPDATE · {timeAgo(update.createdAt)}
                    </AppText>
                    {request.mine ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete this update"
                        hitSlop={8}
                        onPress={() => confirmDeleteUpdate(update)}
                        style={[styles.updateDelete, { backgroundColor: alpha(palette.danger, "14") }]}
                      >
                        <Icon name="trash" size={14} color={palette.danger} weight="bulk" />
                      </Pressable>
                    ) : null}
                  </View>
                  <AppText variant="bodySmall" color={palette.body} style={styles.updateBody}>
                    {update.body}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {request.mine && !canEditNow && showUpdateComposer ? (
          <View style={styles.updateComposer}>
            <LumoInput
              value={updateDraft}
              onChangeText={setUpdateDraft}
              placeholder="Add an update for your voters…"
              multiline
              style={[styles.editInput, styles.updateInput, { borderColor: alpha(palette.greenDark, "33") }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post update"
              onPress={postUpdate}
              style={[styles.editButton, styles.postButton, { backgroundColor: palette.greenDark, opacity: !updateDraft.trim() || postingUpdate ? 0.5 : 1 }]}
            >
              <AppText variant="button" color={isDark ? palette.onAccent : palette.white}>
                {postingUpdate ? "Posting…" : "Post update"}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${request.votedByMe ? "Remove your vote" : "Vote for this"}. ${request.votes} votes.`}
            accessibilityState={{ selected: request.votedByMe }}
            onPress={toggleVote}
            onPressIn={() => setVotePressed(true)}
            onPressOut={() => setVotePressed(false)}
            style={[
              styles.voteCta,
              {
                backgroundColor: request.votedByMe ? palette.greenDark : alpha(palette.greenDark, "10"),
                opacity: votePressed ? 0.8 : 1
              }
            ]}
          >
            <AppText
              variant="button"
              color={request.votedByMe ? (isDark ? palette.onAccent : palette.white) : palette.greenDark}
              style={styles.voteLabel}
            >
              {request.votedByMe ? "Voted" : "Vote"} · {request.votes}
            </AppText>
          </Pressable>

          {request.mine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={canEditNow ? "Edit this post" : "Add an update"}
              onPress={() =>
                canEditNow ? router.push(`/submit-request?editId=${request.id}` as Href) : setShowUpdateComposer((v) => !v)
              }
              style={[styles.updateCta, { backgroundColor: palette.surface }]}
            >
              <AppText variant="button" color={palette.greenDark} style={styles.voteLabel}>
                {canEditNow ? "Edit" : "Update"}
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.votersHeader}>
          <AppText variant="titleSmall" color={palette.ink} style={styles.votersTitle}>
            Voted by
          </AppText>
          <AppText variant="bodySmall" color={palette.subtle} style={styles.votersCount}>
            {request.votes} {request.votes === 1 ? "Vote" : "Votes"}
          </AppText>
        </View>

        {voters.length ? (
          <View style={[styles.votersCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
            {voters.map((voter, index) => (
              <View
                key={`${voter.lumoId}-${index}`}
                style={[styles.voterRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline }]}
              >
                <View style={[styles.voterAvatar, { backgroundColor: alpha(palette.greenDark, "10") }]}>
                  <Avatar config={voter.avatar ?? defaultAvatar()} size={34} />
                </View>
                <View style={styles.voterText}>
                  <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.voterName}>
                    {voter.nickname || "Lumo user"}
                  </AppText>
                  <AppText variant="caption" color={palette.subtle} numberOfLines={1}>
                    {voter.lumoId}
                  </AppText>
                </View>
                <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.voterTime}>
                  {timeAgo(voter.votedAt)}
                </AppText>
              </View>
            ))}
            {hasMoreVoters ? (
              <AppText variant="caption" color={palette.subtle} style={styles.votersMore}>
                Scroll for more…
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText variant="bodySmall" color={palette.subtle} style={styles.noVoters}>
            No votes yet — be the first!
          </AppText>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1
  },
  scroll: {
    flex: 1,
    marginHorizontal: -layout.screenPaddingX,
    marginTop: -spacing.xs
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: spacing.xxl,
    gap: spacing.sm
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  typePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs
  },
  typePillText: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Lines the header badge up with the back/edit buttons.
  headerPill: {
    transform: [{ translateY: -6 }]
  },
  title: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 24,
    lineHeight: 30
  },
  date: {
    fontFamily: fontFamilies.lexend,
    marginTop: -spacing.xxs
  },
  photo: {
    width: "100%",
    height: 200,
    borderRadius: radius.lg,
    marginTop: spacing.xs
  },
  description: {
    lineHeight: 22,
    marginTop: spacing.xs
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  voteCta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 50,
    borderRadius: radius.pill
  },
  updateCta: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: layout.screenPaddingX,
    borderRadius: radius.pill
  },
  voteLabel: {
    fontSize: 15
  },
  editInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.sm,
    fontFamily: fontFamilies.lexendSemiBold
  },
  editButton: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: layout.screenPaddingX
  },
  // Vertical timeline: dot + connecting rail per update.
  timeline: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md
  },
  timelineRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  timelineRail: {
    width: 14,
    alignItems: "center"
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    marginTop: 3
  },
  timelineLine: {
    flex: 1,
    width: 2,
    borderRadius: 1,
    marginTop: 3
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingBottom: spacing.md
  },
  updateHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  updateMeta: {
    fontFamily: fontFamilies.lexendSemiBold,
    letterSpacing: 0.6
  },
  updateDelete: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  updateBody: {
    lineHeight: 20
  },
  updateComposer: {
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  updateInput: {
    minHeight: 56
  },
  postButton: {
    alignSelf: "flex-end"
  },
  votersHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md
  },
  votersTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  votersCount: {
    fontFamily: fontFamilies.lexendSemiBold,
    opacity: 0.5
  },
  votersCard: {
    borderRadius: radius.nav,
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing.xs,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  voterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  voterAvatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  voterText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  voterName: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  voterTime: {
    flexShrink: 0,
    alignSelf: "flex-start",
    marginTop: 2,
    fontFamily: "Lexend-Regular",
    opacity: 0.7
  },
  votersMore: {
    textAlign: "center",
    paddingVertical: spacing.xs,
    opacity: 0.7
  },
  noVoters: {
    textAlign: "center",
    paddingVertical: spacing.md
  },
  missing: {
    textAlign: "center",
    marginTop: spacing.xl
  }
});
