import {
	calculateDistance,
	simplifyRouteForDisplay,
	WALK_HISTORY_LIMIT,
	emptyWalkState,
	formatMeasurement,
	habitContribution,
	measurementProgress,
	normalizeWalkState,
	recordWalk,
	totalsSince,
	type WalkPoint,
	type WalkRecord,
	habitsReachedByWalks,
} from '../walk'
import { completions, makeHabit } from './factories'
import { formatDistance, formatSteps } from '../move/movement'
import { averagePace as calculatePace, formatDuration, formatPace } from '../move/tracking/pace'

// Every test passes `now` explicitly — the module never reads the clock itself,
// which is what keeps this suite free of fake timers.
const T0 = 1_700_000_000_000
const MIN = 60_000

/** Somewhere flat and real, so the haversine numbers are checkable by hand. */
const ORIGIN = { lat: 14.5995, lon: 120.9842 }

function point(overrides: Partial<WalkPoint> = {}): WalkPoint {
	return { lat: ORIGIN.lat, lon: ORIGIN.lon, at: T0, accuracy: 5, ...overrides }
}

/**
 * A point approximately `metres` north of the origin.
 *
 * North only, so the offset is pure latitude and the expected distance does not
 * depend on longitude scaling. Note 111_320 is itself an approximation of
 * metres-per-degree-latitude (the true figure varies with latitude), so this
 * fixture is good to about 0.1% — assertions on it use a relative tolerance
 * rather than an absolute one.
 */
function north(metres: number, at: number): WalkPoint {
	return { lat: ORIGIN.lat + metres / 111_320, lon: ORIGIN.lon, at, accuracy: 5 }
}

describe('walk geometry', () => {
	describe('calculateDistance', () => {
		it('is zero for the same point', () => {
			expect(calculateDistance(ORIGIN, ORIGIN)).toBe(0)
		})

		it('measures a known north offset', () => {
			// Within 0.2% — the fixture's degree conversion is the imprecise part
			// here, not the haversine.
			expect(calculateDistance(ORIGIN, north(100, T0)) / 100).toBeCloseTo(1, 2)
			expect(calculateDistance(ORIGIN, north(1000, T0)) / 1000).toBeCloseTo(1, 2)
			expect(calculateDistance(ORIGIN, north(5000, T0)) / 5000).toBeCloseTo(1, 2)
		})

		it('is symmetric', () => {
			const a = ORIGIN
			const b = { lat: 14.61, lon: 120.99 }

			expect(calculateDistance(a, b)).toBeCloseTo(calculateDistance(b, a), 6)
		})

		// A flat-earth approximation drifts badly at high latitude; haversine
		// does not. Two points a degree of longitude apart are much closer
		// together near the pole than at the equator.
		it('accounts for longitude converging toward the poles', () => {
			const equator = calculateDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })
			const arctic = calculateDistance({ lat: 70, lon: 0 }, { lat: 70, lon: 1 })

			expect(equator).toBeGreaterThan(110_000)
			expect(arctic).toBeLessThan(equator / 2)
		})
	})

	describe('calculatePace', () => {
		it('returns milliseconds per kilometre', () => {
			// 1000m in 10 minutes is a 10:00/km pace.
			expect(calculatePace(1000, 10 * MIN)).toBe(10 * MIN)
			expect(calculatePace(2000, 10 * MIN)).toBe(5 * MIN)
		})

		// Pace over a few metres is dominated by GPS noise, and a wildly wrong
		// figure at the start of every walk is worse than a dash.
		it('refuses to guess under ten metres', () => {
			expect(calculatePace(9, 60_000)).toBeNull()
			expect(calculatePace(0, 60_000)).toBeNull()
			expect(calculatePace(500, 0)).toBeNull()
		})
	})

	describe('simplifyRouteForDisplay', () => {
		it('leaves short routes alone', () => {
			const two = [point(), north(50, T0 + 1000)]

			expect(simplifyRouteForDisplay(two)).toBe(two)
		})

		it('drops points that sit on the line', () => {
			const straight = [north(0, T0), north(50, T0 + 1000), north(100, T0 + 2000), north(150, T0 + 3000)]

			expect(simplifyRouteForDisplay(straight)).toHaveLength(2)
		})

		it('keeps a corner', () => {
			const corner: WalkPoint[] = [
				{ lat: ORIGIN.lat, lon: ORIGIN.lon, at: T0, accuracy: 5 },
				{ lat: ORIGIN.lat + 0.002, lon: ORIGIN.lon, at: T0 + 1000, accuracy: 5 },
				{ lat: ORIGIN.lat + 0.002, lon: ORIGIN.lon + 0.002, at: T0 + 2000, accuracy: 5 },
			]

			expect(simplifyRouteForDisplay(corner)).toHaveLength(3)
		})

		it('always keeps the first and last point', () => {
			const route = Array.from({ length: 20 }, (_, index) => north(index * 20, T0 + index * 1000))
			const simplified = simplifyRouteForDisplay(route)

			expect(simplified[0]).toBe(route[0])
			expect(simplified[simplified.length - 1]).toBe(route[route.length - 1])
		})
	})
})

describe('formatting', () => {
	it('shows minutes under an hour and hours above it', () => {
		expect(formatDuration(0)).toBe('0:00')
		expect(formatDuration(65_000)).toBe('1:05')
		expect(formatDuration(30 * MIN + 18_000)).toBe('30:18')
		expect(formatDuration(64 * MIN + 18_000)).toBe('1:04:18')
	})

	it('switches from metres to kilometres at 1 km', () => {
		expect(formatDistance(0)).toBe('0 m')
		expect(formatDistance(840)).toBe('840 m')
		expect(formatDistance(1000)).toBe('1 km')
		expect(formatDistance(2340)).toBe('2.3 km')
	})

	it('formats pace, and 0:00 before there is one (the walk screen shows a dash)', () => {
		expect(formatPace(13 * MIN + 45_000)).toBe('13:45 /km')
		expect(formatPace(null)).toBe('0:00')
		expect(formatPace(Number.POSITIVE_INFINITY)).toBe('0:00')
	})

	// The distinction the whole `steps: number | null` design exists to keep.
	it('shows a dash for an absent step counter, not a zero', () => {
		expect(formatSteps(null)).toBe('—')
		expect(formatSteps(0)).toBe('0')
		expect(formatSteps(3182)).toBe('3,182')
	})

	it('never renders negative values', () => {
		expect(formatDuration(-5000)).toBe('0:00')
		expect(formatDistance(-100)).toBe('0 m')
	})
})

describe('the walk store', () => {
	/** A saved walk of `minutes` moving time — what the tracker's bridge files. */
	function finishedAfter(minutes: number, id = 'walk-1'): WalkRecord {
		return {
			id,
			startedAt: T0,
			endedAt: T0 + minutes * MIN,
			activeMs: minutes * MIN,
			distanceM: 0,
			vehicleM: 0,
			steps: null,
			route: [],
			habitIds: [],
			synced: false,
		}
	}

	it('files a walk newest first and marks it unsynced', () => {
		let state = recordWalk(emptyWalkState, finishedAfter(10, 'a'))
		state = recordWalk(state, finishedAfter(20, 'b'))

		expect(state.history.map((record) => record.id)).toEqual(['b', 'a'])
		expect(state.history[0].synced).toBe(false)
	})

	it('replaces rather than duplicates a walk with the same id', () => {
		let state = recordWalk(emptyWalkState, finishedAfter(10, 'a'))
		state = recordWalk(state, finishedAfter(25, 'a'))

		expect(state.history).toHaveLength(1)
		expect(state.history[0].activeMs).toBe(25 * MIN)
	})

	describe('reading back from storage', () => {
		it('round-trips a state with history', () => {
			const state = recordWalk(emptyWalkState, finishedAfter(20))

			expect(normalizeWalkState(JSON.parse(JSON.stringify(state)))).toEqual(state)
		})

		it('falls back to empty on junk', () => {
			expect(normalizeWalkState(null)).toEqual(emptyWalkState)
			expect(normalizeWalkState('walk')).toEqual(emptyWalkState)
			expect(normalizeWalkState({})).toEqual(emptyWalkState)
		})

		it('ignores the legacy in-progress session field but keeps the history', () => {
			const state = recordWalk(emptyWalkState, finishedAfter(15))
			const restored = normalizeWalkState({ ...JSON.parse(JSON.stringify(state)), active: { id: 'old', status: 'active' } })

			expect(restored).toEqual(state)
		})

		it('repairs bad records rather than dropping the list', () => {
			const restored = normalizeWalkState({
				history: [
					{ id: 'a', startedAt: T0, activeMs: 10 * MIN, distanceM: -5, steps: 'lots', route: [{ lat: 'x' }] },
					{ id: 'b' },
					null,
				],
			})

			expect(restored.history).toHaveLength(1)
			expect(restored.history[0].distanceM).toBe(0)
			expect(restored.history[0].steps).toBeNull()
			expect(restored.history[0].route).toEqual([])
		})
	})

	it('caps history so the stored blob cannot grow without limit', () => {
		let state = emptyWalkState

		for (let index = 0; index < WALK_HISTORY_LIMIT + 10; index += 1) {
			state = recordWalk(state, finishedAfter(5, `walk-${index}`))
		}

		expect(state.history).toHaveLength(WALK_HISTORY_LIMIT)
	})

	describe('totals', () => {
		it('sums a window and ignores what falls outside it', () => {
			const recent = { ...finishedAfter(30, 'recent'), startedAt: T0, distanceM: 2000 }
			const old = { ...finishedAfter(30, 'old'), startedAt: T0 - 30 * 24 * 60 * MIN, distanceM: 9000 }

			const totals = totalsSince([recent, old], T0 - 7 * 24 * 60 * MIN)

			expect(totals).toEqual({ walks: 1, activeMs: 30 * MIN, distanceM: 2000 })
		})

		it('is zero over an empty history', () => {
			expect(totalsSince([], T0)).toEqual({ walks: 0, activeMs: 0, distanceM: 0 })
		})
	})

	describe('habits reached by walks', () => {
		const day = '2026-08-11'
		const dayStart = T0
		const dayEnd = T0 + 24 * 60 * MIN
		const walk = (minutes: number, distanceM: number): WalkRecord => ({
			...finishedAfter(minutes, `w${minutes}`),
			startedAt: dayStart + 60 * MIN,
			distanceM,
			habitIds: ['walk-2k'],
		})
		const measured = makeHabit({ id: 'walk-2k', measurement: { kind: 'distance', target: 2000 } })

		it('names a habit once its target is met, and not before', () => {
			expect(habitsReachedByWalks([walk(10, 1200)], [measured], day, dayStart, dayEnd)).toEqual([])
			expect(habitsReachedByWalks([walk(10, 1200), walk(12, 900)], [measured], day, dayStart, dayEnd)).toEqual(['walk-2k'])
		})

		// Once only: a habit already done that day is never completed again.
		it('skips a habit already done that day, and habits with no target', () => {
			const done = makeHabit({ ...measured, completions: completions([day]) })
			const plain = makeHabit({ id: 'plain' })

			expect(habitsReachedByWalks([walk(30, 2500)], [done, plain], day, dayStart, dayEnd)).toEqual([])
		})
	})

	describe('habit contribution', () => {
		const dayStart = T0
		const dayEnd = T0 + 24 * 60 * MIN

		function linked(id: string, minutes: number, distanceM: number, startedAt: number): WalkRecord {
			return { ...finishedAfter(minutes, id), startedAt, distanceM, habitIds: ['habit-1'] }
		}

		// The whole point of accumulating: two twenty-minute walks satisfy a
		// thirty-minute habit between them, though neither did on its own.
		it('accumulates several walks in one day', () => {
			const history = [linked('a', 12, 900, dayStart + 60 * MIN), linked('b', 20, 1600, dayStart + 600 * MIN)]

			expect(habitContribution(history, 'habit-1', 'duration', dayStart, dayEnd)).toBe(32 * MIN)
			expect(habitContribution(history, 'habit-1', 'distance', dayStart, dayEnd)).toBe(2500)
		})

		it('counts only walks linked to that habit', () => {
			const history = [linked('a', 20, 1000, dayStart + 60 * MIN), { ...finishedAfter(30, 'b'), startedAt: dayStart + 120 * MIN }]

			expect(habitContribution(history, 'habit-1', 'duration', dayStart, dayEnd)).toBe(20 * MIN)
		})

		// A walk begun at 23:50 belongs to the day it set out on — the day the
		// user would look for it under.
		it('files a walk by the day it started, not the day it ended', () => {
			const beforeMidnight = linked('a', 30, 2000, dayEnd - 10 * MIN)
			const history = [beforeMidnight]

			expect(habitContribution(history, 'habit-1', 'duration', dayStart, dayEnd)).toBe(30 * MIN)
			expect(habitContribution(history, 'habit-1', 'duration', dayEnd, dayEnd + 24 * 60 * MIN)).toBe(0)
		})

		it('treats an absent step counter as no contribution', () => {
			const history = [{ ...linked('a', 20, 1000, dayStart + MIN), steps: null }]

			expect(habitContribution(history, 'habit-1', 'steps', dayStart, dayEnd)).toBe(0)
		})
	})

	// What decides whether a measured habit ticks itself off. The rule that
	// matters: the target is judged against the DAY's walks, not against the one
	// that just finished.
	describe('measurement progress', () => {
		const dayStart = T0
		const dayEnd = T0 + 24 * 60 * MIN

		function linked(id: string, minutes: number, distanceM: number, startedAt: number): WalkRecord {
			return { ...finishedAfter(minutes, id), startedAt, distanceM, habitIds: ['habit-1'] }
		}

		it('is short of a target no single walk met', () => {
			const history = [linked('a', 12, 900, dayStart + 60 * MIN)]
			const progress = measurementProgress(history, 'habit-1', { kind: 'duration', target: 30 * MIN }, dayStart, dayEnd)

			expect(progress.total).toBe(12 * MIN)
			expect(progress.reached).toBe(false)
			expect(progress.ratio).toBeCloseTo(0.4, 5)
		})

		it('is reached by two walks that only add up together', () => {
			const history = [linked('a', 12, 900, dayStart + 60 * MIN), linked('b', 20, 1600, dayStart + 600 * MIN)]
			const progress = measurementProgress(history, 'habit-1', { kind: 'duration', target: 30 * MIN }, dayStart, dayEnd)

			expect(progress.total).toBe(32 * MIN)
			expect(progress.reached).toBe(true)
		})

		it('caps the ratio at 1 once the target is passed', () => {
			const history = [linked('a', 90, 7000, dayStart + MIN)]
			const progress = measurementProgress(history, 'habit-1', { kind: 'duration', target: 30 * MIN }, dayStart, dayEnd)

			expect(progress.ratio).toBe(1)
		})

		// A zero target would otherwise report every habit permanently met, and
		// tick it off on the strength of a walk that covered nothing.
		it('never reports a non-positive target as reached', () => {
			const history = [linked('a', 30, 2000, dayStart + MIN)]

			expect(measurementProgress(history, 'habit-1', { kind: 'distance', target: 0 }, dayStart, dayEnd).reached).toBe(false)
			expect(measurementProgress(history, 'habit-1', { kind: 'distance', target: -5 }, dayStart, dayEnd).reached).toBe(false)
		})

		it('is not reached by a walk on another day', () => {
			const history = [linked('a', 45, 3000, dayEnd + MIN)]

			expect(measurementProgress(history, 'habit-1', { kind: 'duration', target: 30 * MIN }, dayStart, dayEnd).reached).toBe(false)
		})

		it('formats each unit the way it is read', () => {
			// Minutes floor rather than round: 29.9 minutes of a 30-minute target
			// must not read as "30 / 30 min" while the habit is still unticked.
			expect(formatMeasurement('duration', 29.9 * MIN, 30 * MIN)).toBe('29 / 30 min')
			expect(formatMeasurement('distance', 1240, 3000)).toBe('1.2 / 3 km')
			expect(formatMeasurement('distance', 240, 800)).toBe('240 / 800 m')
			expect(formatMeasurement('steps', 4100, 5000)).toBe('4,100 / 5,000')
		})
	})

})
