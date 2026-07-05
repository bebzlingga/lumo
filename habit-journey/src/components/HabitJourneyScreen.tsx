import { HabitIcon } from "@/components/icons";
import Roadmap from "@/components/Roadmap";

interface Props {
  dark: boolean;
  onToggleDark: () => void;
}

export default function HabitJourneyScreen({ dark, onToggleDark }: Props) {
  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-sky-50 via-white to-white text-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-slate-100">
      <div className="mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-4 py-6 sm:px-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Habit Journey</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Small habits. Big progress.</p>
          </div>
          <button
            type="button"
            onClick={onToggleDark}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="shrink-0 rounded-full border border-black/5 bg-white/80 p-2.5 text-slate-600 shadow-soft backdrop-blur transition hover:scale-105 hover:text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-300"
          >
            <HabitIcon name={dark ? "sun" : "moon"} className="h-5 w-5" />
          </button>
        </header>

        <main className="mt-6 flex-1">
          <Roadmap />
        </main>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
          Drag, swipe, scroll, or use <kbd className="rounded bg-black/5 px-1 dark:bg-white/10">←</kbd>{" "}
          <kbd className="rounded bg-black/5 px-1 dark:bg-white/10">→</kbd> to explore your journey.
        </p>
      </div>
    </div>
  );
}
