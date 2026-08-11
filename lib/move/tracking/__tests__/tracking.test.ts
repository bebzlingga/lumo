import { TRACKING_CONFIG } from '../config'
import { filterLocationPoint } from '../filter'
import { gpsQualityFrom, isMovement, stepMovement } from '../movement'
import { averagePace, estimateCalories, formatPace, smoothedPace, speedToPace } from '../pace'
import {
	beginTracking,
	createActivity,
	finishActivity,
	pauseActivity,
	processLocation,
	restoreActivity,
	resumeActivity,
	routePoints,
	tick,
} from '../tracker'
import type { ActivityTrackingState, RawLocationPoint } from '../types'

/**
 * The tracker, fed fixes.
 *
 * Every test here is a walk that could actually happen — a straight line, a
 * receiver jumping a block, a phone on a café table, a pause at a shop — because
 * those are the cases the pipeline exists for. Nothing reads a clock: `now` is
 * always the fix's own timestamp unless a test is about the gap between them.
 */

const T0 = Date.parse('2026-08-11T09:00:00.000Z')
/** Metres per degree of latitude, near enough for a fixture. */
const M_PER_DEG = 111_320

function at(seconds: number) {
	return T0 + seconds * 1000
}

/** A fix `northM` metres north of the origin, at `seconds`. */
function fix(northM: number, seconds: number, accuracy = 5) {
	return {
		latitude: 14.6 + northM / M_PER_DEG,
		longitude: 120.98,
		horizontalAccuracy: accuracy,
		timestamp: at(seconds),
	}
}

function started(): ActivityTrackingState {
	return beginTracking(createActivity({ activityId: 'a1', type: 'walk', now: T0 }), T0)
}

/** Feeds a list of fixes through the pipeline in order. */
function walk(state: ActivityTrackingState, points: ReturnType<typeof fix>[], stepping?: boolean) {
	return points.reduce(
		(current, point) => processLocation(current, point, { now: point.timestamp, steppingRecently: stepping }).state,
		state,
	)
}

describe('normal movement', () => {
	// A → B → C, four metres apart every four seconds: an ordinary stroll.
	it('accumulates distance between accepted fixes', () => {
		const state = walk(started(), [fix(0, 0), fix(4, 4), fix(8, 8)])

		expect(state.distanceMeters).toBeCloseTo(8, 0)
		expect(routePoints(state)).toHaveLength(3)
	})

	it('keeps every fix, accepted or not', () => {
		const state = walk(started(), [fix(0, 0), fix(4, 4), fix(5.5, 5)])

		expect(state.rawPoints).toHaveLength(3)
		expect(state.rawPoints.filter((point) => point.isAccepted)).toHaveLength(2)
		expect(state.rawPoints[2].rejectionReason).toBe('jitter')
	})
})

describe('bad fixes', () => {
	it('rejects a fix the receiver does not believe', () => {
		const state = walk(started(), [fix(0, 0), fix(10, 4, 150)])

		expect(state.rawPoints[1].rejectionReason).toBe('accuracy')
		expect(state.distanceMeters).toBe(0)
	})

	// 500 m in 2 s is 250 m/s. Not a fast runner — a receiver jumping.
	it('rejects a leg nothing could have walked', () => {
		const state = walk(started(), [fix(0, 0), fix(500, 2)])

		expect(state.rawPoints[1].rejectionReason).toBe('impossible')
		expect(state.distanceMeters).toBe(0)
	})

	it('rejects a fix from before the stream', () => {
		const verdict = filterLocationPoint({
			point: fix(20, 0),
			previous: null,
			newestAt: at(120),
			type: 'walk',
		})

		expect(verdict).toEqual({ accepted: false, reason: 'stale', distanceM: 0 })
	})

	// A → B → BAD → C, where BAD is a block away and C carries on from B.
	it('does not count a teleport into the route', () => {
		const state = walk(started(), [fix(0, 0), fix(5, 5), fix(90, 10), fix(10, 15)])
		const reasons = state.rawPoints.map((point) => point.rejectionReason)

		// The excursion itself is impossible-fast, and the fix that would carry
		// the round trip back is caught as a teleport.
		expect(reasons[2]).toBeDefined()
		expect(state.distanceMeters).toBeLessThan(20)
	})
})

describe('stationary drift', () => {
	/**
	 * A phone on a table for a minute. Every fix is real, none is movement, and
	 * the walk must not gain a metre.
	 */
	it('stays at zero while standing still', () => {
		const drift = Array.from({ length: 30 }, (_, index) => fix(index % 2 === 0 ? 0 : 1.5, index * 2))
		const state = walk(started(), drift)

		expect(state.distanceMeters).toBe(0)
		expect(state.movement).toBe('stopped')
	})

	it('auto-pauses once the movement has gone', () => {
		const drift = Array.from({ length: 20 }, (_, index) => fix(0, index * 2))
		const state = walk(started(), drift)

		expect(state.status).toBe('autoPaused')
	})

	it('lifts its own pause when movement returns', () => {
		const stopped = walk(started(), Array.from({ length: 20 }, (_, index) => fix(0, index * 2)))

		expect(stopped.status).toBe('autoPaused')

		// Sustained movement, not one hopeful fix.
		const moving = walk(stopped, [fix(5, 42), fix(10, 46), fix(15, 50), fix(20, 54)])

		expect(moving.status).toBe('active')
		expect(moving.movement).toBe('moving')
	})
})

describe('manual pause', () => {
	/**
	 * A → B, pause, walk 200 m to a shop, resume, C → D.
	 *
	 * The 200 m happened, but Lumo did not see it, and joining B to C would
	 * report it as if it had. A new segment is what prevents that.
	 */
	it('never draws distance across the gap', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])

		expect(state.distanceMeters).toBeCloseTo(10, 0)

		state = pauseActivity(state, at(15))
		state = walk(state, [fix(200, 100)])

		expect(state.distanceMeters).toBeCloseTo(10, 0)

		state = resumeActivity(state, at(120))
		state = walk(state, [fix(200, 125), fix(210, 135)])

		expect(state.distanceMeters).toBeCloseTo(20, 0)
		expect(state.segments).toHaveLength(2)
	})

	it('holds moving time while paused and keeps the wall clock running', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = pauseActivity(state, at(10))
		state = tick(state, at(70))

		expect(state.movingDuration).toBeLessThanOrEqual(10_000)
		expect(state.pausedDuration).toBeGreaterThan(0)
		expect(state.elapsedDuration).toBeGreaterThanOrEqual(70_000)
	})

	it('does not let the tracker lift a pause the user set', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = pauseActivity(state, at(12))
		state = walk(state, [fix(20, 20), fix(30, 30), fix(40, 40)])

		expect(state.status).toBe('paused')
	})
})

describe('the clock', () => {
	it('gives a suspended stretch to elapsed time and nothing else', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		// An hour in a pocket with no background permission.
		const movingBefore = state.movingDuration
		state = tick(state, at(3_610))

		expect(state.elapsedDuration).toBeGreaterThan(3_600_000)
		// Not one second of it is claimed as walking.
		expect(state.movingDuration).toBe(movingBefore)
	})

	it('does not count the acquisition phase', () => {
		const preparing = createActivity({ activityId: 'a1', type: 'walk', now: T0 })
		const waited = tick(preparing, at(30))

		expect(waited.elapsedDuration).toBe(0)

		const begun = beginTracking(waited, at(30))

		expect(begun.startedAt).toBe(at(30))
	})
})

describe('recovery', () => {
	it('resumes into a new segment and claims nothing about the gap', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		const before = state.distanceMeters

		state = restoreActivity(state, at(900))

		expect(state.distanceMeters).toBe(before)
		expect(state.segments).toHaveLength(2)
		expect(state.elapsedDuration).toBeGreaterThan(800_000)
		expect(state.movingDuration).toBeLessThan(20_000)

		// And the first fix after recovery cannot reach back across the gap.
		state = walk(state, [fix(400, 905), fix(410, 915)])

		expect(state.distanceMeters).toBeCloseTo(before + 10, 0)
	})
})

describe('pace', () => {
	it('is not moved by one noisy fix', () => {
		/**
		 * A steady 1 m/s — 16:40/km — ending on a 4 m hop that the filter has no
		 * reason to reject (4 m/s is under the walk ceiling). On the last two
		 * points alone that hop reads as 4:10/km; over the window it barely
		 * moves the needle.
		 */
		const steady = Array.from({ length: 25 }, (_, index) => fix(index, index))
		const state = walk(started(), [...steady, fix(28, 25)])
		const pace = smoothedPace(state.segments, at(25))

		expect(pace).not.toBeNull()
		expect(pace! / 1000).toBeGreaterThan(13 * 60)
		expect(pace! / 1000).toBeLessThan(17 * 60)
	})

	it('measures the average against moving time, not elapsed', () => {
		// 1 km covered in 10 minutes of moving; 30 minutes of standing about.
		expect(formatPace(averagePace(1000, 600_000))).toBe('10:00 /km')
	})

	it('says nothing when there is not enough walk to divide', () => {
		expect(averagePace(4, 60_000)).toBeNull()
		expect(smoothedPace([], T0)).toBeNull()
		expect(formatPace(null)).toBe('—')
	})

	it('converts between speed and pace', () => {
		// 1 m/s is a kilometre every 1000 s — 16:40.
		expect(formatPace(speedToPace(1))).toBe('16:40 /km')
		expect(speedToPace(0)).toBeNull()
	})
})

describe('movement state machine', () => {
	it('takes its time on the way down and further on the way back', () => {
		const base = { since: T0, lastMovementAt: T0 }

		const quiet = stepMovement({ state: 'moving', ...base, now: at(7), moved: false })
		expect(quiet.state).toBe('possiblyStopped')

		const stopped = stepMovement({ state: 'possiblyStopped', since: at(7), lastMovementAt: T0, now: at(13), moved: false })
		expect(stopped.state).toBe('stopped')

		// One fix of movement is not enough to restart it.
		const nudged = stepMovement({ state: 'stopped', since: at(13), lastMovementAt: T0, now: at(14), moved: true })
		expect(nudged.state).toBe('stopped')

		const going = stepMovement({ state: 'stopped', since: at(13), lastMovementAt: at(14), now: at(18), moved: true })
		expect(going.state).toBe('moving')
	})

	it('treats a device with no pedometer as having no opinion', () => {
		expect(isMovement({ legM: 4, elapsedMs: 4000 })).toBe(true)
		expect(isMovement({ legM: 1, elapsedMs: 4000 })).toBe(false)
		// Below GPS walking speed, but the pedometer is counting.
		expect(isMovement({ legM: 3, elapsedMs: 10_000, stepping: true })).toBe(true)
	})
})

describe('gps quality', () => {
	it('reads from accuracy and recency', () => {
		expect(gpsQualityFrom({ accuracyM: 5, lastFixAt: T0, now: T0 })).toBe('excellent')
		expect(gpsQualityFrom({ accuracyM: 15, lastFixAt: T0, now: T0 })).toBe('good')
		expect(gpsQualityFrom({ accuracyM: 35, lastFixAt: T0, now: T0 })).toBe('weak')
		expect(gpsQualityFrom({ accuracyM: 80, lastFixAt: T0, now: T0 })).toBe('poor')
		expect(gpsQualityFrom({ accuracyM: null, lastFixAt: null, now: T0 })).toBe('unavailable')
	})

	it('does not trust a good fix from a minute ago', () => {
		expect(gpsQualityFrom({ accuracyM: 5, lastFixAt: T0, now: at(60) })).toBe('unavailable')
	})
})

describe('finishing', () => {
	it('closes the activity and its last segment', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = finishActivity(state, at(15))

		expect(state.status).toBe('finished')
		expect(state.finishedAt).toBe(at(15))
		expect(state.segments[state.segments.length - 1].endedAt).toBe(at(15))
	})

	it('ignores fixes that arrive after the finish', () => {
		let state = finishActivity(walk(started(), [fix(0, 0), fix(10, 10)]), at(15))
		const before = state.distanceMeters

		state = walk(state, [fix(30, 20)])

		expect(state.distanceMeters).toBe(before)
		expect(state.rawPoints[state.rawPoints.length - 1].rejectionReason).toBe('notTracking')
	})
})

describe('calories', () => {
	it('is an estimate, and says so by being a round number', () => {
		// 5 km in 50 minutes — a 6 km/h walk.
		const kcal = estimateCalories({ distanceM: 5000, movingMs: 50 * 60_000 })

		expect(kcal).toBeGreaterThan(150)
		expect(kcal).toBeLessThan(400)
	})

	it('has nothing to estimate from a walk that did not happen', () => {
		expect(estimateCalories({ distanceM: 0, movingMs: 0 })).toBeNull()
	})
})

describe('raw points', () => {
	it('keeps the newest when the cap is reached', () => {
		const many: RawLocationPoint[] = []
		let state = started()

		for (let index = 0; index < 40; index += 1) {
			const result = processLocation(state, fix(index * 4, index * 4), { now: at(index * 4) })
			state = result.state
			many.push(result.point)
		}

		expect(state.rawPoints).toHaveLength(40)
		expect(state.rawPoints[39].timestamp).toBe(many[39].timestamp)
	})
})
