import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import { Alert, Linking, Modal, Pressable, Share, StyleSheet, StyleProp, TextStyle, View, ViewStyle } from "react-native";
import { ActionTile } from "@/components/ActionTile";
import { FloatingDropdown } from "@/components/FloatingDropdown";
import { Avatar } from "@/components/Avatar";
import { Icon, IconName } from "@/components/Icon";
import { AppText, Card, LoadingState, LumoInput, Screen } from "@/components/ui";
import { fontFamilies, layout, radius, spacing, themeColorOptions } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/legal";
import { BackupFrequency } from "@/types/habit";

const LUMO_FACEBOOK_URL = "https://www.facebook.com/lumo.habittracker/";
const backupFrequencyOptions: { label: string; value: BackupFrequency }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" }
];

function SettingsCopy({
  title,
  description,
  titleVariant = "bodySmall",
  titleStyle,
  style
}: {
  title: string;
  description?: string;
  titleVariant?: "titleSmall" | "bodySmall";
  titleStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useLumo();

  return (
    <View style={[styles.copyStack, style]}>
      <AppText variant={titleVariant} color={palette.ink} style={titleStyle}>
        {title}
      </AppText>
      {description ? (
        <AppText variant="bodySmall" color={palette.subtle} style={styles.descriptionText}>
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

function SettingsSectionHeader({ icon, iconNode, title, description, right }: { icon?: IconName; iconNode?: React.ReactNode; title: string; description?: string; right?: React.ReactNode }) {
  const { palette } = useLumo();

  return (
    <View style={styles.sectionHeader}>
      {iconNode ? (
        iconNode
      ) : (
        <View style={[styles.sectionIcon, { backgroundColor: palette.chartTrack }]}>
          <Icon name={icon ?? "smiley"} size={20} color={palette.greenDark} weight="bulk" />
        </View>
      )}
      <SettingsCopy title={title} description={description} titleVariant="titleSmall" titleStyle={styles.sectionTitle} style={styles.sectionCopy} />
      {right ? <View style={styles.sectionRight}>{right}</View> : null}
    </View>
  );
}

function SettingsSwitch({
  checked,
  onPress,
  accessibilityLabel,
  trackColor,
  inactiveTrackColor
}: {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  trackColor: string;
  inactiveTrackColor?: string;
}) {
  const { palette, isDark } = useLumo();
  // In dark mode chartTrack blends into the card background, so the off state
  // uses a translucent tint of the subtle color to stay visible.
  const offTrackColor = isDark ? alpha(palette.subtle, "2E") : inactiveTrackColor ?? palette.chartTrack;
  const switchTrackColor = checked ? trackColor : offTrackColor;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.themeSwitchButton, { opacity: pressed ? 0.76 : 1 }]}
    >
      <View
        style={[
          styles.themeSwitchTrack,
          {
            backgroundColor: switchTrackColor,
            borderColor: switchTrackColor
          }
        ]}
      >
        <View style={[styles.themeSwitchThumb, { transform: [{ translateX: checked ? 16 : 0 }] }]} />
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
    setNickname,
    setThemeMode,
    setColorScheme,
    setNotificationsEnabled,
    setAutoBackupEnabled,
    setBackupFrequency,
    exportData,
    createDataBackup,
    importData
  } = useLumo();
  const [isDataBusy, setIsDataBusy] = useState(false);
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);
  const [colorTriggerRect, setColorTriggerRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const colorTriggerRef = React.useRef<View>(null);
  const openColorMenu = () => {
    colorTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setColorTriggerRect({ x, y, width, height });
      setIsColorMenuOpen(true);
    });
  };
  const activeColorScheme = settings.colorScheme ?? "green";
  const activeColorOption = themeColorOptions.find((option) => option.key === activeColorScheme) ?? themeColorOptions[themeColorOptions.length - 1];
  const notificationsAllowed = settings.notificationStatus === "granted";
  const notificationsEnabled = notificationsAllowed && settings.notificationsEnabled;
  const notificationDescription = notificationsEnabled
    ? "Reminder prompts can be scheduled."
    : settings.notificationStatus === "denied"
      ? "Turn on from system settings."
      : "Turn on before scheduling prompts.";

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

    setIsDataBusy(true);

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
      setIsDataBusy(false);
    }
  }

  async function importSelectedData(uri: string) {
    setIsDataBusy(true);

    try {
      const json = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      await importData(json);
      Alert.alert("Import complete", "Your Lumo data was imported.");
    } catch {
      Alert.alert("Import failed", "Choose a valid Lumo backup JSON file.");
    } finally {
      setIsDataBusy(false);
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
    setIsDataBusy(true);

    try {
      await setAutoBackupEnabled(enabled);
    } catch {
      Alert.alert("Backup failed", "Lumo could not create the Lumo/Backup folder.");
    } finally {
      setIsDataBusy(false);
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
      <View style={styles.screenHeader}>
        <AppText variant="displaySmall" color={palette.ink} style={styles.headerTitle}>
          Settings
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.descriptionText}>
          Keep Lumo gentle and local.
        </AppText>
      </View>

      <Card style={styles.card}>
        <View style={styles.profileHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit avatar" onPress={() => router.push("/avatar")} style={styles.avatarFrame}>
            <View style={[styles.avatarCircle, { backgroundColor: alpha(palette.greenDark, "10") }]} pointerEvents="none" />
            <Avatar config={avatar} size={120} rounded={false} />
          </Pressable>
        </View>
        <View style={[styles.divider, { backgroundColor: palette.hairline }]} />
        <View style={styles.usernameField}>
          <View style={styles.profileCopy}>
            <AppText variant="titleSmall" color={palette.ink} style={styles.profileTitle}>
              Profile
            </AppText>
            <AppText variant="bodySmall" color={palette.subtle} style={styles.profileDescription}>
              Update how Lumo greets you.
            </AppText>
          </View>
          <LumoInput
            value={nickname}
            onChangeText={setNickname}
            placeholder="Your username"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            maxLength={32}
            style={styles.usernameInput}
          />
        </View>
      </Card>

      <Card style={[styles.card, styles.appearanceCard]}>
        <SettingsSectionHeader icon={isDark ? "moon" : "sun"} title="Appearance" description="Tune the app to your current light." />
        <View style={[styles.divider, { backgroundColor: palette.hairline }]} />
        <View style={[styles.row, styles.preferenceRow]}>
          <SettingsCopy title="Dark mode" description="Use the warmer low-light palette." titleStyle={[styles.rowTitle, styles.darkModeTitle]} style={styles.rowText} />
          <SettingsSwitch
            checked={isDark}
            accessibilityLabel="Dark mode"
            onPress={() => setThemeMode(isDark ? "light" : "dark")}
            trackColor={palette.green}
            inactiveTrackColor={palette.chartTrack}
          />
        </View>
        <View style={[styles.optionDivider, { backgroundColor: palette.hairline }]} />
        <View style={styles.colorMenuRoot}>
          <View style={[styles.row, styles.preferenceRow]}>
            <SettingsCopy
              title="Color Theme"
              description="Pick the accent used across light and dark mode."
              titleStyle={[styles.rowTitle, styles.darkModeTitle]}
              style={styles.rowText}
            />
            <Pressable
              ref={colorTriggerRef}
              collapsable={false}
              accessibilityRole="button"
              accessibilityState={{ expanded: isColorMenuOpen }}
              accessibilityLabel="Color theme"
              onPress={() => (isColorMenuOpen ? setIsColorMenuOpen(false) : openColorMenu())}
              style={({ pressed }) => [
                styles.colorTrigger,
                {
                  backgroundColor: palette.surface,
                  borderColor: isColorMenuOpen ? palette.greenDark : palette.hairline,
                  opacity: pressed ? 0.76 : 1
                }
              ]}
            >
              <View style={[styles.colorTriggerSwatch, { backgroundColor: activeColorOption.swatch, borderColor: `${activeColorOption.swatch}66` }]} />
            </Pressable>
          </View>
          <Modal visible={isColorMenuOpen} transparent animationType="none" onRequestClose={() => setIsColorMenuOpen(false)}>
            <Pressable accessibilityLabel="Close color theme menu" onPress={() => setIsColorMenuOpen(false)} style={styles.colorDropdownBackdrop} />
            {colorTriggerRect ? (
              <View
                style={[
                  styles.colorDropdown,
                  {
                    top: colorTriggerRect.y + colorTriggerRect.height + 10,
                    left: colorTriggerRect.x + colorTriggerRect.width - 240,
                    backgroundColor: palette.card,
                    shadowColor: isDark ? "transparent" : palette.shadow
                  }
                ]}
              >
                {themeColorOptions.map((option) => {
                  const selected = activeColorScheme === option.key;

                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="button"
                      accessibilityLabel={option.label}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setColorScheme(option.key);
                        setIsColorMenuOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.colorDropdownOption,
                        {
                          backgroundColor: selected ? `${option.swatch}14` : "transparent",
                          borderColor: selected ? `${option.swatch}33` : "transparent",
                          opacity: pressed ? 0.76 : 1
                        }
                      ]}
                    >
                      <View style={[styles.colorSwatch, { backgroundColor: option.swatch, borderColor: selected ? palette.greenDark : `${option.swatch}66` }]}>
                        {selected ? <Icon name="checkCircle" size={18} color={palette.white} weight="bulk" /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Modal>
        </View>
      </Card>

      <Card style={styles.card}>
        <SettingsSectionHeader icon="notifications" title="Gentle reminders" description="Keep prompts quiet and useful." />
        <View style={[styles.divider, { backgroundColor: palette.hairline }]} />
        <View style={[styles.row, styles.preferenceRow]}>
          <SettingsCopy title="Enable notifications" description={notificationDescription} titleStyle={[styles.rowTitle, styles.darkModeTitle]} style={styles.rowText} />
          <SettingsSwitch
            checked={notificationsEnabled}
            accessibilityLabel="Enable notifications"
            onPress={handleNotificationSwitch}
            trackColor={palette.green}
            inactiveTrackColor={palette.chartTrack}
          />
        </View>
      </Card>

      <Card style={[styles.card, styles.dataCard]}>
        <SettingsSectionHeader icon="download" title="Data" description="Export, import, or back up this device." />
        <View style={[styles.divider, { backgroundColor: palette.hairline }]} />
        <View style={[styles.row, styles.preferenceRow]}>
          <SettingsCopy
            title="Auto backup"
            description="Save a copy in Lumo/Backup/."
            titleStyle={[styles.rowTitle, styles.darkModeTitle]}
            style={styles.rowText}
          />
          <SettingsSwitch
            checked={settings.autoBackupEnabled}
            accessibilityLabel="Auto backup"
            onPress={handleAutoBackupSwitch}
            trackColor={palette.green}
            inactiveTrackColor={palette.chartTrack}
          />
        </View>
        {settings.autoBackupEnabled ? (
          <View style={[styles.row, styles.preferenceRow]}>
            <SettingsCopy
              title="Backup frequency"
              description="Choose how often Lumo saves a copy."
              titleStyle={[styles.rowTitle, styles.darkModeTitle]}
              style={styles.rowText}
            />
            <FloatingDropdown
              options={backupFrequencyOptions}
              value={settings.backupFrequency}
              onChange={setBackupFrequency}
              accessibilityLabel="Backup frequency"
            />
          </View>
        ) : null}
        <View style={[styles.optionDivider, { backgroundColor: palette.hairline }]} />
        <View style={styles.actionGrid}>
          <ActionTile icon="download" label="Export Data" onPress={handleExportData} style={styles.actionButton} />
          <ActionTile icon="upload" label="Import Data" onPress={handleImportData} style={styles.actionButton} />
        </View>
      </Card>

      <Card style={styles.card}>
        <SettingsSectionHeader icon="trash" title="Trash" description="Restore or permanently remove deleted habits." />
        <View style={[styles.divider, { backgroundColor: palette.hairline }]} />
        <View style={styles.actionGrid}>
          <ActionTile
            icon="trash"
            label={deletedHabits.length ? `Open Trash (${deletedHabits.length})` : "Open Trash"}
            onPress={() => router.push("/trash")}
            style={styles.actionButton}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <SettingsSectionHeader
          icon="sparkle"
          title="About Lumo"
          description="A small local space for your routines."
          right={
            <AppText variant="bodySmall" color={palette.subtle} style={styles.aboutVersion}>
              v {Constants.expoConfig?.version ?? "1.0.0"}
            </AppText>
          }
        />
        <View style={[styles.divider, { backgroundColor: palette.hairline }]} />
        <AppText variant="bodySmall" color={palette.subtle} style={styles.aboutDetails}>
          Lumo helps you keep small habits visible, track gentle progress, and keep your routines private on this device.
        </AppText>
        <AppText variant="bodySmall" color={palette.subtle} style={styles.descriptionText}>
          Privacy note: all habit data is stored locally on this device.
        </AppText>
        <View style={styles.legalLinks}>
          <Pressable accessibilityRole="link" accessibilityLabel="Terms of Use" onPress={() => openCommunityLink(TERMS_URL)}>
            <AppText variant="bodySmall" color={palette.greenDark} style={styles.legalLink}>
              Terms of Use
            </AppText>
          </Pressable>
          <AppText variant="bodySmall" color={palette.subtle}>
            ·
          </AppText>
          <Pressable accessibilityRole="link" accessibilityLabel="Privacy Policy" onPress={() => openCommunityLink(PRIVACY_POLICY_URL)}>
            <AppText variant="bodySmall" color={palette.greenDark} style={styles.legalLink}>
              Privacy Policy
            </AppText>
          </Pressable>
        </View>
        <View style={[styles.optionDivider, { backgroundColor: palette.hairline }]} />
        {/* Feature request board hidden for now — restore when the feature ships.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open feature request board"
          onPress={() => router.push("/feature-soon")}
          style={({ pressed }) => [
            styles.communityLink,
            {
              backgroundColor: palette.surface,
              borderColor: palette.hairline,
              opacity: pressed ? 0.76 : 1
            }
          ]}
        >
          <View style={styles.communityContent}>
            <View style={[styles.communityIcon, { backgroundColor: palette.chartTrack }]}>
              <Icon name="star" size={19} color={palette.greenDark} weight="bulk" />
            </View>
            <View style={styles.communityCopy}>
              <AppText variant="bodySmall" color={palette.ink} style={styles.communityTitle}>
                Feature request board
              </AppText>
              <AppText variant="bodySmall" color={palette.subtle} numberOfLines={1} style={styles.descriptionText}>
                Coming soon
              </AppText>
            </View>
          </View>
        </Pressable>
        <View style={[styles.optionDivider, { backgroundColor: palette.hairline }]} />
        */}
        <View style={styles.communitySection}>
          <AppText variant="bodySmall" color={palette.ink} style={styles.rowTitle}>
            Communities
          </AppText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open Lumo Facebook community"
            onPress={() => openCommunityLink(LUMO_FACEBOOK_URL)}
            style={({ pressed }) => [
              styles.communityLink,
              {
                backgroundColor: palette.surface,
                borderColor: palette.hairline,
                opacity: pressed ? 0.76 : 1
              }
            ]}
          >
            <View style={styles.communityContent}>
              <View style={[styles.communityIcon, { backgroundColor: palette.chartTrack }]}>
                <Icon name="facebook" size={19} color={palette.greenDark} weight="bulk" />
              </View>
              <View style={styles.communityCopy}>
                <AppText variant="bodySmall" color={palette.ink} style={styles.communityTitle}>
                  Facebook
                </AppText>
                <AppText variant="bodySmall" color={palette.subtle} numberOfLines={1} style={styles.descriptionText}>
                  lumo.habittracker
                </AppText>
              </View>
            </View>
          </Pressable>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: layout.tabScreenBottomPadding
  },
  screenHeader: {
    marginBottom: spacing.sm,
    gap: spacing.xxs
  },
  headerTitle: {
    fontFamily: "Lexend-Black",
    fontSize: 34,
    lineHeight: 40
  },
  card: {
    gap: spacing.sm
  },
  appearanceCard: {
    position: "relative",
    gap: spacing.xs,
    zIndex: 10,
    elevation: 10
  },
  dataCard: {
    position: "relative",
    zIndex: 9,
    elevation: 9
  },
  sectionHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  profileHeader: {
    alignItems: "center",
    gap: spacing.sm
  },
  avatarFrame: {
    alignItems: "center",
    justifyContent: "center"
  },
  avatarCircle: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60
  },
  profileCopy: {
    alignItems: "flex-start",
    gap: 2
  },
  profileTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  profileDescription: {},
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.nav,
    alignItems: "center",
    justifyContent: "center"
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0
  },
  sectionRight: {
    flexShrink: 0,
    alignSelf: "flex-start"
  },
  copyStack: {
    gap: 4
  },
  sectionTitle: {
    fontFamily: fontFamilies.lexendBold
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  preferenceRow: {
    gap: spacing.xl
  },
  rowText: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    fontFamily: fontFamilies.lexendSemiBold
  },
  darkModeTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15,
    lineHeight: 20
  },
  descriptionText: {
    lineHeight: 16
  },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm
  },
  legalLink: {
    fontFamily: fontFamilies.lexendSemiBold,
    textDecorationLine: "underline"
  },
  themeSwitchButton: {
    width: 38,
    height: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  themeSwitchTrack: {
    width: 38,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "hidden"
  },
  themeSwitchThumb: {
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
  optionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xxs
  },
  usernameField: {
    gap: spacing.sm
  },
  usernameInput: {
    minHeight: 46,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: fontFamilies.lexendSemiBold,
    fontSize: 15
  },
  colorMenuRoot: {
    position: "relative",
    zIndex: 20
  },
  colorTrigger: {
    width: 34,
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 0,
    padding: 0
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  colorTriggerSwatch: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth
  },
  colorDropdownBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  colorDropdown: {
    position: "absolute",
    width: 240,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    borderRadius: radius.nav,
    borderWidth: 0,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 16,
    zIndex: 30
  },
  colorDropdownOption: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth
  },
  infoRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  aboutDetails: {
    lineHeight: 18
  },
  aboutVersion: {
    fontFamily: fontFamilies.lexendBold,
    fontSize: 12,
    lineHeight: 16
  },
  communitySection: {
    gap: spacing.xs
  },
  communityLink: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "flex-start",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  communityContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    width: "100%",
    gap: spacing.sm
  },
  communityIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  communityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  communityTitle: {
    fontFamily: fontFamilies.lexendSemiBold,
    lineHeight: 18
  },
  actionGrid: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  actionButton: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.pill
  }
});
