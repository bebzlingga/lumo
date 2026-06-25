import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { OnboardingIllustration } from "@/components/OnboardingIllustrations";
import { AppText, LoadingState, LumoInput, Screen, Select } from "@/components/ui";
import { fontFamilies, habitColors, radius, spacing } from "@/constants/theme";
import { useLumo } from "@/context/LumoContext";
import { toDateKey } from "@/lib/date";
import { habitCategories, type HabitCategory, type HabitDraft, type RepeatSchedule } from "@/types/habit";

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
const categoryOptions = habitCategories.map((category) => ({ label: category, value: category }));
const frequencyOptions: { label: string; value: BasicFrequency }[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Weekends", value: "weekends" }
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
  const { palette } = useLumo();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.onboardingButtonPressable, { opacity: disabled ? 0.45 : pressed ? 0.82 : 1 }]}
    >
      <View style={[styles.onboardingButton, { backgroundColor: palette.surface, borderColor: palette.hairline }]}>
        <AppText variant="button" color={palette.ink}>
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
  const [step, setStep] = useState<OnboardingStep>("slides");
  const [slideIndex, setSlideIndex] = useState(0);
  const [nicknameDraft, setNicknameDraft] = useState(nickname);
  const [firstHabitName, setFirstHabitName] = useState("");
  const [firstHabitCategory, setFirstHabitCategory] = useState<HabitCategory>("General");
  const [firstHabitFrequency, setFirstHabitFrequency] = useState<BasicFrequency>("daily");
  const [isSavingHabit, setIsSavingHabit] = useState(false);

  const illustrationWidth = useMemo(() => Math.min(width - ONBOARDING_PX * 2, 330), [width]);
  const slideWidth = width - ONBOARDING_PX * 2;

  useEffect(() => {
    if (isReady && hasOnboarded) {
      router.replace("/(tabs)/today");
    }
  }, [hasOnboarded, isReady, router]);

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
      emoji: "star",
      color: habitColors[0],
      createdAt: toDateKey(),
      reminderEnabled: false,
      reminderMode: "time",
      reminderTime: "09:00",
      reminderIntervalValue: 1,
      reminderIntervalUnit: "hours",
      repeatSchedule: { type: firstHabitFrequency },
      goal: { type: "once" }
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
        <View style={styles.mainContent}>
          <View style={styles.heroArea}>
            <OnboardingIllustration name="nickname" palette={palette} width={illustrationWidth} height={238} />
          </View>

          <View style={styles.copy}>
            <AppText variant="displaySmall" style={styles.title}>
              What should Lumo call you?
            </AppText>
            <AppText variant="body" color={palette.body} style={styles.body}>
              Add a nickname so your daily nudges and wins feel a little more yours.
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
              style={styles.input}
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
        <View style={styles.mainContent}>
          <View style={styles.copy}>
            <AppText variant="displaySmall" style={styles.title}>
              Let's add your first habit.
            </AppText>
            <AppText variant="body" color={palette.body} style={styles.body}>
              Start with one small promise to yourself. Keep it simple today, and you can update the details later.
            </AppText>
          </View>

          <View style={[styles.firstHabitForm, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
            <View style={styles.formField}>
              <AppText variant="caption" color={palette.subtle}>
                Habit name
              </AppText>
              <LumoInput
                value={firstHabitName}
                onChangeText={setFirstHabitName}
                placeholder="Drink water"
                autoCapitalize="sentences"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={finishOnboarding}
                style={styles.formInput}
              />
            </View>

            <View style={styles.formField}>
              <AppText variant="caption" color={palette.subtle}>
                Category
              </AppText>
              <Select
                options={categoryOptions}
                value={firstHabitCategory}
                onChange={(category) => setFirstHabitCategory(category as HabitCategory)}
                accessibilityLabel="First habit category"
              />
            </View>

            <View style={styles.formField}>
              <AppText variant="caption" color={palette.subtle}>
                Frequency
              </AppText>
              <Select
                options={frequencyOptions}
                value={firstHabitFrequency}
                onChange={(frequency) => setFirstHabitFrequency(frequency as BasicFrequency)}
                accessibilityLabel="First habit frequency"
              />
            </View>
          </View>
        </View>

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
                <AppText variant="body" color={palette.body} style={styles.body}>
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
  input: {
    borderRadius: radius.nav,
    fontSize: 16,
    height: 54,
    paddingHorizontal: spacing.lg,
    textAlign: "center"
  },
  firstHabitForm: {
    alignSelf: "stretch",
    borderRadius: radius.nav,
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
    elevation: 4
  },
  formField: {
    gap: spacing.xs
  },
  formInput: {
    borderRadius: radius.xl,
    fontSize: 16,
    height: 54,
    paddingHorizontal: spacing.lg
  },
  bottomAction: {
    alignItems: "stretch",
    alignSelf: "stretch",
    paddingTop: spacing.lg
  },
  onboardingButtonPressable: {
    alignSelf: "stretch"
  },
  onboardingButton: {
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: radius.nav,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: spacing.xl
  }
});
