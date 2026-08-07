import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { HabitForm } from "@/components/HabitForm";
import { LoadingState, Screen, AppText, Button } from "@/components/ui";
import { useLumo } from "@/context/LumoContext";
import { HabitDraft } from "@/types/habit";

export default function EditHabitScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { habits, isReady, updateHabit } = useLumo();
  const habit = habits.find((item) => item.id === id);

  if (!isReady) {
    return <LoadingState />;
  }

  if (!habit) {
    return (
      <Screen>
        <AppText variant="title">Habit not found</AppText>
        <Button label="Back to today" icon="back" onPress={() => router.replace("/(tabs)/today")} />
      </Screen>
    );
  }

  const currentHabit = habit;

  async function save(draft: HabitDraft) {
    await updateHabit(currentHabit.id, draft);
    router.back();
  }

  return <HabitForm
      title="Edit habit"
      subtitle="Adjust anything you like — your streak and history stay exactly as they are."
      habit={currentHabit}
      backLabel={currentHabit.name}
      onSave={save}
    />;
}
