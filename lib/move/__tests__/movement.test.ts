import {
	activeDayCount,
	countableDays,
	displayedTotalDistance,
	emptyTotals,
	foldIntoTotals,
	formatDistance,
	formatMetricPair,
	formatMinutes,
	formatSteps,
	mergeSummaries,
	metricValue,
	movementStreak,
	normalizeSummary,
	normalizeTotals,
	sumMetric,
} from '../movement'
import type { MovementSummary } from '../types'

/**
 * Aggregation, and above all the defences against double-counting.
 *
 * Every function takes its dates as parameters — the module never reads a clock
 * — so none of this needs fake timers.
 */
function day(date: string, over: Partial<MovementSummary> = {}): MovementSummary {
	return { date, steps: 1000, distanceMeters: 800, activeMinutes: 12, ...over }
}

describe('movement summaries', () => {
	describe('normalizing', () => {
		it('drops anything without a real date key', () => {
			expect(normalizeSummary(null)).toBeNull()
			expect(normalizeSummary({ steps: 10 })).toBeNull()
			expect(normalizeSummary({ date: '2026-8-1', steps: 10 })).toBeNull()
			expect(normalizeSummary({ date: 'yesterday' })).toBeNull()
		})

		// A platform occasionally reports nonsense for ONE metric on a day that is
		// otherwise fine. Flooring keeps the real movement; dropping would lose it.
		it('floors nonsense values rather than dropping the day', () => {
			const summary = normalizeSummary({ date: '2026-08-01', steps: -50, distanceMeters: Number.NaN, activeMinutes: 30 })

			expect(summary).toEqual({ date: '2026-08-01', steps: 0, distanceMeters: 0, activeMinutes: 30 })
		})

		// Absent is not zero — see the note on MovementSummary. A missing split
		// must not read as "did not run".
		it('carries a walking/running split only when the platform gave one', () => {
			expect(normalizeSummary({ date: '2026-08-01', steps: 1 })?.walkingDistanceMeters).toBeUndefined()
			expect(normalizeSummary({ date: '2026-08-01', steps: 1, runningDistanceMeters: 500 })?.runningDistanceMeters).toBe(500)
		})
	})

	describe('merging', () => {
		// THE defence against double-counting: re-syncing a day replaces it.
		it('replaces a day rather than adding to it', () => {
			const merged = mergeSummaries([day('2026-08-01', { steps: 1000 })], [day('2026-08-01', { steps: 4000 })])

			expect(merged).toHaveLength(1)
			expect(merged[0].steps).toBe(4000)
		})

		it('is idempotent however many times the same sync lands', () => {
			const first = mergeSummaries([], [day('2026-08-01'), day('2026-08-02')])
			const again = mergeSummaries(mergeSummaries(first, first), first)

			expect(again).toEqual(first)
		})

		it('keeps everything sorted by date', () => {
			const merged = mergeSummaries([day('2026-08-03')], [day('2026-08-01'), day('2026-08-02')])

			expect(merged.map((entry) => entry.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
		})
	})

	describe('metric selection', () => {
		it('reads the metric asked for', () => {
			const summary = day('2026-08-01', { steps: 4321, distanceMeters: 2800, activeMinutes: 38 })

			expect(metricValue(summary, 'steps')).toBe(4321)
			expect(metricValue(summary, 'distance')).toBe(2800)
			expect(metricValue(summary, 'activeMinutes')).toBe(38)
		})

		it('uses the split for an activity-specific distance when there is one', () => {
			const summary = day('2026-08-01', { distanceMeters: 3000, walkingDistanceMeters: 2000, runningDistanceMeters: 1000 })

			expect(metricValue(summary, 'distance', 'walking')).toBe(2000)
			expect(metricValue(summary, 'distance', 'running')).toBe(1000)
			expect(metricValue(summary, 'distance', 'any')).toBe(3000)
		})

		// Deliberately generous. Telling someone who walked 5 km that they walked
		// nothing, because their phone did not itemise it, is the worse failure.
		it('falls back to the total when the platform did not split', () => {
			const summary = day('2026-08-01', { distanceMeters: 5000 })

			expect(metricValue(summary, 'distance', 'walking')).toBe(5000)
			expect(metricValue(summary, 'distance', 'running')).toBe(5000)
		})

		// Steps and minutes are never split by activity by any platform, so a
		// "running, steps" goal reads the same figure a walking one does.
		it('ignores activity for steps and minutes', () => {
			const summary = day('2026-08-01', { steps: 900, activeMinutes: 20 })

			expect(metricValue(summary, 'steps', 'running')).toBe(900)
			expect(metricValue(summary, 'activeMinutes', 'walking')).toBe(20)
		})
	})

	describe('summing a range', () => {
		const week = [day('2026-08-01'), day('2026-08-02'), day('2026-08-03', { steps: 0, distanceMeters: 0, activeMinutes: 0 })]

		it('adds up an inclusive range', () => {
			expect(sumMetric(week, 'steps', '2026-08-01', '2026-08-02')).toBe(2000)
		})

		it('ignores days outside it', () => {
			expect(sumMetric(week, 'steps', '2026-08-02', '2026-08-02')).toBe(1000)
			expect(sumMetric(week, 'steps', '2026-09-01', '2026-09-30')).toBe(0)
		})

		it('counts only days with movement as active', () => {
			expect(activeDayCount(week, '2026-08-01', '2026-08-03')).toBe(2)
		})
	})

	describe('the cumulative ledger', () => {
		// The whole point: repeated syncs must not inflate the total.
		it('counts a day once however often it is offered', () => {
			const days = [day('2026-08-01', { distanceMeters: 2000 }), day('2026-08-02', { distanceMeters: 3000 })]
			const once = foldIntoTotals(emptyTotals, days)
			const twice = foldIntoTotals(once, days)
			const thrice = foldIntoTotals(twice, [...days, ...days])

			expect(once.distanceMeters).toBe(5000)
			expect(twice).toBe(once)
			expect(thrice.distanceMeters).toBe(5000)
		})

		// A day revised downward by the platform must not claw back distance a
		// badge was already awarded for. The ledger only goes up.
		it('never moves backwards when a day is revised', () => {
			const once = foldIntoTotals(emptyTotals, [day('2026-08-01', { distanceMeters: 5000 })])
			const revised = foldIntoTotals(once, [day('2026-08-01', { distanceMeters: 100 })])

			expect(revised.distanceMeters).toBe(5000)
		})

		it('skips empty days so they can be counted if data arrives later', () => {
			const totals = foldIntoTotals(emptyTotals, [day('2026-08-01', { steps: 0, distanceMeters: 0, activeMinutes: 0 })])

			expect(totals.countedDays).toEqual([])

			const later = foldIntoTotals(totals, [day('2026-08-01', { distanceMeters: 900 })])

			expect(later.distanceMeters).toBe(900)
		})

		// Today is excluded on purpose: banking it at lunchtime would make the
		// afternoon uncountable, because a day is never counted twice.
		it('only offers days that are already over', () => {
			const days = [day('2026-08-01'), day('2026-08-02')]

			expect(countableDays(days, '2026-08-02').map((entry) => entry.date)).toEqual(['2026-08-01'])
		})

		it('still shows today in the displayed total', () => {
			const days = [day('2026-08-01', { distanceMeters: 2000 }), day('2026-08-02', { distanceMeters: 1500 })]
			const totals = foldIntoTotals(emptyTotals, countableDays(days, '2026-08-02'))

			expect(totals.distanceMeters).toBe(2000)
			expect(displayedTotalDistance(totals, days, '2026-08-02')).toBe(3500)
		})

		// Once yesterday's total is banked, the displayed figure must not add it
		// a second time when the day rolls over.
		it('does not double-count a day once it has been banked', () => {
			const days = [day('2026-08-01', { distanceMeters: 2000 })]
			const totals = foldIntoTotals(emptyTotals, days)

			expect(displayedTotalDistance(totals, days, '2026-08-01')).toBe(2000)
		})

		it('repairs a malformed ledger without losing the total', () => {
			const totals = normalizeTotals({ distanceMeters: 4200, steps: -3, activeMinutes: null, countedDays: ['a', 'a', 'b'] })

			expect(totals.distanceMeters).toBe(4200)
			expect(totals.steps).toBe(0)
			expect(totals.countedDays).toEqual(['a', 'b'])
		})
	})

	describe('formatting', () => {
		it('switches units at a kilometre', () => {
			expect(formatDistance(840)).toBe('840 m')
			expect(formatDistance(2800)).toBe('2.8 km')
			// §17 shows the cumulative total as "34.2 km" — the decimal is the point
			// at this size, and only becomes noise in the hundreds.
			expect(formatDistance(34_200)).toBe('34.2 km')
			expect(formatDistance(150_000)).toBe('150 km')
		})

		it('reads steps as a whole count', () => {
			expect(formatSteps(4321)).toBe('4,321')
		})

		it('switches minutes to hours past sixty', () => {
			expect(formatMinutes(38)).toBe('38 min')
			expect(formatMinutes(72)).toBe('1h 12m')
		})

		// One unit per line, never "800 m / 5 km".
		it('puts a pair in one unit', () => {
			expect(formatMetricPair('distance', 2800, 5000)).toBe('2.8 / 5 km')
			// A whole number must not read as "50.0".
			expect(formatMetricPair('distance', 50_000, 100_000)).toBe('50 / 100 km')
			expect(formatMetricPair('distance', 300, 800)).toBe('300 / 800 m')
			expect(formatMetricPair('steps', 4321, 8000)).toBe('4,321 / 8,000')
			expect(formatMetricPair('activeMinutes', 18, 30)).toBe('18 / 30 min')
		})
	})
})

describe('movement streak', () => {
	// `previousDay` is a parameter so this needs no calendar and no frozen clock
	// — the same trick the module uses everywhere else.
	const DAY = 86_400_000
	const key = (n: number) => `d${n}`
	const previous = (k: string) => `d${Number(k.slice(1)) - 1}`
	const on = (n: number) => ({ date: key(n), steps: 500, distanceMeters: 400, activeMinutes: 5 })

	it('counts consecutive days back from today', () => {
		expect(movementStreak([on(1), on(2), on(3)], key(3), previous)).toBe(3)
	})

	it('breaks on a day with nothing on it', () => {
		expect(movementStreak([on(1), on(3), on(4)], key(4), previous)).toBe(2)
	})

	// Grace: a streak built yesterday is not broken until a whole day is missed.
	it('survives a today that has not started yet', () => {
		expect(movementStreak([on(1), on(2)], key(3), previous)).toBe(2)
	})

	it('is broken once a whole day has gone by', () => {
		expect(movementStreak([on(1), on(2)], key(4), previous)).toBe(0)
	})

	it('ignores a day recorded with nothing on it', () => {
		const empty = { date: key(2), steps: 0, distanceMeters: 0, activeMinutes: 0 }

		expect(movementStreak([on(1), empty, on(3)], key(3), previous)).toBe(1)
	})

	it('is zero with nothing recorded', () => {
		expect(movementStreak([], key(1), previous)).toBe(0)
		expect(DAY).toBe(86_400_000)
	})
})
