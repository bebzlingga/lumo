import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Pressable } from "@/components/Pressable";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState } from "@/components/states";
import { AppText, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { defaultAvatar } from "@/lib/avatar";
import { alpha, readableOn } from "@/lib/color";
import { friendsService, type Group, type GroupMessage, type SendMessageFailure } from "@/lib/friends";
import { markGroupChatRead } from "@/lib/groupChatReads";
import { formatLumoId } from "@/lib/lumoId";

/**
 * A group's chat.
 *
 * ## Why a screen of its own rather than a tab on the group page
 *
 * A conversation needs the keyboard, and the keyboard needs the whole screen. The
 * group page is a scroll of cards with tabs of its own; putting a chat inside one
 * of those tabs would mean a list scrolling inside a list, an input pinned over a
 * page that also scrolls, and a keyboard covering the thing being discussed.
 *
 * ## Why the list is INVERTED
 *
 * Because history is paged. `messages` is newest-first and `inverted` flips it, so
 * index 0 draws at the bottom — which makes the two things a chat does cheap:
 * scrolling up is `onEndReached` (ask for older), and a new message is a prepend
 * that lands at the bottom with no scrolling at all. The other way round, every
 * page of history prepended above the viewport would shove the conversation down
 * the screen and have to be corrected by hand.
 *
 * ## What is optimistic
 *
 * The message appears the moment Send is pressed, with a local id, and is replaced
 * by the stored row when the insert answers. This is the one place in the app worth
 * being optimistic about — a chat that pauses before showing your own words feels
 * broken in a way no spinner fixes — and a failed send puts the text back in the
 * field rather than dropping it.
 */

/** What each way of failing to send actually means, in words. */
const SEND_FAILURE_COPY: Record<SendMessageFailure, string> = {
  "signed-out": "Lumo could not confirm your account. Reopen the app and try again.",
  refused: "You may no longer be a member of this group. Reopen it and check.",
  unavailable: "Group chat is not available on this account yet. Nothing you typed was lost.",
  offline: "Check your connection and try again."
};

/** How far right a bubble travels before letting go replies to it. */
const REPLY_TRIGGER = 56;
/** And how far it can be dragged at all — past this it just resists. */
const REPLY_MAX = 84;

export default function GroupChatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette, isDark, lumoIdSuffix } = useLumo();
  const insets = useSafeAreaInsets();

  const [group, setGroup] = React.useState<Group | null>(null);
  /** Newest first — see the note on the inverted list. */
  const [messages, setMessages] = React.useState<GroupMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [replyingTo, setReplyingTo] = React.useState<GroupMessage | null>(null);
  const [sending, setSending] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  /** False once a page comes back short: there is no more history to ask for. */
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const myLumoId = formatLumoId(lumoIdSuffix);
  /**
   * This device's profile id, read off the group's own roster.
   *
   * The messages carry an author id and the local user knows their Lumo ID, so the
   * roster is what joins the two — and it is already loaded. Avoids a second call
   * for a fact the screen is holding.
   */
  const myAuthorId = group?.members.find((member) => member.profile.lumoId === myLumoId)?.profile.id;

  /**
   * The newest page, merged over what is already held.
   *
   * A merge rather than a replace, because the screen may be a long way up the
   * history when a message lands: replacing would throw away every older page and
   * drop the reader back to the bottom. Keyed by id, newest first, so a re-read of
   * the same page is idempotent.
   */
  const refresh = React.useCallback(async () => {
    if (typeof id !== "string") {
      return;
    }

    const page = await friendsService.listGroupMessages(id);

    setMessages((current) => {
      const seen = new Set(page.map((entry) => entry.id));
      const older = current.filter((entry) => !seen.has(entry.id) && !entry.id.startsWith("pending-"));

      return [...page, ...older].sort((a, b) => b.at.localeCompare(a.at));
    });
  }, [id]);

  const load = React.useCallback(async () => {
    if (typeof id !== "string") {
      setLoaded(true);

      return;
    }

    const [loadedGroup, page] = await Promise.all([friendsService.getGroup(id), friendsService.listGroupMessages(id)]);

    setGroup(loadedGroup);
    setMessages(page);
    // A short page means the whole conversation fits in it.
    setHasMore(page.length > 0);
    setLoaded(true);
  }, [id]);

  /**
   * Older history, asked for as the top comes into view.
   *
   * `before` is the oldest message held rather than an offset — an offset shifts
   * under you the moment somebody posts, and page two would re-read a row page one
   * already showed.
   */
  const loadOlder = React.useCallback(async () => {
    const oldest = messages[messages.length - 1];

    if (typeof id !== "string" || !oldest || loadingOlder || !hasMore) {
      return;
    }

    setLoadingOlder(true);

    const page = await friendsService.listGroupMessages(id, { before: oldest.at });

    setMessages((current) => {
      const held = new Set(current.map((entry) => entry.id));

      return [...current, ...page.filter((entry) => !held.has(entry.id))];
    });
    setHasMore(page.length > 0);
    setLoadingOlder(false);
  }, [id, messages, loadingOlder, hasMore]);

  useFocusEffect(
    React.useCallback(() => {
      void load();

      // Opening the chat IS reading it. Stamped on the way in rather than the way
      // out, so a message that arrives while somebody is looking at it does not
      // leave a badge behind — the live handler below stamps again for those.
      if (typeof id === "string") {
        void markGroupChatRead(id);
      }
    }, [load, id])
  );

  // Live while the screen is open. The teardown matters: a channel per visit that
  // never closed would stack subscriptions for the life of the process.
  React.useEffect(() => {
    if (typeof id !== "string") {
      return;
    }

    return friendsService.subscribeToGroupMessages(id, () => {
      void refresh();
      void markGroupChatRead(id);
    });
  }, [id, refresh]);

  async function send() {
    const text = draft.trim();

    if (!text || sending || typeof id !== "string") {
      return;
    }

    const replyTo = replyingTo;

    setSending(true);
    setDraft("");
    setReplyingTo(null);

    // The local stand-in. `at` is this device's clock, which is close enough for a
    // bubble that is about to be replaced by the server's row.
    const pending: GroupMessage = {
      id: `pending-${Date.now()}`,
      authorId: myAuthorId ?? "me",
      authorName: "You",
      body: text,
      replyToId: replyTo?.id,
      at: new Date().toISOString()
    };

    setMessages((current) => [pending, ...current]);

    const result = await friendsService.sendGroupMessage(id, text, replyTo?.id);

    setSending(false);

    if (!result.ok) {
      // Take the bubble back and hand the words back to the field — losing what
      // somebody typed is the one failure a chat must never have.
      setMessages((current) => current.filter((entry) => entry.id !== pending.id));
      setDraft(text);
      setReplyingTo(replyTo);
      // Says which of the four things went wrong. "Check your connection" for a
      // membership refusal sends somebody to their router over a problem no router
      // has — see `SendMessageFailure`.
      Alert.alert("Message not sent", SEND_FAILURE_COPY[result.reason]);

      return;
    }

    setMessages((current) => current.map((entry) => (entry.id === pending.id ? { ...result.message, authorName: "You" } : entry)));
  }

  function confirmDelete(message: GroupMessage) {
    Alert.alert("Delete message?", "It will be removed for everyone in the group.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setMessages((current) => current.filter((entry) => entry.id !== message.id));

          if (!(await friendsService.deleteGroupMessage(message.id))) {
            // Put it back: the row is still there, and a bubble that vanishes on a
            // failed delete is a lie about what the group can see.
            void load();
          }
        }
      }
    ]);
  }

  if (!loaded) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.canvas }]}>
        <ActivityIndicator color={palette.greenDark} />
      </View>
    );
  }

  const sendFill = isDark ? palette.green : palette.greenDark;
  const canSend = draft.trim().length > 0 && !sending;

  return (
    <Screen
      scroll={false}
      contentStyle={styles.screen}
      // The plate the rest of the group's screens sit under, so moving into the
      // chat is not moving into a different app.
      backgroundVariant="groups"
      backgroundIntensity="subtle"
    >
      <ScreenHeader
        title={group?.name ?? "Chat"}
        leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }}
        style={styles.header}
      />

      {/* `padding` on iOS and `height` on Android — the two platforms disagree about
          what a keyboard does to a view, and this is the pair that leaves the input
          visible on both. The offset is the header's own band. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
        keyboardVerticalOffset={insets.top + spacing.lg + 38}
      >
        <FlatList
          inverted
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.flex}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          // Inverted, so the "end" is the TOP of the conversation. Half a screen of
          // warning, which is enough to have the next page in place before anybody
          // reaches the join.
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingOlder ? (
              <View style={styles.olderSpinner}>
                <ActivityIndicator size="small" color={palette.muted} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              quiet
              compact
              art={false}
              title="No messages yet"
              body="Say hello — everyone in the group sees this, and it is the one place here that is not about ticking things off."
            />
          }
          renderItem={({ item, index }) => {
            const mine = Boolean(myAuthorId && item.authorId === myAuthorId) || item.authorName === "You";
            /**
             * The message ABOVE this one on screen, which in a newest-first array is
             * the NEXT index. A run of messages from one person shows the name and
             * face once, at the top of the run — the break is what tells two
             * speakers apart, and a column of the same avatar is noise.
             */
            const above = messages[index + 1];
            const leadsRun = !above || above.authorId !== item.authorId;
            const quoted = item.replyToId ? messages.find((entry) => entry.id === item.replyToId) : undefined;

            return (
              <MessageRow
                message={item}
                quoted={quoted}
                mine={mine}
                leadsRun={leadsRun}
                onReply={() => setReplyingTo(item)}
                onDelete={() => confirmDelete(item)}
              />
            );
          }}
        />

        <View style={[styles.composer, { borderTopColor: palette.hairline, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          {/* What is being answered, above the field, with a way out of it. Without
              this strip a reply is a mode with no indication it is on — you would
              only find out where the message went after sending it. */}
          {replyingTo ? (
            <View style={[styles.replyStrip, { backgroundColor: alpha(palette.ink, isDark ? "1F" : "0D"), borderLeftColor: sendFill }]}>
              <View style={styles.replyStripText}>
                <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.replyAuthor}>
                  Replying to {replyingTo.authorName}
                </AppText>
                <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                  {replyingTo.body}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel reply"
                hitSlop={10}
                onPress={() => setReplyingTo(null)}
              >
                <Icon name="close" size={15} color={palette.muted} weight="bulk" />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.composerRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the group…"
              placeholderTextColor={palette.muted}
              multiline
              maxLength={2000}
              style={[
                styles.input,
                { backgroundColor: isDark ? palette.surface : palette.card, borderColor: palette.hairline, color: palette.ink }
              ]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={() => void send()}
              style={({ pressed }) => [
                styles.send,
                { backgroundColor: canSend ? sendFill : palette.surface, opacity: pressed && canSend ? 0.85 : 1 }
              ]}
            >
              <Icon
                name="forward"
                size={18}
                color={canSend ? readableOn(sendFill, palette.white, 4.5) : palette.muted}
                weight="bold"
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * One message, and the gesture that answers it.
 *
 * ## Pull right to reply
 *
 * A `PanResponder` rather than a button, because a reply is a thing you do TO a
 * message and a button on every bubble would be a control on every line of the
 * conversation. It claims the gesture only when the drag is clearly horizontal and
 * rightward — otherwise the list keeps it, and a chat you cannot scroll is worse
 * than one you cannot reply in.
 *
 * The haptic fires at the threshold rather than on release, so the answer to "have
 * I pulled far enough" arrives while the thumb is still down.
 */
function MessageRow({
  message,
  quoted,
  mine,
  leadsRun,
  onReply,
  onDelete
}: {
  message: GroupMessage;
  /** The message this one answers, resolved from the page. Absent if it is gone. */
  quoted?: GroupMessage;
  mine: boolean;
  leadsRun: boolean;
  onReply: () => void;
  onDelete: () => void;
}) {
  const { palette, isDark } = useLumo();
  const translateX = React.useRef(new Animated.Value(0)).current;
  const armed = React.useRef(false);
  const mineFill = isDark ? palette.green : palette.greenDark;

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        // 1.5× so a diagonal scroll stays a scroll. Rightward only: a left drag is
        // the back gesture on iOS and nothing here should compete with it.
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderGrant: () => {
          armed.current = false;
        },
        onPanResponderMove: (_event, gesture) => {
          const next = Math.max(0, Math.min(REPLY_MAX, gesture.dx));

          translateX.setValue(next);

          if (!armed.current && next >= REPLY_TRIGGER) {
            armed.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          }
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx >= REPLY_TRIGGER) {
            onReply();
          }

          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
        }
      }),
    [onReply, translateX]
  );

  // Fades in as the bubble travels, so the gesture explains itself the first time.
  const hintOpacity = translateX.interpolate({
    inputRange: [0, REPLY_TRIGGER],
    outputRange: [0, 1],
    extrapolate: "clamp"
  });

  return (
    <View style={styles.rowWrap}>
      <Animated.View style={[styles.replyHint, { opacity: hintOpacity }]} pointerEvents="none">
        <Icon name="forward" size={15} color={palette.muted} weight="bold" />
      </Animated.View>

      <Animated.View
        style={[styles.row, mine ? styles.rowMine : null, leadsRun ? styles.rowLeads : null, { transform: [{ translateX }] }]}
        {...responder.panHandlers}
      >
        {!mine ? (
          <View style={styles.avatarSlot}>
            {leadsRun ? <Avatar config={message.authorAvatar ?? defaultAvatar()} size={30} /> : null}
          </View>
        ) : null}

        {/* The name sits ABOVE the bubble, not inside it. Inside, it was a heading
            on a card — every first message of a run looked like a titled panel, and
            the name shared a fill with the words as though it were part of what was
            said. */}
        <View style={[styles.stack, mine ? styles.stackMine : null]}>
          {!mine && leadsRun ? (
            <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.author}>
              {message.authorName}
            </AppText>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${mine ? "Your message" : `${message.authorName}'s message`}: ${message.body}`}
            accessibilityHint={mine ? "Long press to delete" : undefined}
            onLongPress={() => (mine ? onDelete() : undefined)}
            style={({ pressed }) => [
              styles.bubble,
              mine
                ? { backgroundColor: alpha(mineFill, isDark ? "3D" : "1F") }
                : { backgroundColor: palette.card },
              { opacity: pressed && mine ? 0.7 : 1 }
            ]}
          >
            {/* The quote, when the message it answers is still on the page. A bar
                and one line: enough to say which message, never enough to compete
                with the reply itself. */}
            {quoted ? (
              <View style={[styles.quote, { borderLeftColor: alpha(palette.ink, "3D") }]}>
                <AppText variant="caption" color={palette.subtle} numberOfLines={1} style={styles.replyAuthor}>
                  {quoted.authorName}
                </AppText>
                <AppText variant="caption" color={palette.muted} numberOfLines={1}>
                  {quoted.body}
                </AppText>
              </View>
            ) : null}

            <AppText variant="bodySmall" color={palette.ink} style={styles.body}>
              {message.body}
            </AppText>

            <AppText variant="caption" color={palette.muted} style={styles.time}>
              {new Date(message.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </AppText>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The screen owns its own insets: the list has to reach the composer and the
  // composer has to reach the bottom edge, so neither can sit inside the page's
  // usual padding.
  screen: {
    paddingHorizontal: 0,
    paddingTop: 0
  },
  flex: {
    flex: 1
  },
  header: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.lg
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  list: {
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing.xs,
    gap: 2
  },
  olderSpinner: {
    paddingVertical: spacing.sm
  },
  // Holds the hint behind the bubble, so the bubble can slide over it.
  rowWrap: {
    justifyContent: "center"
  },
  // Sits where the bubble will have been dragged from.
  replyHint: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: REPLY_TRIGGER,
    alignItems: "center",
    justifyContent: "center"
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs,
    maxWidth: "86%"
  },
  // Mine sit on the right, and the row is what moves them — not the bubble, so a
  // long message still wraps against the same margin.
  rowMine: {
    alignSelf: "flex-end",
    justifyContent: "flex-end"
  },
  // A break between speakers, and nothing between a run from one.
  rowLeads: {
    marginTop: spacing.sm
  },
  // Reserved even when empty, so a run of messages stays in line with the first
  // one's avatar rather than sliding under it.
  avatarSlot: {
    width: 30
  },
  // Name over bubble. Shrinks so a long message wraps rather than pushing the
  // column past the row's own ceiling.
  stack: {
    flexShrink: 1,
    alignItems: "flex-start"
  },
  stackMine: {
    alignItems: "flex-end"
  },
  /**
   * The speaker's name: dark, and light.
   *
   * `subtle` from the text ramp rather than the brand green — green in Lumo means
   * done, checked in, on track, and a name is none of those. Regular weight over
   * `caption`'s semibold for the same reason a label should not outweigh the
   * sentence it introduces.
   */
  author: {
    fontFamily: fontFamilies.lexend,
    marginLeft: spacing.xxs,
    marginBottom: 1
  },
  /**
   * No border, no shadow — fill alone.
   *
   * A hairline around every bubble drew a box around every sentence, and a hundred
   * of them down a screen read as a form rather than a conversation. The fill is
   * what separates a bubble from the canvas, and the two fills are what separate
   * yours from theirs.
   */
  bubble: {
    flexShrink: 1,
    gap: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md
  },
  quote: {
    gap: 1,
    marginBottom: 3,
    paddingLeft: spacing.xs,
    borderLeftWidth: 2
  },
  replyAuthor: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  body: {
    fontFamily: fontFamilies.lexend,
    lineHeight: 20
  },
  // Right-aligned and quiet: it is a timestamp, not part of the sentence.
  time: {
    alignSelf: "flex-end",
    fontFamily: fontFamilies.lexend,
    fontSize: 10,
    lineHeight: 13
  },
  composer: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs
  },
  replyStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 3
  },
  replyStripText: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderRadius: radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: fontFamilies.lexend,
    fontSize: 15,
    lineHeight: 20
  },
  send: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill
  }
});
