import type { CompletionEntry, GoalType, Habit, RepeatSchedule } from '@/types/habit'

/**
 * Test fixtures. Dates are always passed explicitly (never `new Date()`), so
 * these suites are deterministic regardless of when they run.
 */
export function makeHabit(overrides: Partial<Habit> = {}): Habit {
	return {
		id: 'habit-1',
		name: 'Test habit',
		category: 'General',
		emoji: 'star',
		color: '#7FA466',
		reminderEnabled: false,
		reminderMode: 'time',
		reminderTime: '08:00',
		reminderIntervalValue: 1,
		reminderIntervalUnit: 'hours',
		repeatSchedule: { type: 'daily' } as RepeatSchedule,
		goal: { type: 'once' } as GoalType,
		createdAt: '2026-01-01',
		completions: [],
		status: 'active',
		...overrides,
	}
}

/** Build completion entries from date keys, each with `count` (default 1). */
export function completions(dates: string[], count = 1): CompletionEntry[] {
	// completedAt is pinned to midday on the same day — deterministic, and the
	// math functions only ever read `date`/`count`.
	return dates.map((date) => ({ date, count, completedAt: `${date}T12:00:00.000Z` }))
}
