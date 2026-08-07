import {
	bestStreak,
	bestCurrentStreakAcrossHabits,
	completionCount,
	completionRate,
	currentStreak,
	dailyTarget,
	isDoneOnDate,
	isPerfectWeek,
	isScheduledOnDate,
	perfectWeeksForHabits,
	scheduledWeekdays,
	totalCompletions,
	weeklyCompletionCount,
} from '../habitMath'
import { completions, makeHabit } from './factories'

// 2026-01-01 is a Thursday. Anchor dates are chosen so weekday logic is explicit.
const THU = '2026-01-01'

describe('dailyTarget', () => {
	it('is 1 for a once-a-day goal', () => {
		expect(dailyTarget(makeHabit({ goal: { type: 'once' } }))).toBe(1)
	})

	it('is the count for a multiple goal', () => {
		expect(dailyTarget(makeHabit({ goal: { type: 'multiple', count: 8 } }))).toBe(8)
	})

	it('is 1 for weekly/monthly goals (they are not per-day targets)', () => {
		expect(dailyTarget(makeHabit({ goal: { type: 'weekly', target: 3 } }))).toBe(1)
		expect(dailyTarget(makeHabit({ goal: { type: 'monthly', target: 10 } }))).toBe(1)
	})
})

describe('completionCount / isDoneOnDate', () => {
	it('returns 0 for a date with no entry', () => {
		expect(completionCount(makeHabit(), THU)).toBe(0)
	})

	it('requires the full daily target for a multiple goal', () => {
		const habit = makeHabit({
			goal: { type: 'multiple', count: 3 },
			completions: completions([THU], 2),
		})
		expect(isDoneOnDate(habit, THU)).toBe(false)

		const done = makeHabit({
			goal: { type: 'multiple', count: 3 },
			completions: completions([THU], 3),
		})
		expect(isDoneOnDate(done, THU)).toBe(true)
	})

	it('treats any completion as done for weekly and monthly goals', () => {
		const weekly = makeHabit({ goal: { type: 'weekly', target: 5 }, completions: completions([THU], 1) })
		expect(isDoneOnDate(weekly, THU)).toBe(true)
	})
})

describe('scheduledWeekdays', () => {
	it('maps weekdays to Mon–Fri and weekends to Sat/Sun', () => {
		expect(scheduledWeekdays(makeHabit({ repeatSchedule: { type: 'weekdays' } }))).toEqual([1, 2, 3, 4, 5])
		expect(scheduledWeekdays(makeHabit({ repeatSchedule: { type: 'weekends' } }))).toEqual([0, 6])
	})

	it('passes through specific days and defaults to all seven', () => {
		expect(scheduledWeekdays(makeHabit({ repeatSchedule: { type: 'specific', days: [1, 3] } }))).toEqual([1, 3])
		expect(scheduledWeekdays(makeHabit({ repeatSchedule: { type: 'interval', every: 3 } }))).toEqual([0, 1, 2, 3, 4, 5, 6])
	})
})

describe('isScheduledOnDate', () => {
	it('is false before the habit was created', () => {
		expect(isScheduledOnDate(makeHabit({ createdAt: '2026-01-10' }), '2026-01-09')).toBe(false)
	})

	it('is false for a non-active habit', () => {
		expect(isScheduledOnDate(makeHabit({ status: 'paused' }), THU)).toBe(false)
		expect(isScheduledOnDate(makeHabit({ status: 'archived' }), THU)).toBe(false)
	})

	it('honours weekdays vs weekends', () => {
		const weekdayHabit = makeHabit({ repeatSchedule: { type: 'weekdays' } })
		expect(isScheduledOnDate(weekdayHabit, '2026-01-01')).toBe(true) // Thursday
		expect(isScheduledOnDate(weekdayHabit, '2026-01-03')).toBe(false) // Saturday

		const weekendHabit = makeHabit({ repeatSchedule: { type: 'weekends' } })
		expect(isScheduledOnDate(weekendHabit, '2026-01-03')).toBe(true) // Saturday
		expect(isScheduledOnDate(weekendHabit, '2026-01-01')).toBe(false) // Thursday
	})

	it('honours specific weekdays', () => {
		// Only Mondays (1)
		const habit = makeHabit({ repeatSchedule: { type: 'specific', days: [1] } })
		expect(isScheduledOnDate(habit, '2026-01-05')).toBe(true) // Monday
		expect(isScheduledOnDate(habit, '2026-01-06')).toBe(false) // Tuesday
	})

	it('counts interval schedules from createdAt', () => {
		const habit = makeHabit({ createdAt: THU, repeatSchedule: { type: 'interval', every: 3 } })
		expect(isScheduledOnDate(habit, '2026-01-01')).toBe(true) // day 0
		expect(isScheduledOnDate(habit, '2026-01-02')).toBe(false) // day 1
		expect(isScheduledOnDate(habit, '2026-01-04')).toBe(true) // day 3
	})
})

describe('currentStreak', () => {
	it('counts consecutive completed days ending today', () => {
		const habit = makeHabit({
			createdAt: '2026-01-01',
			completions: completions(['2026-01-08', '2026-01-09', '2026-01-10']),
		})
		expect(currentStreak(habit, '2026-01-10')).toBe(3)
	})

	it('does not break the streak when today is merely not done yet', () => {
		// Yesterday and the day before are done; today is still open.
		const habit = makeHabit({
			createdAt: '2026-01-01',
			completions: completions(['2026-01-08', '2026-01-09']),
		})
		expect(currentStreak(habit, '2026-01-10')).toBe(2)
	})

	it('breaks on a missed scheduled day', () => {
		const habit = makeHabit({
			createdAt: '2026-01-01',
			// 01-08 missed
			completions: completions(['2026-01-07', '2026-01-09', '2026-01-10']),
		})
		expect(currentStreak(habit, '2026-01-10')).toBe(2)
	})

	it('skips unscheduled days without breaking the streak', () => {
		// Weekday-only habit: the weekend gap must not reset the run.
		const habit = makeHabit({
			createdAt: '2026-01-01',
			repeatSchedule: { type: 'weekdays' },
			// Fri 01-02, then Mon 01-05, Tue 01-06 (Sat/Sun unscheduled)
			completions: completions(['2026-01-02', '2026-01-05', '2026-01-06']),
		})
		expect(currentStreak(habit, '2026-01-06')).toBe(3)
	})

	it('is 0 for a habit with no completions', () => {
		expect(currentStreak(makeHabit(), '2026-01-10')).toBe(0)
	})
})

describe('bestStreak', () => {
	it('finds the longest historical run, not the current one', () => {
		const habit = makeHabit({
			createdAt: '2026-01-01',
			completions: completions([
				// 4-day run
				'2026-01-01',
				'2026-01-02',
				'2026-01-03',
				'2026-01-04',
				// gap on 01-05
				// 2-day run ending today
				'2026-01-06',
				'2026-01-07',
			]),
		})
		expect(bestStreak(habit, '2026-01-07')).toBe(4)
		expect(currentStreak(habit, '2026-01-07')).toBe(2)
	})
})

describe('bestCurrentStreakAcrossHabits', () => {
	it('returns the longest current streak and ignores paused status', () => {
		const short = makeHabit({ id: 'a', completions: completions(['2026-01-10']) })
		const long = makeHabit({
			id: 'b',
			status: 'paused',
			completions: completions(['2026-01-08', '2026-01-09', '2026-01-10']),
		})
		expect(bestCurrentStreakAcrossHabits([short, long], '2026-01-10')).toBe(3)
	})

	it('is 0 for an empty habit list', () => {
		expect(bestCurrentStreakAcrossHabits([], '2026-01-10')).toBe(0)
	})
})

describe('completionRate', () => {
	it('is a whole percentage of scheduled days completed', () => {
		// Created 01-01, evaluated on 01-04 => 4 scheduled days, 2 done => 50%
		const habit = makeHabit({
			createdAt: '2026-01-01',
			completions: completions(['2026-01-01', '2026-01-02']),
		})
		expect(completionRate(habit, '2026-01-04')).toBe(50)
	})

	it('is 100 when every scheduled day is done', () => {
		const habit = makeHabit({
			createdAt: '2026-01-01',
			completions: completions(['2026-01-01', '2026-01-02', '2026-01-03']),
		})
		expect(completionRate(habit, '2026-01-03')).toBe(100)
	})

	it('is 0 when nothing is scheduled', () => {
		// Archived habits are never scheduled.
		expect(completionRate(makeHabit({ status: 'archived' }), '2026-01-03')).toBe(0)
	})
})

describe('totalCompletions', () => {
	it('sums counts across all entries', () => {
		const habit = makeHabit({ completions: completions(['2026-01-01', '2026-01-02'], 4) })
		expect(totalCompletions(habit)).toBe(8)
	})
})

describe('weeklyCompletionCount', () => {
	it('sums the Sunday-anchored week containing the date', () => {
		// 2026-01-04 is a Sunday; that week runs 01-04 .. 01-10.
		const habit = makeHabit({
			completions: [
				{ date: '2026-01-03', count: 5, completedAt: '2026-01-03T12:00:00.000Z' }, // Saturday — previous week
				{ date: '2026-01-04', count: 2, completedAt: '2026-01-04T12:00:00.000Z' },
				{ date: '2026-01-06', count: 3, completedAt: '2026-01-06T12:00:00.000Z' },
			],
		})
		expect(weeklyCompletionCount(habit, '2026-01-06')).toBe(5)
	})
})

describe('isPerfectWeek', () => {
	it('is true only when every scheduled day that week is done', () => {
		// Weekday habit; week of Sun 2026-01-04 has Mon–Fri = 01-05..01-09.
		const perfect = makeHabit({
			createdAt: '2026-01-01',
			repeatSchedule: { type: 'weekdays' },
			completions: completions(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']),
		})
		expect(isPerfectWeek(perfect, '2026-01-06')).toBe(true)

		const missedOne = makeHabit({
			createdAt: '2026-01-01',
			repeatSchedule: { type: 'weekdays' },
			completions: completions(['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']),
		})
		expect(isPerfectWeek(missedOne, '2026-01-06')).toBe(false)
	})

	it('is false when the week has no scheduled days', () => {
		expect(isPerfectWeek(makeHabit({ status: 'archived' }), '2026-01-06')).toBe(false)
	})
})

describe('perfectWeeksForHabits', () => {
	it('counts only weeks where every active habit hit every scheduled day', () => {
		// One daily habit, fully completed across the week of Sun 01-04..Sat 01-10.
		const habit = makeHabit({
			createdAt: '2026-01-04',
			completions: completions([
				'2026-01-04',
				'2026-01-05',
				'2026-01-06',
				'2026-01-07',
				'2026-01-08',
				'2026-01-09',
				'2026-01-10',
			]),
		})
		expect(perfectWeeksForHabits([habit], 1, '2026-01-10')).toBe(1)
	})

	it('ignores archived habits when deciding a perfect week', () => {
		const archived = makeHabit({ id: 'x', status: 'archived', createdAt: '2026-01-04' })
		expect(perfectWeeksForHabits([archived], 1, '2026-01-10')).toBe(0)
	})
})
