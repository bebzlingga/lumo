import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { CategoryChips, categoryNamePlaceholders } from "@/components/CategoryChips";
import { FloatingDropdown } from "@/components/FloatingDropdown";
import { IconName } from "@/components/Icon";
import { IconPicker, categoryIconOptions } from "@/components/IconPicker";
import { OnboardingIllustration } from "@/components/OnboardingIllustrations";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AppText, FieldLabel, LoadingState, LumoInput, Screen } from "@/components/ui";
import { fontFamilies, habitColors, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { alpha } from "@/lib/color";
import { toDateKey } from "@/lib/date";
import { type GoalType, type HabitCategory, type HabitDraft, type RepeatSchedule } from "@/types/habit";

const slides = [
  {
    title: "Manage Your Daily Habits",
    body: "Keep your streaks by completing daily tasks. Reach small goals with consistent habits.",
    illustration: "habits" as const
  },
  {
    title: "Watch Progress Glow",
    body: "See every bright dot, streak, and completion rate come together as your routine grows.",
    illustration: "progress" as const
  },
  {
    title: "Challenge Yourself!",
    body: "Set clear targets, build momentum, and keep showing up for the version of you that is forming.",
    illustration: "challenge" as const
  }
];

type OnboardingStep = "slides" | "nickname" | "habit";
type BasicFrequency = Extract<RepeatSchedule["type"], "daily" | "weekdays" | "weekends">;
const ONBOARDING_PX = spacing.xl;
const frequencyOptions: { label: string; value: BasicFrequency }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Weekends", value: "weekends" }
];
const goalOptions: { label: string; value: GoalType["type"] }[] = [
  { label: "Once per day", value: "once" },
  { label: "Multiple times", value: "multiple" },
  { label: "Weekly target", value: "weekly" },
  { label: "Monthly target", value: "monthly" }
];

function OnboardingCta({
  label,
  onPress,
  disabled = false
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { palette, isDark } = useLumo();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.onboardingButtonPressable, { opacity: disabled ? 0.45 : pressed ? 0.82 : 1 }]}
    >
      <View style={[styles.onboardingButton, { backgroundColor: isDark ? palette.green : palette.greenDark, shadowColor: isDark ? "transparent" : palette.greenDark }]}>
        <AppText variant="button" color={palette.white}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

function ProgressDots({ index }: { index: number }) {
  const { palette } = useLumo();

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dots}>
      {slides.map((slide, dotIndex) => (
        <View
          key={slide.title}
          style={[
            styles.dot,
            {
              backgroundColor: dotIndex === index ? palette.ink : palette.green,
              opacity: dotIndex === index ? 1 : 0.32,
              width: dotIndex === index ? 28 : 5
            }
          ]}
        />
      ))}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const slideScrollRef = useRef<ScrollView>(null);
  const { createHabit, isReady, hasOnboarded, nickname, palette, setNickname } = useLumo();
  // Resting bottom-border for inputs and selects — matches the create-habit form.
  const fieldBorderColor = alpha(palette.greenDark, "33");
  const [step, setStep] = useState<OnboardingStep>("slides");
  const [slideIndex, setSlideIndex] = useState(0);
  const [nicknameDraft, setNicknameDraft] = useState(nickname);
  const [firstHabitName, setFirstHabitName] = useState("");
  const [firstHabitCategory, setFirstHabitCategory] = useState<HabitCategory>("General");
  const [firstHabitEmoji, setFirstHabitEmoji] = useState<IconName>(categoryIconOptions.General[0]);
  const [firstHabitFrequency, setFirstHabitFrequency] = useState<BasicFrequency>("daily");
  const [firstHabitGoalType, setFirstHabitGoalType] = useState<GoalType["type"]>("once");
  const [firstHabitGoalAmount, setFirstHabitGoalAmount] = useState("3");
  const [isSavingHabit, setIsSavingHabit] = useState(false);

  const illustrationWidth = useMemo(() => Math.min(width - ONBOARDING_PX * 2, 330), [width]);
  const slideWidth = width - ONBOARDING_PX * 2;

  useEffect(() => {
    if (isReady && hasOnboarded) {
      router.replace("/(tabs)/today");
    }
  }, [hasOnboarded, isReady, router]);

  // Slide + fade the first-habit step in when arriving from the nickname step.
  const habitStepAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (step !== "habit") {
      return;
    }

    habitStepAnim.setValue(0);
    Animated.timing(habitStepAnim, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [step, habitStepAnim]);

  if (!isReady || hasOnboarded) {
    return <LoadingState />;
  }

  function goNext() {
    if (slideIndex < slides.length - 1) {
      const nextIndex = slideIndex + 1;
      setSlideIndex(nextIndex);
      slideScrollRef.current?.scrollTo({ x: nextIndex * slideWidth, animated: true });
      return;
    }

    setStep("nickname");
  }

  function updateSlideIndex(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);

    if (nextIndex !== slideIndex) {
      setSlideIndex(Math.min(Math.max(nextIndex, 0), slides.length - 1));
    }
  }

  function handleCategoryChange(category: HabitCategory) {
    setFirstHabitCategory(category);
    // Switch the icon to the new category's default so it visibly follows the
    // category (the name placeholder follows via categoryNamePlaceholders).
    setFirstHabitEmoji(categoryIconOptions[category][0]);
  }

  function continueToHabit() {
    const cleanNickname = nicknameDraft.trim();

    if (!cleanNickname) {
      Alert.alert("Nickname needed", "What should Lumo call you?");
      return;
    }

    setNickname(cleanNickname);
    setStep("habit");
  }

  async function finishOnboarding() {
    const cleanHabitName = firstHabitName.trim();

    if (!cleanHabitName) {
      Alert.alert("First habit needed", "Start with one small habit you can repeat.");
      return;
    }

    const draft: HabitDraft = {
      name: cleanHabitName,
      category: firstHabitCategory,
      emoji: firstHabitEmoji,
      color: habitColors[0],
      createdAt: toDateKey(),
      reminderEnabled: false,
      reminderMode: "time",
      reminderTime: "09:00",
      reminderIntervalValue: 1,
      reminderIntervalUnit: "hours",
      repeatSchedule: { type: firstHabitFrequency },
      goal:
        firstHabitGoalType === "multiple"
          ? { type: "multiple", count: Math.max(2, Number(firstHabitGoalAmount) || 2) }
          : firstHabitGoalType === "weekly" || firstHabitGoalType === "monthly"
            ? { type: firstHabitGoalType, target: Math.max(1, Number(firstHabitGoalAmount) || 1) }
            : { type: "once" }
    };

    setIsSavingHabit(true);

    try {
      await createHabit(draft);
      router.replace("/(tabs)/today");
    } finally {
      setIsSavingHabit(false);
    }
  }

  if (step === "nickname") {
    return (
      <Screen contentStyle={styles.screen}>
        <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => setStep("slides") }} />
        <View style={styles.formMainContent}>
          <View style={styles.heroArea}>
            <OnboardingIllustration name="nickname" palette={palette} width={illustrationWidth} height={238} />
          </View>

          <View style={styles.copy}>
            <AppText variant="displaySmall" style={styles.title}>
              What should we call you?
            </AppText>
            <AppText variant="body" color={palette.subtle} style={styles.body}>
              Add a nickname so Lumo's nudges and little wins feel more like yours.
            </AppText>
          </View>

          <View style={styles.nicknameField}>
            <LumoInput
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              placeholder="Your nickname"
              autoCapitalize="words"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={continueToHabit}
              style={[styles.flatInput, { borderColor: fieldBorderColor, textAlign: "center", fontSize: 22 }]}
            />
          </View>
        </View>

        <View style={styles.bottomAction}>
          <OnboardingCta label="NEXT" onPress={continueToHabit} disabled={!nicknameDraft.trim()} />
        </View>
      </Screen>
    );
  }

  if (step === "habit") {
    return (
      <Screen contentStyle={styles.screen}>
        <ScreenHeader leftAction={{ icon: "back", label: "Back", onPress: () => setStep("nickname") }} />
        <Animated.View
          style={[
            styles.formMainContent,
            {
              opacity: habitStepAnim,
              transform: [{ translateX: habitStepAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }]
            }
          ]}
        >
          <View style={styles.copy}>
            <AppText variant="displaySmall" style={styles.title}>
              Let's add your first habit.
            </AppText>
            <AppText variant="body" color={palette.subtle} style={styles.body}>
              Start with one small promise to yourself. Keep it simple today, and you can update the details later.
            </AppText>
          </View>

          <View style={styles.firstHabitForm}>
            <CategoryChips value={firstHabitCategory} onChange={handleCategoryChange} edgePadding={ONBOARDING_PX + spacing.md} />

            <View style={styles.formField}>
              <FieldLabel>Habit name</FieldLabel>
              <LumoInput
                value={firstHabitName}
                onChangeText={setFirstHabitName}
                placeholder={categoryNamePlaceholders[firstHabitCategory]}
                autoCapitalize="sentences"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={finishOnboarding}
                style={[styles.flatInput, { borderColor: fieldBorderColor }]}
              />
            </View>

            <View style={styles.formField}>
              <FieldLabel>Icon</FieldLabel>
              <IconPicker category={firstHabitCategory} value={firstHabitEmoji} onChange={setFirstHabitEmoji} />
            </View>

            <View style={styles.formField}>
              <FieldLabel>Frequency</FieldLabel>
              <FloatingDropdown
                variant="input"
                options={frequencyOptions}
                value={firstHabitFrequency}
                onChange={setFirstHabitFrequency}
                accessibilityLabel="First habit frequency"
                borderColor={fieldBorderColor}
              />
            </View>

            <View style={styles.formField}>
              <FieldLabel>Target</FieldLabel>
              <FloatingDropdown
                variant="input"
                options={goalOptions}
                value={firstHabitGoalType}
                onChange={setFirstHabitGoalType}
                accessibilityLabel="First habit target"
                borderColor={fieldBorderColor}
              />
            </View>

            {firstHabitGoalType !== "once" ? (
              <View style={styles.formField}>
                <FieldLabel>
                  {firstHabitGoalType === "multiple" ? "Times per day" : firstHabitGoalType === "weekly" ? "Times per week" : "Times per month"}
                </FieldLabel>
                <LumoInput
                  value={firstHabitGoalAmount}
                  onChangeText={setFirstHabitGoalAmount}
                  keyboardType="number-pad"
                  style={[styles.flatInput, { borderColor: fieldBorderColor }]}
                />
              </View>
            ) : null}
          </View>
        </Animated.View>

        <View style={styles.bottomAction}>
          <OnboardingCta
            label={isSavingHabit ? "CREATING..." : "CREATE HABIT"}
            onPress={finishOnboarding}
            disabled={!firstHabitName.trim() || isSavingHabit}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <ProgressDots index={slideIndex} />
      </View>

      <View style={styles.mainContent}>
        <ScrollView
          ref={slideScrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={updateSlideIndex}
          onScrollEndDrag={updateSlideIndex}
        >
          {slides.map((slide) => (
            <View key={slide.title} style={[styles.slide, { width: slideWidth }]}>
              <View style={styles.heroArea}>
                <OnboardingIllustration name={slide.illustration} palette={palette} width={illustrationWidth} />
              </View>

              <View style={styles.copy}>
                <AppText variant="displaySmall" style={styles.title}>
                  {slide.title}
                </AppText>
                <AppText variant="body" color={palette.subtle} style={styles.body}>
                  {slide.body}
                </AppText>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.bottomAction}>
        <OnboardingCta label="NEXT" onPress={goNext} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingBottom: spacing.xl,
    paddingHorizontal: ONBOARDING_PX,
    paddingTop: spacing.xl
  },
  mainContent: {
    flex: 1,
    justifyContent: "center"
  },
  // Form steps (nickname, first habit) align toward the top so the fields sit
  // higher and stay clear of the keyboard.
  formMainContent: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: spacing.xs
  },
  header: {
    alignItems: "center",
    minHeight: 24,
    justifyContent: "center"
  },
  slide: {
    gap: spacing.lg,
    justifyContent: "center"
  },
  heroArea: {
    alignItems: "center",
    minHeight: 258,
    justifyContent: "center"
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center"
  },
  dot: {
    borderRadius: radius.pill,
    height: 5
  },
  copy: {
    alignItems: "center",
    gap: spacing.md
  },
  title: {
    fontFamily: fontFamilies.lexendBold,
    textAlign: "center"
  },
  body: {
    maxWidth: 310,
    textAlign: "center"
  },
  nicknameField: {
    alignSelf: "stretch",
    marginTop: spacing.lg
  },
  firstHabitForm: {
    alignSelf: "stretch",
    gap: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md
  },
  formField: {
    gap: spacing.xs
  },
  flatInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingTop: spacing.xxs,
    paddingBottom: spacing.sm,
    fontSize: 16,
    fontFamily: fontFamilies.lexendBold
  },
  bottomAction: {
    alignItems: "stretch",
    alignSelf: "stretch",
    paddingTop: spacing.lg,
    marginBottom: spacing.xl
  },
  onboardingButtonPressable: {
    alignSelf: "stretch"
  },
  onboardingButton: {
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8
  }
});
