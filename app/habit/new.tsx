import { useRouter } from "expo-router";
import React from "react";
import { HabitForm } from "@/components/HabitForm";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { useLumo } from "@/context/LumoContext";
import { HabitDraft } from "@/types/habit";

export default function NewHabitScreen() {
  const router = useRouter();
  const { createHabit, canCreateHabit } = useLumo();

  async function save(draft: HabitDraft) {
    await createHabit(draft);
    router.replace("/(tabs)/today");
  }

  // The cap is enforced HERE rather than on each button that leads here, so
  // every route into creating a habit — the header +, the empty state, a
  // starter pack — meets the same wall.
  if (!canCreateHabit) {
    return <SubscriptionGate product="unlimited" />;
  }

  return <HabitForm title="Create habit" backLabel="Habits" onSave={save} />;
}
