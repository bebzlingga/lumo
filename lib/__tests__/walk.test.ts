import {
	averageSpeed,
	formatSpeed,
	maxLegSpeed,
	MAX_ACCURACY_M,
	MIN_LEG_M,
	activeMs,
	appendLocationPoint,
	calculateDistance,
	calculatePace,
	cancelWalk,
	finishWalk,
	formatDistance,
	formatDuration,
	formatPace,
	formatSteps,
	isPaused,
	pauseWalk,
	resumeWalk,
	simplifyRouteForDisplay,
	startWalk,
	validateLocationPoint,
	classifyLeg,
	lifetimeDistanceM,
	milestoneStandings,
	nextMilestone,
	milestonesCrossedBy,
	outingStreak,
	personalBestM,
	encouragement,
	looksLikeVehicle,
	VEHICLE_LEG_STREAK,
	MIN_RECORDED_WALK_MS,
	WALK_HISTORY_LIMIT,
	emptyWalkState,
	formatMeasurement,
	habitContribution,
	measurementProgress,
	normalizeWalkState,
	recordWalk,
	toWalkRecord,
	totalsSince,
	type WalkPoint,
	type WalkRecord,
	type WalkSession,
} from '../walk'
import { MILESTONES, findMilestone } from '../../constants/milestones'

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

function walking(): WalkSession {
	return startWalk('walk-1', T0)
}

/**
 * A point `metres` north of the previous one, `seconds` later — the fixture the
 * movement tests are built on, because speed is the only thing they care about.
 */
function leg(from: WalkPoint, metres: number, seconds: number): WalkPoint {
	return { lat: from.lat + metres / 111_320, lon: from.lon, at: from.at + seconds * 1000, accuracy: 5 }
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

describe('point validation', () => {
	it('accepts a good first fix', () => {
		expect(validateLocationPoint(point(), null)).toBeNull()
	})

	it('rejects a fix that is too vague to place', () => {
		expect(validateLocationPoint(point({ accuracy: MAX_ACCURACY_M + 1 }), null)).toBe('accuracy')
		expect(validateLocationPoint(point({ accuracy: Number.NaN }), null)).toBe('accuracy')
	})

	it('rejects nonsense coordinates', () => {
		expect(validateLocationPoint(point({ lat: 91 }), null)).toBe('impossible')
		expect(validateLocationPoint(point({ lon: -181 }), null)).toBe('impossible')
		expect(validateLocationPoint(point({ lat: Number.NaN }), null)).toBe('impossible')
	})

	// The OS replays buffered fixes; taking one would give a negative leg time
	// and an infinite speed.
	it('rejects a fix that arrives out of order', () => {
		const previous = north(0, T0 + 10_000)

		expect(validateLocationPoint(north(50, T0), previous)).toBe('stale')
		expect(validateLocationPoint(north(50, T0 + 10_000), previous)).toBe('stale')
	})

	// The whole reason MIN_LEG_M exists: standing still, fixes wander a few
	// metres forever, and without a floor a walk paused at a crossing gains
	// distance indefinitely.
	it('rejects jitter while standing still', () => {
		const previous = north(0, T0)

		expect(validateLocationPoint(north(MIN_LEG_M - 1, T0 + 5000), previous)).toBe('jitter')
	})

	it('rejects a leg nobody could have walked', () => {
		const previous = north(0, T0)

		// 500m in one second.
		expect(validateLocationPoint(north(500, T0 + 1000), previous)).toBe('impossible')
	})

	it('accepts a brisk but human leg', () => {
		const previous = north(0, T0)

		// 15m in 10s is 1.5 m/s — an ordinary walking pace.
		expect(validateLocationPoint(north(15, T0 + 10_000), previous)).toBeNull()
	})

	// The reason MAX_SPEED_MS is 8 rather than 4: at the walking-only threshold
	// every leg of a decent run was thrown away as impossible, and the distance
	// quietly came out short instead of anything saying so.
	it('accepts a running pace', () => {
		const previous = north(0, T0)

		// 45m in 10s is 4.5 m/s — about 16.2 km/h, a strong 5k pace.
		expect(validateLocationPoint(north(45, T0 + 10_000), previous)).toBeNull()
	})

	// A car is NOT rejected here. It has to reach the route so the screen can
	// say what it is doing about it — `MAX_SPEED_MS` only catches fixes that
	// could not have happened at all.
	it('accepts a leg a car could cover, and leaves it to the classifier', () => {
		const previous = north(0, T0)

		// 150m in 10s is 15 m/s — 54 km/h, plainly a car.
		expect(validateLocationPoint(north(150, T0 + 10_000), previous)).toBeNull()
		expect(classifyLeg(150, 10_000)).toBe('vehicle')
	})

	it('still rejects a fix that could not have happened', () => {
		const previous = north(0, T0)

		// 1km in one second — 3,600 km/h. The GPS teleported.
		expect(validateLocationPoint(north(1000, T0 + 1000), previous)).toBe('impossible')
	})
})

describe('accumulating a route', () => {
	it('adds accepted points and their legs', () => {
		let session = walking()
		session = appendLocationPoint(session, north(0, T0))
		session = appendLocationPoint(session, north(50, T0 + 30_000))
		session = appendLocationPoint(session, north(100, T0 + 60_000))

		expect(session.points).toHaveLength(3)
		expect(session.distanceM / 100).toBeCloseTo(1, 2)
	})

	// Returning the same object is what lets a caller skip a re-render and a
	// storage write when nothing changed.
	it('returns the identical session when a point is rejected', () => {
		const session = appendLocationPoint(walking(), north(0, T0))
		const jittered = appendLocationPoint(session, north(1, T0 + 5000))

		expect(jittered).toBe(session)
		expect(jittered.distanceM).toBe(0)
	})

	it('gains no distance from a stationary hour of jitter', () => {
		let session = appendLocationPoint(walking(), north(0, T0))

		for (let index = 1; index <= 720; index += 1) {
			// Alternating ±1m, the classic stationary wander.
			session = appendLocationPoint(session, north(index % 2, T0 + index * 5000))
		}

		expect(session.distanceM).toBe(0)
		expect(session.points).toHaveLength(1)
	})

	// A fix that lands during a pause would otherwise draw a line across
	// wherever the user went while stopped.
	it('ignores points while paused', () => {
		let session = appendLocationPoint(walking(), north(0, T0))
		session = pauseWalk(session, T0 + MIN)
		session = appendLocationPoint(session, north(400, T0 + 2 * MIN))

		expect(session.points).toHaveLength(1)
		expect(session.distanceM).toBe(0)
	})
})

describe('the walk clock', () => {
	it('counts from the wall clock', () => {
		const session = walking()

		expect(activeMs(session, T0)).toBe(0)
		expect(activeMs(session, T0 + 12 * MIN)).toBe(12 * MIN)
	})

	// The reason the model stores an instant at all: the phone is in a pocket
	// with the app suspended for exactly the stretch worth counting.
	it('counts time that passed while the app was suspended', () => {
		const finished = finishWalk(walking(), T0 + 47 * MIN)

		expect(finished.accumulatedMs).toBe(47 * MIN)
		expect(finished.endedAt).toBe(T0 + 47 * MIN)
	})

	it('freezes the total while paused', () => {
		const paused = pauseWalk(walking(), T0 + 10 * MIN)

		expect(isPaused(paused)).toBe(true)
		// Still ten minutes an hour later.
		expect(activeMs(paused, T0 + 70 * MIN)).toBe(10 * MIN)
	})

	it('costs no time across a pause, however long', () => {
		let session = pauseWalk(walking(), T0 + 10 * MIN)
		session = resumeWalk(session, T0 + 70 * MIN)

		expect(activeMs(session, T0 + 70 * MIN)).toBe(10 * MIN)
		expect(activeMs(session, T0 + 75 * MIN)).toBe(15 * MIN)
	})

	it('accumulates across several pauses', () => {
		let session = walking()
		session = pauseWalk(session, T0 + 5 * MIN)
		session = resumeWalk(session, T0 + 20 * MIN)
		session = pauseWalk(session, T0 + 25 * MIN)
		session = resumeWalk(session, T0 + 40 * MIN)

		expect(activeMs(session, T0 + 45 * MIN)).toBe(15 * MIN)
	})

	it('ignores transitions that do not apply', () => {
		const live = walking()
		const paused = pauseWalk(live, T0 + MIN)

		expect(pauseWalk(paused, T0 + 2 * MIN)).toBe(paused)
		expect(resumeWalk(live, T0 + 2 * MIN)).toBe(live)
		expect(finishWalk(finishWalk(live, T0 + MIN), T0 + 2 * MIN).accumulatedMs).toBe(MIN)
	})

	it('finishes from paused without losing the banked time', () => {
		const paused = pauseWalk(walking(), T0 + 18 * MIN)
		const finished = finishWalk(paused, T0 + 90 * MIN)

		expect(finished.status).toBe('completed')
		expect(finished.accumulatedMs).toBe(18 * MIN)
	})

	it('cancels without discarding what was walked', () => {
		const cancelled = cancelWalk(walking(), T0 + 4 * MIN)

		expect(cancelled.status).toBe('cancelled')
		expect(cancelled.accumulatedMs).toBe(4 * MIN)
	})

	// A walk that starts at 23:50 and ends at 00:20 is one walk. The model holds
	// epoch instants, so the day boundary simply does not arise here — it is the
	// caller's business which day to file it under.
	it('is unbothered by crossing midnight', () => {
		const nearMidnight = startWalk('walk-2', T0)
		const finished = finishWalk(nearMidnight, T0 + 30 * MIN)

		expect(finished.accumulatedMs).toBe(30 * MIN)
	})
})

describe('movement', () => {
	// Distance is the target, so the walk/run line only ever labels the screen —
	// but the VEHICLE line decides what a challenge is credited with, which is
	// why the bands below are worth pinning down.
	it('reads a leg by its speed', () => {
		expect(classifyLeg(2, 10_000)).toBe('still')
		expect(classifyLeg(14, 10_000)).toBe('walking')
		expect(classifyLeg(45, 10_000)).toBe('running')
		expect(classifyLeg(90, 10_000)).toBe('vehicle')
	})

	it('has no opinion without a time to measure over', () => {
		expect(classifyLeg(50, 0)).toBe('unknown')
		expect(classifyLeg(50, -1000)).toBe('unknown')
	})

	// A single fast leg is a GPS fix jumping a block sideways, which happens
	// constantly in cities. Discarding on the first one would eat chunks of
	// ordinary walks.
	it('still counts one fast leg, because that is noise', () => {
		let session = walking()
		let last = north(0, T0)
		session = appendLocationPoint(session, last)

		// 70m in 10s — vehicle speed, but only once.
		last = leg(last, 70, 10)
		session = appendLocationPoint(session, last)
		// Then back to walking.
		last = leg(last, 14, 10)
		session = appendLocationPoint(session, last)

		expect(session.distanceM).toBeGreaterThan(80)
		expect(session.vehicleM).toBe(0)
	})

	// The whole reason this exists: a phone in a car draws a beautiful clean
	// trace, and without this it would put twenty kilometres on a challenge in
	// the time it takes to drive home.
	it('throws out a sustained run of vehicle-speed legs', () => {
		let session = walking()
		let last = north(0, T0)
		session = appendLocationPoint(session, last)

		for (let index = 0; index < VEHICLE_LEG_STREAK; index += 1) {
			last = leg(last, 70, 10)
			session = appendLocationPoint(session, last)
		}

		expect(looksLikeVehicle(session)).toBe(true)

		// Walking again settles the streak — into vehicleM, not distanceM.
		last = leg(last, 14, 10)
		session = appendLocationPoint(session, last)

		expect(session.vehicleM).toBeCloseTo(210, 0)
		expect(session.distanceM).toBeCloseTo(14, 0)
		expect(looksLikeVehicle(session)).toBe(false)
	})

	// A ride that runs to the end of the outing has nothing after it to settle
	// the streak, so finishing has to do it — otherwise those metres ride into
	// history unbanked.
	it('settles a ride that never ended before the walk did', () => {
		let session = walking()
		let last = north(0, T0)
		session = appendLocationPoint(session, last)

		for (let index = 0; index < VEHICLE_LEG_STREAK; index += 1) {
			last = leg(last, 70, 10)
			session = appendLocationPoint(session, last)
		}

		const finished = finishWalk(session, T0 + 10 * MIN)

		expect(finished.distanceM).toBe(0)
		expect(finished.vehicleM).toBeCloseTo(210, 0)
		expect(finished.pendingM).toBe(0)
	})

	it('reports what the last leg looked like', () => {
		let session = walking()
		let last = north(0, T0)
		session = appendLocationPoint(session, last)
		last = leg(last, 45, 10)
		session = appendLocationPoint(session, last)

		expect(session.movement).toBe('running')
	})
})

describe('speed', () => {
	it('averages distance over active time', () => {
		// 1 km in 10 minutes is 1.667 m/s — 6 km/h.
		expect(averageSpeed(1000, 600_000)).toBeCloseTo(1.667, 2)
		expect(formatSpeed(averageSpeed(1000, 600_000))).toBe('6.0 km/h')
	})

	it('says nothing over a distance too short to divide', () => {
		expect(averageSpeed(4, 60_000)).toBeNull()
		expect(averageSpeed(1000, 0)).toBeNull()
		expect(formatSpeed(null)).toBe('—')
	})

	// Leg by leg, not `point.speed`: the platform's figure is instantaneous and
	// includes the spikes point validation exists to reject.
	it('takes the fastest leg', () => {
		const points = [
			{ lat: 0, lon: 0, at: 0, accuracy: 5 },
			// ~11.1 m in 10s — a walk.
			{ lat: 0.0001, lon: 0, at: 10_000, accuracy: 5 },
			// ~33.4 m in 10s — a run, and the fastest here.
			{ lat: 0.0004, lon: 0, at: 20_000, accuracy: 5 },
		]

		expect(maxLegSpeed(points)).toBeCloseTo(3.34, 1)
	})

	it('leaves a vehicle leg out of the fastest', () => {
		const points = [
			{ lat: 0, lon: 0, at: 0, accuracy: 5 },
			{ lat: 0.0001, lon: 0, at: 10_000, accuracy: 5 },
			// ~111 m in 10s — 11 m/s, a car. Not this walk's best moment.
			{ lat: 0.0011, lon: 0, at: 20_000, accuracy: 5 },
		]

		expect(maxLegSpeed(points)).toBeCloseTo(1.11, 1)
	})

	it('has no fastest leg without one', () => {
		expect(maxLegSpeed([])).toBeNull()
		expect(maxLegSpeed([{ lat: 0, lon: 0, at: 0, accuracy: 5 }])).toBeNull()
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
		expect(formatDistance(1000)).toBe('1.00 km')
		expect(formatDistance(2340)).toBe('2.34 km')
	})

	it('formats pace, and a dash when there is none', () => {
		expect(formatPace(13 * MIN + 45_000)).toBe('13:45 /km')
		expect(formatPace(null)).toBe('—')
		expect(formatPace(Number.POSITIVE_INFINITY)).toBe('—')
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
	function finishedAfter(minutes: number, id = 'walk-1'): WalkRecord {
		const session = finishWalk(startWalk(id, T0), T0 + minutes * MIN)
		const record = toWalkRecord(session, T0 + minutes * MIN)

		if (!record) {
			throw new Error('expected a record')
		}

		return record
	}

	// Start-then-immediately-stop is a mis-tap, and a history full of
	// eight-second walks is one nobody scrolls.
	it('refuses to record a walk shorter than the floor', () => {
		const tooShort = finishWalk(walking(), T0 + MIN_RECORDED_WALK_MS - 1)

		expect(toWalkRecord(tooShort, T0 + MIN_RECORDED_WALK_MS - 1)).toBeNull()
	})

	// The floor is on duration, not distance: this is a "did you show up" app,
	// and two minutes of slow walking showed up.
	it('records a slow walk that covered no ground', () => {
		const record = finishedAfter(2)

		expect(record.activeMs).toBe(2 * MIN)
		expect(record.distanceM).toBe(0)
	})

	it('files a walk newest first and marks it unsynced', () => {
		let state = recordWalk(emptyWalkState, finishedAfter(10, 'a'))
		state = recordWalk(state, finishedAfter(20, 'b'))

		expect(state.history.map((record) => record.id)).toEqual(['b', 'a'])
		expect(state.history[0].synced).toBe(false)
		expect(state.active).toBeNull()
	})

	// The same walk syncing or re-saving must not appear twice.
	it('replaces rather than duplicates a walk with the same id', () => {
		let state = recordWalk(emptyWalkState, finishedAfter(10, 'a'))
		state = recordWalk(state, finishedAfter(25, 'a'))

		expect(state.history).toHaveLength(1)
		expect(state.history[0].activeMs).toBe(25 * MIN)
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

	// Milestones are markers you PASS. Nothing is joined, nothing is chosen, and
	// every standing is derived from the lifetime total on every read.
	describe('milestones', () => {
		function covered(id: string, metres: number, startedAt: number): WalkRecord {
			return { ...finishedAfter(20, id), startedAt, distanceM: metres }
		}

		it('sums every outing ever recorded', () => {
			expect(lifetimeDistanceM([])).toBe(0)
			expect(lifetimeDistanceM([covered('a', 2340, T0), covered('b', 6300, T0 + MIN)])).toBe(8640)
		})

		it('marks everything under the total as passed', () => {
			const standings = milestoneStandings([covered('a', 6000, T0)])
			const passed = standings.filter((entry) => entry.passed).map((entry) => entry.milestone.id)

			expect(passed).toEqual(['1k', '5k'])
		})

		it('offers the nearest unpassed one, and nothing once they are all behind you', () => {
			expect(nextMilestone([])?.milestone.id).toBe('1k')
			expect(nextMilestone([covered('a', 6000, T0)])?.milestone.id).toBe('10k')
			expect(nextMilestone([covered('a', 200_000, T0)])).toBeNull()
		})

		it('measures how far the next one still is', () => {
			const standing = nextMilestone([covered('a', 6000, T0)])

			expect(standing?.remainingM).toBe(4000)
			expect(standing?.ratio).toBeCloseTo(0.6, 5)
		})

		// The summary celebrates what an outing crossed. Re-announcing a marker
		// passed last week is the thing that makes a badge stop meaning anything.
		it('reports only what this outing carried you past', () => {
			const before = [covered('a', 900, T0)]
			const crossed = milestonesCrossedBy(before, covered('b', 200, T0 + MIN))

			expect(crossed.map((entry) => entry.id)).toEqual(['1k'])
			expect(milestonesCrossedBy([...before, covered('b', 200, T0 + MIN)], covered('c', 50, T0 + 2 * MIN))).toEqual([])
		})

		it('reports both when one outing crosses two', () => {
			const crossed = milestonesCrossedBy([], covered('a', 6000, T0))

			expect(crossed.map((entry) => entry.id)).toEqual(['1k', '5k'])
		})

		// `distanceM` is on-foot only by construction, so a record whose vehicle
		// distance dwarfs it still moves a milestone only by the walking part.
		it('never counts vehicle distance toward a milestone', () => {
			expect(lifetimeDistanceM([{ ...covered('a', 900, T0), vehicleM: 24_000 }])).toBe(900)
		})

		// The ladder is persisted by nothing — standings are recomputed — but a
		// ladder that ever went backwards would make "next" meaningless.
		it('has unique ids and rising distances', () => {
			const ids = MILESTONES.map((entry) => entry.id)

			expect(new Set(ids).size).toBe(ids.length)

			for (let index = 1; index < MILESTONES.length; index += 1) {
				expect(MILESTONES[index].targetM).toBeGreaterThan(MILESTONES[index - 1].targetM)
			}

			expect(findMilestone('nope')).toBeUndefined()
			expect(findMilestone(null)).toBeUndefined()
		})
	})

	describe('encouragement', () => {
		// A fake calendar of 24-hour blocks counted from T0. `outingStreak` takes
		// its day maths in as parameters precisely so a test can do this — the
		// module itself never turns an instant into a date, and so never needs a
		// timezone or a frozen clock.
		const DAY = 24 * 60 * MIN
		const keyOf = (at: number) => `day-${Math.floor((at - T0) / DAY)}`
		const previous = (key: string) => `day-${Number(key.slice(4)) - 1}`
		const dayKey = (index: number) => `day-${index}`

		function onDay(id: string, index: number): WalkRecord {
			return { ...finishedAfter(20, id), startedAt: T0 + index * DAY }
		}

		it('counts consecutive days back from today', () => {
			const history = [onDay('a', 0), onDay('b', 1), onDay('c', 2)]

			expect(outingStreak(history, dayKey(2), keyOf, previous)).toBe(3)
		})

		it('breaks on a day with nothing on it', () => {
			const history = [onDay('a', 0), onDay('c', 2), onDay('d', 3)]

			expect(outingStreak(history, dayKey(3), keyOf, previous)).toBe(2)
		})

		// Grace: a streak built yesterday does not read as broken until a whole
		// day has actually been missed. The same grace the habit streak gives.
		it('survives a day that has not finished yet', () => {
			const history = [onDay('a', 1), onDay('b', 2)]

			expect(outingStreak(history, dayKey(3), keyOf, previous)).toBe(2)
		})

		it('is broken once a whole day has gone by', () => {
			const history = [onDay('a', 1), onDay('b', 2)]

			expect(outingStreak(history, dayKey(4), keyOf, previous)).toBe(0)
		})

		it('is zero with nothing recorded', () => {
			expect(outingStreak([], dayKey(0), keyOf, previous)).toBe(0)
		})

		it('counts a day once however many outings it holds', () => {
			const history = [onDay('a', 0), onDay('b', 0), onDay('c', 1)]

			expect(outingStreak(history, dayKey(1), keyOf, previous)).toBe(2)
		})

		it('remembers the longest single outing', () => {
			expect(personalBestM([])).toBe(0)
			expect(personalBestM([onDay('a', 0), { ...onDay('b', 1), distanceM: 4200 }])).toBe(4200)
		})

		// Every line is a fact about what someone has ALREADY done. None of them
		// tells anyone what they ought to do next.
		it('leads with the most specific true thing', () => {
			const one = [onDay('a', 0)]

			expect(encouragement([], 0, 0)).toContain('Press start')
			expect(encouragement(one, 4, 4)).toContain('4 days in a row')
			expect(encouragement(one, 0, 3)).toContain('3 times out this week')
			expect(encouragement(one, 0, 1)).toContain('Once out this week')
			expect(encouragement(one, 0, 0)).toContain('1 outing behind you')
		})
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

		it('round-trips an interrupted walk so it can be resumed', () => {
			const state = { ...emptyWalkState, active: pauseWalk(walking(), T0 + 8 * MIN) }
			const restored = normalizeWalkState(JSON.parse(JSON.stringify(state)))

			expect(restored.active?.status).toBe('paused')
			expect(activeMs(restored.active!, T0 + 99 * MIN)).toBe(8 * MIN)
		})

		// Losing the walk in progress is recoverable; losing months of finished
		// walks is not.
		it('drops a malformed active session but keeps the history', () => {
			const state = recordWalk(emptyWalkState, finishedAfter(15))
			const restored = normalizeWalkState({ ...JSON.parse(JSON.stringify(state)), active: { id: 5, status: 'active' } })

			expect(restored.active).toBeNull()
			expect(restored.history).toHaveLength(1)
		})

		it('restores a session with an unusable start instant as paused, keeping its time', () => {
			const restored = normalizeWalkState({
				active: { id: 'a', status: 'active', startedAt: T0, accumulatedMs: 14 * MIN, runningSince: Number.NaN },
			})

			expect(restored.active?.status).toBe('paused')
			expect(activeMs(restored.active!, T0 + 60 * MIN)).toBe(14 * MIN)
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
})
