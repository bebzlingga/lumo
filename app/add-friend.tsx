import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, Button, Screen } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { friendsService } from "@/lib/friends";
import { formatLumoId } from "@/lib/lumoId";

/**
 * Landing screen for `lumo://add-friend?id=…` deep links (QR scans and invite
 * messages). Sends the friend request through the backend; when sync is
 * offline it confirms the ID was received and explains what's next.
 */
export default function AddFriendScreen() {
  const router = useRouter();
  const { palette, lumoIdSuffix } = useLumo();
  const params = useLocalSearchParams<{ id?: string }>();
  const friendId = typeof params.id === "string" ? params.id : "";
  const syncOffline = friendsService.status() === "offline";
  const isSelf = friendId === formatLumoId(lumoIdSuffix);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const canSend = Boolean(friendId) && !syncOffline && !isSelf && !sent;

  async function sendRequest() {
    if (sending) {
      return;
    }
    setSending(true);
    try {
      const ok = await friendsService.sendRequest(friendId);
      if (ok) {
        setSent(true);
      } else {
        Alert.alert("Couldn't send request", "No Lumo user was found with this ID — or you've already sent them a request.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      <View style={styles.hero}>
        <View style={[styles.badge, { backgroundColor: palette.greenSoft }]}>
          <Icon name={sent ? "checkCircle" : "friends"} size={30} color={palette.greenDark} weight="bulk" />
        </View>
        <AppText color={palette.ink} style={styles.title}>
          {sent ? "Request sent!" : "Add a friend"}
        </AppText>
        {friendId ? (
          <View style={[styles.idPill, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
            <AppText color={palette.greenDark} style={styles.idText}>
              {friendId}
            </AppText>
          </View>
        ) : null}
        <AppText variant="bodySmall" color={palette.subtle} style={styles.subtitle}>
          {!friendId
            ? "This invite link is missing a Lumo ID. Ask your friend to share it again."
            : isSelf
              ? "That's your own Lumo ID — share it with a friend instead."
              : sent
                ? "We'll let them know. Once they accept, you'll see each other on the Friends tab."
                : syncOffline
                  ? "Friend connections sync in an upcoming update — hang tight! Save this ID and add each other as soon as it goes live."
                  : "Send a friend request to start sharing goals together."}
        </AppText>
      </View>

      {canSend ? (
        <Button label={sending ? "Sending…" : "Send friend request"} variant="primary" disabled={sending} onPress={sendRequest} />
      ) : (
        <Button label="Done" variant="primary" onPress={() => router.back()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.xl
  },
  hero: {
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontFamily: "Lexend-Black",
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center"
  },
  idPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2
  },
  idText: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 18,
    lineHeight: 24
  },
  subtitle: {
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 20
  }
});
