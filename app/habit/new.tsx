import { useRouter } from "expo-router";
import React from "react";
import { HabitForm } from "@/components/HabitForm";
import { useLumo } from "@/context/LumoContext";
import { HabitDraft } from "@/types/habit";

export default function NewHabitScreen() {
  const router = useRouter();
  const { createHabit } = useLumo();

  async function save(draft: HabitDraft) {
    await createHabit(draft);
    router.replace("/(tabs)/today");
  }

  return <HabitForm title="Create habit" onSave={save} />;
}
