import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { HabitForm } from "@/components/HabitForm";
import { LoadingState } from "@/components/ui";
import { useLumo } from "@/context/LumoContext";
import { HabitDraft } from "@/types/habit";

export default function NewHabitScreen() {
  const router = useRouter();
  const { createHabit, canCreateHabit } = useLumo();
  // Set once we intentionally save, so creating the habit that hits the limit
  // doesn't bounce the user straight to the paywall.
  const savedRef = useRef(false);

  // Belt-and-suspenders: if the free habit limit is already hit on arrival,
  // send the user to the paywall instead of the form (deep links / stale nav).
  useEffect(() => {
    if (!canCreateHabit && !savedRef.current) {
      router.replace("/paywall");
    }
  }, [canCreateHabit, router]);

  if (!canCreateHabit && !savedRef.current) {
    return <LoadingState />;
  }

  async function save(draft: HabitDraft) {
    savedRef.current = true;
    await createHabit(draft);
    router.replace("/(tabs)/today");
  }

  return <HabitForm title="Create habit" onSave={save} />;
}
