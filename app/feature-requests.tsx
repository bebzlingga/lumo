import { Href, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, View } from "react-native"
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { AppText, Card, LoadingState, Screen } from "@/components/ui";
import { fontFamilies, layout, progressAccent, progressAccentText, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { featureBoardService } from "@/lib/featureBoard";
import { FeatureRequest, FeatureRequestType } from "@/types/habit";
import { Pressable } from "@/components/Pressable"

type BoardTab = FeatureRequestType | "mine";

const boardTabs: { value: BoardTab; label: string }[] = [
  { value: "feature", label: "Features" },
  { value: "bug", label: "Bugs" },
  { value: "mine", label: "My Post" }
];

export default function FeatureRequestsScreen() {
  const router = useRouter();
  const { isReady, isDark, palette, canUseFeatureBoard } = useLumo();
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<BoardTab>("feature");
  // The order toggle (right-side arrow): most-voted first by default.
  const [reversed, setReversed] = useState(false);

  const loadBoard = useCallback(async () => {
    const loaded = await featureBoardService.listRequests();
    setFeatureRequests(loaded);
    setBoardLoading(false);
  }, []);

  // Refresh on focus so a request submitted on the dedicated screen shows up.
  useFocusEffect(
    useCallback(() => {
      loadBoard();
    }, [loadBoard])
  );

  const sorted = useMemo(() => {
    const createdMs = (request: FeatureRequest) => Date.parse(request.createdAt) || 0;
    const newestFirst = (a: FeatureRequest, b: FeatureRequest) => createdMs(b) - createdMs(a);
    const byOrder = (a: FeatureRequest, b: FeatureRequest) =>
      reversed ? a.votes - b.votes || -newestFirst(a, b) : b.votes - a.votes || newestFirst(a, b);
    const typeOf = (request: FeatureRequest) => request.type ?? "feature";

    // "Mine": everything I submitted, grouped by category.
    if (activeTab === "mine") {
      const mine = featureRequests.filter((request) => request.mine);
      return {
        features: mine.filter((request) => typeOf(request) === "feature").sort(byOrder),
        bugs: mine.filter((request) => typeOf(request) === "bug").sort(byOrder),
        list: [] as FeatureRequest[]
      };
    }

    return {
      features: [] as FeatureRequest[],
      bugs: [] as FeatureRequest[],
      list: featureRequests.filter((request) => typeOf(request) === activeTab).sort(byOrder)
    };
  }, [featureRequests, activeTab, reversed]);

  const mineCount = sorted.features.length + sorted.bugs.length;
  const countLabel =
    activeTab === "mine"
      ? `${mineCount} ${mineCount === 1 ? "Submission" : "Submissions"}`
      : `${sorted.list.length} ${activeTab === "bug" ? (sorted.list.length === 1 ? "Bug" : "Bugs") : sorted.list.length === 1 ? "Request" : "Requests"}`;

  if (!isReady || (boardLoading && !featureRequests.length)) {
    return <LoadingState />;
  }

  // The whole board is subscriber-only — show the "Better together" gate.
  if (!canUseFeatureBoard) {
    return <SubscriptionGate />;
  }

  function openSubmit() {
    router.push(`/submit-request?type=${activeTab === "bug" ? "bug" : "feature"}` as Href);
  }

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      {/* Header, tabs, and info row scroll together with the list. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.list, styles.listPadPro]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.greenDark}
            onRefresh={async () => {
              setRefreshing(true);
              await loadBoard();
              setRefreshing(false);
            }}
          />
        }
      >
      <ScreenHeader
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        rightActions={[{ icon: "elementPlus", label: "Submit a request", onPress: openSubmit, iconSize: 22, iconStyle: { transform: [{ translateY: 6 }] } }]}
      />

      <View style={[styles.segmented, { backgroundColor: isDark ? palette.chartTrack : alpha(palette.chartTrack, "99"), shadowColor: isDark ? "transparent" : palette.shadow }]}>
        {boardTabs.map((tab) => {
          const active = activeTab === tab.value;
          return (
            <Pressable
              key={tab.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setActiveTab(tab.value);
                setReversed(false);
              }}
              style={styles.segment}
            >
              <View
                style={[
                  styles.segmentSurface,
                  active
                    ? {
                        backgroundColor: isDark ? palette.greenDark : palette.white,
                        borderColor: isDark ? palette.greenDark : "transparent",
                        borderWidth: isDark ? 1 : 0,
                        shadowColor: isDark ? "transparent" : palette.shadow,
                        shadowOpacity: isDark ? 0 : 0.08,
                        shadowRadius: 5,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 1
                      }
                    : { backgroundColor: "transparent" }
                ]}
              >
                <AppText
                  variant="button"
                  color={active ? (isDark ? palette.onAccent : palette.greenDark) : palette.subtle}
                  numberOfLines={1}
                  style={[styles.segmentText, active ? styles.segmentTextActive : styles.segmentTextInactive]}
                >
                  {tab.label}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Mine tab: the section headers carry their own counts, and sorting
          your own handful of posts isn't useful — hide the whole row. */}
      {activeTab !== "mine" ? (
        <View style={styles.infoRow}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.infoCount}>
            {countLabel}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Order: ${reversed ? "Lowest" : "Highest"} votes. Tap to change.`}
            hitSlop={8}
            onPress={() => setReversed((v) => !v)}
            style={({ pressed }) => [styles.orderToggle, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
          >
            <AppText variant="caption" color={palette.greenDark} style={styles.orderLabel}>
              {reversed ? "Lowest" : "Highest"}
            </AppText>
            <Icon name={reversed ? "arrowUp" : "arrowDown"} size={16} color={palette.greenDark} weight="bulk" />
          </Pressable>
        </View>
      ) : null}

        {activeTab === "mine" ? (
          mineCount ? (
            <>
              {sorted.features.length ? (
                <View style={styles.mineSection}>
                  <View style={styles.mineHeader}>
                    <AppText variant="titleSmall" color={palette.ink} style={styles.mineTitle}>
                      Features
                    </AppText>
                    <AppText variant="bodySmall" color={palette.subtle} style={styles.mineCountText}>
                      {sorted.features.length} {sorted.features.length === 1 ? "Request" : "Requests"}
                    </AppText>
                  </View>
                  {sorted.features.map((request) => (
                    <RequestRow key={request.id} request={request} />
                  ))}
                </View>
              ) : null}
              {sorted.bugs.length ? (
                <View style={styles.mineSection}>
                  <View style={styles.mineHeader}>
                    <AppText variant="titleSmall" color={palette.ink} style={styles.mineTitle}>
                      Bug reports
                    </AppText>
                    <AppText variant="bodySmall" color={palette.subtle} style={styles.mineCountText}>
                      {sorted.bugs.length} {sorted.bugs.length === 1 ? "Report" : "Reports"}
                    </AppText>
                  </View>
                  {sorted.bugs.map((request) => (
                    <RequestRow key={request.id} request={request} />
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
              <Icon name="messageEdit" size={22} color={palette.muted} weight="bulk" />
              <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyText}>
                Nothing here yet — your feature ideas and bug reports will show up here. Tap + to submit your first!
              </AppText>
            </View>
          )
        ) : sorted.list.length ? (
          sorted.list.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
            <Icon name={activeTab === "bug" ? "zap" : "star"} size={22} color={palette.muted} weight="bulk" />
            <AppText variant="bodySmall" color={palette.subtle} style={styles.emptyText}>
              {activeTab === "bug"
                ? "No bugs reported — smooth sailing! Spotted something off? Tap + and help us squash it."
                : "No requests yet. Be the first to suggest a feature and shape what Lumo builds next!"}
            </AppText>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function RequestRow({ request }: { request: FeatureRequest }) {
  const router = useRouter();
  const { palette, settings } = useLumo();
  const isBug = (request.type ?? "feature") === "bug";
  // Same pop accent as the home screen's TO DO badge.
  const voteBadgeColor = progressAccent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${request.title}. ${request.votes} ${request.votes === 1 ? "vote" : "votes"}.`}
      onPress={() => router.push(`/request/${request.id}` as Href)}
    >
      <Card style={styles.row}>
        {request.photoUri ? <Image source={{ uri: request.photoUri }} style={styles.thumbnail} resizeMode="cover" /> : null}

        <View style={styles.rowText}>
          <View style={styles.rowHead}>
            <AppText variant="titleSmall" color={palette.ink} numberOfLines={2} style={styles.rowTitle}>
              {request.title}
            </AppText>
            <View style={[styles.voteBadge, { backgroundColor: voteBadgeColor }]}>
              <AppText variant="caption" color={progressAccentText} style={styles.voteBadgeText}>
                {request.votes} {request.votes === 1 ? "Vote" : "Votes"}
              </AppText>
            </View>
          </View>
          {request.description ? (
            <AppText variant="bodySmall" color={palette.subtle} numberOfLines={2} style={styles.rowBody}>
              {request.description}
            </AppText>
          ) : null}

          {request.status === "in_progress" || request.status === "done" ? (
            <View style={styles.badgeRow}>
              {request.status === "in_progress" ? (
                <View style={[styles.tag, { backgroundColor: alpha(palette.chartPartial, "22") }]}>
                  <AppText variant="caption" color={palette.chartPartial}>
                    Ongoing
                  </AppText>
                </View>
              ) : null}
              {request.status === "done" ? (
                <View style={[styles.tag, { backgroundColor: alpha(palette.greenDark, "12") }]}>
                  <AppText variant="caption" color={palette.greenDark}>
                    {isBug ? "Fixed" : "Shipped"}
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  infoCount: {
    fontFamily: fontFamilies.lexendBold
  },
  orderToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill
  },
  orderLabel: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  // Matches the FriendsTabs segmented control: pill container, pill segments,
  // semibold active / medium inactive labels.
  segmented: {
    flexDirection: "row",
    // With no header title, tuck the tabs up against the header buttons
    // (the scroll container's sm gap already sits between them).
    marginTop: -spacing.xxs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 4
  },
  segment: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2
  },
  segmentSurface: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentText: {
    textAlign: "center"
  },
  segmentTextActive: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  segmentTextInactive: {
    fontFamily: fontFamilies.lexendMedium
  },
  // "Mine" tab sections — header style mirrors the Habits screen categories.
  mineSection: {
    gap: spacing.sm
  },
  mineHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  mineTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  mineCountText: {
    fontFamily: fontFamilies.lexendSemiBold,
    opacity: 0.5
  },
  // Same empty-state treatment as the Friends screen: centered icon + copy.
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    marginTop: spacing.xs,
    borderRadius: radius.nav,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  emptyText: {
    lineHeight: 19,
    textAlign: "center"
  },
  scroll: {
    flex: 1,
    marginHorizontal: -layout.screenPaddingX
  },
  list: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg
  },
  listPadPro: {
    paddingBottom: spacing.xxl
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: radius.lg
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs
  },
  rowTitle: {
    flex: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  voteBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5
  },
  voteBadgeText: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2
  },
  rowBody: {
    lineHeight: 20
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
    marginTop: spacing.xs
  }
});
