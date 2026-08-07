import { makeHabit } from "./factories";
import { completionRate, currentStreak, isScheduledOnDate, isSkippedOnDate } from "../habitMath";

// A skip means "this day was never expected", which is different from both a
// completion and a miss. These pin that distinction.
describe("skipped days", () => {
  it("bridges a streak without padding it", () => {
    const habit = makeHabit({
      createdAt: "2026-01-01",
      repeatSchedule: { type: "daily" },
      completions: [
        { date: "2026-01-05", count: 1, completedAt: "2026-01-05T09:00:00.000Z" },
        { date: "2026-01-03", count: 1, completedAt: "2026-01-03T09:00:00.000Z" }
      ],
      skips: ["2026-01-04"]
    });

    // Both completed days survive the gap — but the skipped day itself does
    // not count toward the streak, because the habit wasn't done that day.
    expect(currentStreak(habit, "2026-01-05")).toBe(2);
  });

  it("breaks the streak when the gap is a miss rather than a skip", () => {
    const habit = makeHabit({
      createdAt: "2026-01-01",
      repeatSchedule: { type: "daily" },
      completions: [
        { date: "2026-01-05", count: 1, completedAt: "2026-01-05T09:00:00.000Z" },
        { date: "2026-01-03", count: 1, completedAt: "2026-01-03T09:00:00.000Z" }
      ]
    });

    expect(currentStreak(habit, "2026-01-05")).toBe(1);
  });

  it("is excluded from the completion rate rather than counted as missed", () => {
    const base = {
      createdAt: "2026-01-01",
      repeatSchedule: { type: "daily" as const },
      completions: [
        { date: "2026-01-01", count: 1, completedAt: "2026-01-01T09:00:00.000Z" },
        { date: "2026-01-02", count: 1, completedAt: "2026-01-02T09:00:00.000Z" }
      ]
    };

    const missed = makeHabit(base);
    const skipped = makeHabit({ ...base, skips: ["2026-01-03"] });

    expect(completionRate(missed, "2026-01-03")).toBeLessThan(100);
    expect(completionRate(skipped, "2026-01-03")).toBe(100);
  });

  it("reports a skipped day as not scheduled", () => {
    const habit = makeHabit({
      createdAt: "2026-01-01",
      repeatSchedule: { type: "daily" },
      skips: ["2026-01-04"]
    });

    expect(isSkippedOnDate(habit, "2026-01-04")).toBe(true);
    expect(isScheduledOnDate(habit, "2026-01-04")).toBe(false);
    expect(isScheduledOnDate(habit, "2026-01-05")).toBe(true);
  });

  it("treats a habit with no skips exactly as before", () => {
    const habit = makeHabit({ createdAt: "2026-01-01", repeatSchedule: { type: "daily" } });

    expect(isSkippedOnDate(habit, "2026-01-02")).toBe(false);
    expect(isScheduledOnDate(habit, "2026-01-02")).toBe(true);
  });
});
