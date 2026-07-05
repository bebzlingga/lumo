import { useEffect, useState } from "react";
import HabitJourneyScreen from "@/components/HabitJourneyScreen";

export default function App() {
  const [dark, setDark] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return <HabitJourneyScreen dark={dark} onToggleDark={() => setDark((value) => !value)} />;
}
