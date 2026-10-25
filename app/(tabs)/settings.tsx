import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { ReactNode, useState } from "react";
import { ActivityIndicator, Alert, Linking, Modal, Share, StyleSheet, View } from "react-native"
import { Avatar } from "@/components/Avatar";
import { FloatingDropdown } from "@/components/FloatingDropdown";
import { Icon, IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, LoadingState, LumoInput, Screen } from "@/components/ui";
import { WheelTimePicker } from "@/components/WheelTimePicker";
import { CHECK_INS, checkInTimeFor, checkInTimeLabel, type CheckIn } from "@/constants/checkIns";
import { APPEARANCE_ENABLED, fontFamilies, layout, radius, spacing, THEME_PICKER_ENABLED } from "@/constants/theme";
import { ThemePicker } from "@/components/ThemePicker";
import { SegmentedControl } from "@/components/controls";
import { useLumo } from "@/context/LumoContext";
import { alpha, readableOn } from "@/lib/color";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/legal";
import { BackupFrequency, TextSize, ThemeMode } from "@/types/habit";
import { Pressable } from "@/components/Pressable"

const LUMO_FACEBOOK_URL = "https://www.facebook.com/lumo.habitcompanion";
/** Accessibility text sizes, labelled by what they do rather than by point size. */
const textSizeOptions: { label: string; value: TextSize }[] = [
  { label: "Default", value: "default" },
  { label: "Large", value: "large" },
  { label: "Larger", value: "larger" }
];
const backupFrequencyOptions: { label: string; value: BackupFrequency }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" }
];
/**
 * Light and dark are the explicit choices; "System" follows the device. Ordered
 * light → dark → system so the two concrete options sit together and the
 * deferring one closes the row.
 */
const themeModeOptions: { label: string; value: ThemeMode }[] = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" }
];

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  return days === 1 ? "Yesterday" : `${days}d ago`;
}

/** Card that groups rows; rows draw their own hairline separators. */
function SettingsGroup({ children }: { children: ReactNode }) {
  const { palette, isDark } = useLumo();

  return <View style={[styles.group, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>{children}</View>;
}

/**
 * One settings line: icon bubble, copy, and a trailing control. `right` wins
 * over `value`; a row with `onPress` and neither gets a chevron so it still
 * reads as tappable.
 */
function SettingsRow({
  icon,
  title,
  body,
  value,
  right,
  onPress,
  chevron = true,
  disabled = false,
  last = false
}: {
  icon: IconName;
  title: string;
  body?: string;
  /** Trailing pill, shown before the chevron. */
  value?: string;
  /** Trailing control (switch, dropdown) — replaces the chevron. */
  right?: ReactNode;
  onPress?: () => void;
  /** False for rows that act in place rather than opening a screen — the
   *  chevron is a promise of somewhere to go, so it shouldn't appear. */
  chevron?: boolean;
  disabled?: boolean;
  last?: boolean;
}) {
  const { palette } = useLumo();
  const separator = !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.hairline };
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: alpha(palette.greenDark, "14") }]}>
        <Icon name={icon} size={18} color={palette.greenDark} weight="bulk" />
      </View>
      <View style={styles.rowCopy}>
        {/* The pill sits with the title it counts, not out at the row's edge
            where it reads as a second, unrelated control. */}
        <View style={styles.rowTitleLine}>
          <AppText variant="bodySmall" color={palette.ink} numberOfLines={1} style={styles.rowTitle}>
            {title}
          </AppText>
          {value ? (
            <View style={[styles.rowPill, { backgroundColor: alpha(palette.danger, "24") }]}>
              <AppText variant="caption" color={palette.dangerFill} numberOfLines={1} style={styles.rowPillText}>
                {value}
              </AppText>
            </View>
          ) : null}
        </View>
        {body ? (
          <AppText variant="caption" color={palette.subtle} numberOfLines={2} style={styles.rowBody}>
            {body}
          </AppText>
        ) : null}
      </View>
      {right ?? (onPress && chevron ? <Icon name="forward" size={16} color={palette.muted} weight="bold" /> : null)}
    </>
  );

  // Rows that only host a control (switch, dropdown) stay plain views — a
  // wrapping Pressable would compete with the control for the touch.
  if (!onPress) {
    return <View style={[styles.row, separator]}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, body, value].filter(Boolean).join(". ")}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, separator, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

function SettingsSwitch({
  checked,
  onPress,
  accessibilityLabel
}: {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { palette, isDark } = useLumo();
  // In dark mode chartTrack blends into the card background, so the off state
  // uses a translucent tint of the subtle color to stay visible.
  const offTrackColor = isDark ? alpha(palette.subtle, "2E") : palette.chartTrack;
  const switchTrackColor = checked ? palette.green : offTrackColor;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.switchButton, { opacity: pressed ? 0.76 : 1 }]}
    >
      <View style={[styles.switchTrack, { backgroundColor: switchTrackColor, borderColor: switchTrackColor }]}>
        <View style={[styles.switchThumb, { transform: [{ translateX: checked ? 16 : 0 }] }]} />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const {
    isReady,
    nickname,
    palette,
    settings,
    deletedHabits,
    isDark,
    avatar,
    themeId,
    setNickname,
    setThemeId,
    setThemeMode,
    setNotificationsEnabled,
    setCheckInEnabled,
    setCheckInTime,
    setAutoBackupEnabled,
    setBackupFrequency,
    setTextSize,
    exportData,
    createDataBackup,
    importData
  } = useLumo();
  // Which data operation is running — not a single flag. A shared boolean made
  // flipping Auto backup dim the Export row and flash a pill on it, since the
  // directory write and the export both raised the same state.
  const [busyAction, setBusyAction] = useState<"export" | "import" | "backup" | null>(null);
  /** The check-in whose time is being edited, or null when the sheet is shut. */
  const [timeTarget, setTimeTarget] = useState<CheckIn | null>(null);
  const isDataBusy = busyAction !== null;
  const notificationsAllowed = settings.notificationStatus === "granted";
  const notificationsEnabled = notificationsAllowed && settings.notificationsEnabled;
  const notificationDescription = notificationsEnabled
    ? "Reminder prompts can be scheduled."
    : settings.notificationStatus === "denied"
      ? "Turn on from system settings."
      : "Turn on before scheduling prompts.";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  // A 5% wash that darkens the name field a shade against the card behind it.
  // Taken from `shadow` because that token is dark in BOTH themes, where `ink`
  // would lighten the field in dark mode rather than deepen it.
  const nameFieldFill = alpha(palette.shadow, "0D");

  if (!isReady) {
    return <LoadingState />;
  }

  function openSystemSettings() {
    Linking.openSettings().catch(() => undefined);
  }

  function openCommunityLink(url: string) {
    Linking.openURL(url).catch(() => {
      Alert.alert("Could not open link", "Please try again in a moment.");
    });
  }

  async function handleExportData() {
    if (isDataBusy) {
      return;
    }

    setBusyAction("export");

    try {
      const uri = await createDataBackup();

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          dialogTitle: "Export Lumo data",
          mimeType: "application/json",
          UTI: "public.json"
        });
      } else {
        await Share.share({ message: exportData(), title: "Lumo habit data" });
      }

    } catch {
      Alert.alert("Export failed", "Lumo could not create the export file.");
    } finally {
      setBusyAction(null);
    }
  }

  async function importSelectedData(uri: string) {
    setBusyAction("import");

    try {
      const json = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      await importData(json);
      Alert.alert("Import complete", "Your Lumo data was imported.");
    } catch {
      Alert.alert("Import failed", "Choose a valid Lumo backup JSON file.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleImportData() {
    if (isDataBusy) {
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "text/plain"],
      copyToCacheDirectory: true
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const selectedFile = result.assets[0];

    Alert.alert("Import data?", "This replaces your current Lumo data with the selected backup.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Import",
        onPress: () => {
          importSelectedData(selectedFile.uri).catch(() => undefined);
        }
      }
    ]);
  }

  async function handleAutoBackupSwitch() {
    if (isDataBusy) {
      return;
    }

    const enabled = !settings.autoBackupEnabled;
    setBusyAction("backup");

    try {
      await setAutoBackupEnabled(enabled);
    } catch {
      Alert.alert("Backup failed", "Lumo could not create the Lumo/Backup folder.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleNotificationSwitch() {
    if (notificationsEnabled) {
      await setNotificationsEnabled(false);
      return;
    }

    if (settings.notificationStatus === "denied") {
      Alert.alert("Notifications are off", "Enable notifications for Lumo in system settings.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: openSystemSettings }
      ]);
      return;
    }

    await setNotificationsEnabled(true);
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeader title="Settings" leftAction={{ icon: "back", label: "Back", onPress: () => router.back() }} />

      {/* On the canvas above the card, not in it — it is the one thing on this
          page you look at rather than read. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit avatar"
        onPress={() => router.push("/avatar")}
        style={({ pressed }) => [styles.avatarFrame, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Avatar config={avatar} size={116} backgroundColor={palette.greenSoft} />
        <View style={[styles.avatarEdit, { backgroundColor: isDark ? palette.green : palette.greenDark, borderColor: palette.canvas }]}>
          <Icon name="edit" size={14} color={palette.white} weight="bulk" />
        </View>
      </Pressable>

      <View style={[styles.card, { backgroundColor: palette.card, shadowColor: isDark ? "transparent" : palette.shadow }]}>
        {/* No label — the placeholder says what it is, and it is the only field
            on the card. */}
        <LumoInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="Your username"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={32}
          // LumoInput defaults to palette.card, the colour of the card it sits
          // on; this settles the field a shade into it.
          style={[styles.nameInput, { backgroundColor: nameFieldFill }]}
        />
      </View>

      {/* Appearance, on its own card and above notifications: it is the setting
          people come here to change, and it is the only one whose effect is
          visible while you are still looking at it.

          Not a SettingsRow — a swatch strip and a three-way control both want
          the full width, and squeezing either into a row's trailing slot is
          what makes settings screens feel cramped.

          The whole card is held back while APPEARANCE_ENABLED is false, and the
          app runs on cream + light. Behind a flag rather than commented out so
          it stays typechecked and `setThemeId`/`setThemeMode` stay referenced
          bindings rather than dead ones. */}
      {APPEARANCE_ENABLED ? (
        <SettingsGroup>
          <View style={styles.appearanceBlock}>
            {/* The hue families, on their own flag. Lumo wears cream while they
                wait — see `THEME_PICKER_ENABLED`. The light/dark control below
                is not held back with them: a mode is the same app lit for a
                dark room, where four palettes are four times the surface to get
                wrong. */}
            {THEME_PICKER_ENABLED ? (
              <>
                <View style={styles.appearanceLabel}>
                  <AppText color={palette.ink} style={styles.appearanceTitle}>
                    Theme
                  </AppText>
                  <AppText variant="bodySmall" color={palette.subtle}>
                    The colour Lumo wears.
                  </AppText>
                </View>
                <View style={styles.themeRow}>
                  <ThemePicker value={themeId} onChange={setThemeId} />
                </View>
              </>
            ) : null}

            <View style={styles.appearanceLabel}>
              <AppText color={palette.ink} style={styles.appearanceTitle}>
                Appearance
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle}>
                Use the warmer low-light palette after dark.
              </AppText>
            </View>
            <SegmentedControl options={themeModeOptions} value={settings.themeMode} onChange={setThemeMode} />
          </View>
        </SettingsGroup>
      ) : null}

      <SettingsGroup>
        <SettingsRow
          icon="notifications"
          title="Notifications"
          body={notificationDescription}
          right={<SettingsSwitch checked={notificationsEnabled} accessibilityLabel="Enable notifications" onPress={handleNotificationSwitch} />}
          last={!notificationsEnabled}
        />
        {/* The same four nudges onboarding offers, in the same order — this is
            the only place to change them afterwards. Nested under the master
            switch, and hidden while it is off: a per-slot toggle that cannot
            fire anything is just a control that lies. */}
        {/* Tapping the row opens the time picker; the switch stays its own
            target, so turning a nudge on doesn't drag you through a sheet you
            didn't ask for. The times used to be fixed labels — the row read
            like something you could change and wasn't. */}
        {notificationsEnabled
          ? CHECK_INS.map((checkIn, index) => (
              <SettingsRow
                key={checkIn.key}
                icon={checkIn.icon}
                title={checkIn.label}
                body={checkInTimeLabel(checkIn, settings.checkInTimes)}
                onPress={() => setTimeTarget(checkIn)}
                chevron={false}
                right={
                  <SettingsSwitch
                    checked={settings.checkIns[checkIn.key]}
                    accessibilityLabel={checkIn.label}
                    onPress={() => setCheckInEnabled(checkIn.key, !settings.checkIns[checkIn.key])}
                  />
                }
                last={index === CHECK_INS.length - 1}
              />
            ))
          : null}
      </SettingsGroup>

      <SettingsGroup>
        {/* "Badges", not "Trophies" — the destination is the streak-badge
            shelf, and Trophies is a different thing entirely (the group award
            shelf, reached from a group). Two names for one screen and one name
            for two screens at the same time. */}
        <SettingsRow icon="award" title="Badges" body="Every badge you have earned so far" onPress={() => router.push("/badges")} />
        <SettingsRow
          icon="trash"
          title="Trash"
          body="Restore habits you deleted"
          value={deletedHabits.length ? `${deletedHabits.length}` : undefined}
          onPress={() => router.push("/trash")}
        />
        {/* The spinner takes the chevron's slot rather than sitting beside it,
            so the copy column keeps its width while the file is written. */}
        <SettingsRow
          icon="download"
          title="Export Data"
          body="Share a JSON copy of your habit data"
          right={busyAction === "export" ? <ActivityIndicator size="small" color={palette.greenDark} /> : undefined}
          onPress={handleExportData}
          chevron={false}
          disabled={busyAction === "export"}
        />
        <SettingsRow
          icon="upload"
          title="Import Data"
          body="Replace this device's data with a backup"
          right={busyAction === "import" ? <ActivityIndicator size="small" color={palette.greenDark} /> : undefined}
          onPress={handleImportData}
          chevron={false}
          disabled={busyAction === "import"}
        />
        <SettingsRow
          icon="cloudPlus"
          title="Auto backup"
          body={settings.lastBackupAt ? `Last backup: ${timeAgo(settings.lastBackupAt)}` : "Save a copy in Lumo/Backup/."}
          right={<SettingsSwitch checked={settings.autoBackupEnabled} accessibilityLabel="Auto backup" onPress={handleAutoBackupSwitch} />}
          last={!settings.autoBackupEnabled}
        />
        {settings.autoBackupEnabled ? (
          <SettingsRow
            icon="clock"
            title="Backup frequency"
            body="How often Lumo saves a copy"
            right={
              <FloatingDropdown
                options={backupFrequencyOptions}
                value={settings.backupFrequency}
                onChange={setBackupFrequency}
                accessibilityLabel="Backup frequency"
              />
            }
            last
          />
        ) : null}
      </SettingsGroup>

      {/* Accessibility, on its own card. Lumo caps the OS Dynamic Type
          multiplier so a device's own Text Size can't distort these layouts,
          which makes this the only way to get larger type — it deserves its own
          heading rather than sitting as one line among notification toggles. */}
      <SettingsGroup>
        <SettingsRow
          icon="sliders"
          title="Text size"
          body="Make text and icons easier to read"
          right={
            <FloatingDropdown
              options={textSizeOptions}
              value={settings.textSize ?? "default"}
              onChange={setTextSize}
              accessibilityLabel="Text size"
            />
          }
          last
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow icon="messages" title="Help & Support" body="FAQs, guides, and contact us" onPress={() => router.push("/faqs")} />
        <SettingsRow icon="book" title="Tips & Guides" body="Short reads on making habits stick" onPress={() => router.push("/tips")} />
        {/* Feature Board hidden for now — restore when the board ships.
        <SettingsRow
          icon="star"
          title="Feature Board"
          body="Request features and vote on ideas"
          onPress={() => router.push("/feature-requests")}
        />
        */}
        <SettingsRow
          icon="facebook"
          title="Facebook community"
          body="lumo.habitcompanion"
          onPress={() => openCommunityLink(LUMO_FACEBOOK_URL)}
          last
        />
      </SettingsGroup>

      {/* No card and no icon — it is a paragraph about the app rather than a row
          you act on, so it reads as the page signing off rather than as one more
          thing to tap. */}
      <View style={styles.about}>
        <View style={[styles.rowPill, { backgroundColor: alpha(palette.accent, "24") }]}>
          <AppText variant="caption" color={readableOn(palette.accent, palette.card, 4.5)} style={styles.rowPillText}>
            v{appVersion}
          </AppText>
        </View>
        <AppText variant="bodySmall" color={palette.ink} style={styles.rowTitle}>
          About Lumo
        </AppText>
        <AppText variant="caption" color={palette.subtle} style={styles.aboutBody}>
          A small, quiet space for your daily routines — the habits you are building, the journal you keep beside them, and the progress that gathers
          between the two. No streaks to defend, no feed to keep up with.
        </AppText>
      </View>

      {/* Footer — the privacy promise and the legal links, off-card so the page
          ends quietly rather than on another slab. */}
      <View style={styles.footer}>
        <AppText variant="caption" color={palette.subtle} style={styles.footerNote}>
          All habit data is stored locally on this device.
        </AppText>
        <View style={styles.legalLinks}>
          <Pressable accessibilityRole="link" accessibilityLabel="Terms of Use" onPress={() => openCommunityLink(TERMS_URL)} hitSlop={8}>
            <AppText variant="caption" color={palette.greenDark} style={styles.legalLink}>
              Terms of Use
            </AppText>
          </Pressable>
          <AppText variant="caption" color={palette.muted}>
            ·
          </AppText>
          <Pressable accessibilityRole="link" accessibilityLabel="Privacy Policy" onPress={() => openCommunityLink(PRIVACY_POLICY_URL)} hitSlop={8}>
            <AppText variant="caption" color={palette.greenDark} style={styles.legalLink}>
              Privacy Policy
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Same sheet the habit form uses for a reminder time, so a time is
          picked one way everywhere in the app. Writing on every turn of the
          wheel is deliberate: the preference is the source of truth and the
          scheduler re-syncs off it, so there is nothing to commit on Done. */}
      <Modal transparent animationType="none" visible={timeTarget !== null} onRequestClose={() => setTimeTarget(null)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={() => setTimeTarget(null)} />
          {timeTarget ? (
            <View style={[styles.pickerSheet, { backgroundColor: palette.card }]}>
              <AppText variant="titleSmall" color={palette.ink} style={styles.pickerTitle}>
                {timeTarget.label}
              </AppText>
              <WheelTimePicker
                value={checkInTimeFor(timeTarget, settings.checkInTimes)}
                onChange={(next) => setCheckInTime(timeTarget.key, next)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Done"
                onPress={() => setTimeTarget(null)}
                style={({ pressed }) => [
                  styles.pickerDoneButton,
                  { backgroundColor: isDark ? palette.green : palette.greenDark, opacity: pressed ? 0.88 : 1 }
                ]}
              >
                <AppText variant="button" color={palette.white} style={styles.pickerDoneLabel}>
                  Done
                </AppText>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    // The floating tab bar stays visible over this screen, so clear it.
    paddingBottom: layout.tabScreenBottomPadding,
    // Cards carry their own padding, so the stack between them stays tight.
    gap: spacing.sm
  },
  card: {
    // Same inset as HabitCard, so every card on the page shares one geometry.
    padding: spacing.md,
    borderRadius: radius.card,
    gap: spacing.md,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2
  },
  // A direct child of the screen's column, so it centres itself.
  avatarFrame: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.ml
  },
  // Sits on the disc's lower-right edge; the ring in the card colour separates
  // it from the avatar behind it.
  // Inset from the corner: on a circle, the bounding box's corner sits outside
  // the disc, so a badge pinned to 0,0 floats off its edge.
  avatarEdit: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  nameInput: {
    minHeight: 46,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15
  },
  // The card's vertical inset normally comes from its rows; this block has no
  // rows, so it brings its own to land on the same spacing.md edge.
  appearanceBlock: {
    paddingVertical: spacing.md,
    gap: spacing.sm
  },
  appearanceLabel: {
    gap: 2
  },
  appearanceTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15
  },
  // The picker brings its own layout; this only adds the trailing space before
  // the next label, since the swatches are the loudest thing on the card.
  themeRow: {
    marginBottom: spacing.xs
  },
  // The lightest band takes the most room, so a tile reads as "a light surface
  // with two accents" — which is what the theme actually looks like in use.
  group: {
    // Vertical inset comes from the rows themselves, so the first and last row
    // land on the same spacing.md edge as the horizontal one.
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    // HabitCard geometry: spacing.md inset, 66pt minimum.
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 66
  },
  // A rounded square, not a disc. At 36pt `radius.lg` is exactly half the tile,
  // so the corner ran all the way round and every row opened with a circle —
  // the shape the app reserves for avatars and transport controls.
  rowIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  rowTitle: {
    // Yields to the pill beside it rather than pushing it out of the row.
    flexShrink: 1,
    fontFamily: fontFamilies.lexendSemiBold
  },
  rowBody: {
    fontFamily: fontFamilies.lexend,
    lineHeight: 16
  },
  // Snug to the numeral — it sits inline with the title, so it should read as a
  // count on the label rather than as a button next to it.
  rowPill: {
    minWidth: 20,
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill
  },
  rowPillText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fontFamilies.lexendSemiBold
  },
  switchButton: {
    width: 38,
    height: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  switchTrack: {
    width: 38,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "hidden"
  },
  switchThumb: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: "#FFFFFF",
    shadowColor: "#141413",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    elevation: 2
  },
  about: {
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.lg
  },
  aboutBody: {
    fontFamily: fontFamilies.lexend,
    lineHeight: 18,
    textAlign: "center"
  },
  footer: {
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  footerNote: {
    fontFamily: fontFamilies.lexend,
    textAlign: "center"
  },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  legalLink: {
    fontFamily: fontFamilies.lexendSemiBold,
    textDecorationLine: "underline"
  },
  // The habit form's time sheet, to the point — one picker, one look.
  pickerBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(0, 0, 0, 0.35)"
  },
  pickerSheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.dialog,
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: spacing.xl
  },
  pickerTitle: {
    fontFamily: fontFamilies.lexendBold,
    textAlign: "center",
    marginBottom: spacing.sm
  },
  pickerDoneButton: {
    marginTop: spacing.md,
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  pickerDoneLabel: {
    fontSize: 17
  }
});
