import { TRACKING_CONFIG } from '../config'
import { filterLocationPoint, minimumLegM } from '../filter'
import { gpsQualityFrom, isMovement, stepMovement } from '../movement'
import {
	averagePace,
	elevationGain,
	estimateCalories,
	formatElevation,
	formatPace,
	smoothedPace,
	speedToPace,
} from '../pace'
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
import { toWalkPoints, toWalkRecordFromActivity } from '../bridge'
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
	return beginTracking(createActivity({ activityId: 'a1', now: T0 }), T0)
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

	// 500 m in 2 s is 250 m/s. Not a sprinter — a receiver jumping.
	it('rejects a leg nothing could have walked', () => {
		const state = walk(started(), [fix(0, 0), fix(500, 2)])

		expect(state.rawPoints[1].rejectionReason).toBe('impossible')
		expect(state.distanceMeters).toBe(0)
	})

	it('rejects a fix from before the stream', () => {
		const verdict = filterLocationPoint({ point: fix(20, 0), previous: null, newestAt: at(120) })

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

	/**
	 * Standing still is NOT a pause.
	 *
	 * Forty seconds at a crossing with a perfect lock: nothing is banked, the
	 * detector says stopped, and the recording stays running. Auto-pause used to
	 * fire here, and firing here is what made walks pause themselves on the
	 * doorstep while the receiver was still finding itself.
	 */
	it('keeps recording while the signal is good, however still it is', () => {
		const drift = Array.from({ length: 20 }, (_, index) => fix(0, index * 2))
		const state = walk(started(), drift)

		expect(state.movement).toBe('stopped')
		expect(state.status).toBe('active')
		expect(state.distanceMeters).toBe(0)
	})
})

describe('lost signal', () => {
	const lostAfterS = TRACKING_CONFIG.autoPause.signalLostAfterMs / 1000

	it('pauses itself once it cannot locate you', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])

		expect(state.status).toBe('active')

		// A tunnel: no fixes at all, and the display clock is what notices.
		state = tick(state, at(10 + lostAfterS))

		expect(state.status).toBe('autoPaused')
	})

	/** Fixes too vague to record are not locations, however many arrive. */
	it('counts unusable fixes as no fix at all', () => {
		const vague = Array.from({ length: 10 }, (_, index) => fix(index * 10, 10 + index * 5, 120))
		const state = walk(walk(started(), [fix(0, 0), fix(10, 10)]), vague)

		expect(state.rawPoints[2].rejectionReason).toBe('accuracy')
		expect(state.status).toBe('autoPaused')
	})

	it('picks up on the first fix it can trust, in a new segment', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = tick(state, at(10 + lostAfterS))

		expect(state.status).toBe('autoPaused')

		const segmentsWhileLost = state.segments.length
		// Out the other side, fifty metres on. One good fix is enough — there is
		// no case for making somebody walk another minute to prove it.
		state = walk(state, [fix(60, 20 + lostAfterS)])

		expect(state.status).toBe('active')
		expect(state.segments.length).toBe(segmentsWhileLost + 1)
		// And the blackout is not distance: nothing joins across the gap.
		expect(state.distanceMeters).toBeCloseTo(10, 0)
	})

	/**
	 * THE WALKER CANNOT LIFT THIS ONE, AND THAT IS THE POINT.
	 *
	 * An auto-pause means the tracker cannot place you. There is nothing on the
	 * other side of a Resume button to carry on WITH: no route, no distance, no
	 * pace — only elapsed time banked against a recording that would look real
	 * and not be. So the engine refuses it and the screen does not offer it; what
	 * the screen shows during one is Pause, which still does something.
	 */
	it('refuses a manual resume out of a pause the tracker set', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = tick(state, at(10 + lostAfterS))

		expect(state.status).toBe('autoPaused')

		const untouched = resumeActivity(state, at(15 + lostAfterS))

		expect(untouched).toBe(state)
	})

	/** However many times it is asked, and however long the signal stays away. */
	it('stays paused while the signal is still gone', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = tick(state, at(10 + lostAfterS))

		// Four more minutes of nothing, with somebody tapping at it throughout.
		for (let second = 11 + lostAfterS; second <= 250 + lostAfterS; second += 1) {
			state = tick(resumeActivity(state, at(second)), at(second))
		}

		expect(state.status).toBe('autoPaused')
	})

	/** Fixes that keep arriving and keep being useless are the same blackout. */
	it('stays paused while every fix is too vague to place', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = tick(state, at(10 + lostAfterS))
		state = walk(
			state,
			Array.from({ length: 60 }, (_, index) => fix(20 + index, 20 + lostAfterS + index * 3, 90)),
		)

		expect(state.status).toBe('autoPaused')
	})

	/**
	 * The way out is the signal, and only the signal — which is why the automatic
	 * lift has to be reliable. One good fix does it, and what follows it counts.
	 */
	it('counts what is walked once it picks itself back up', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = tick(state, at(10 + lostAfterS))
		state = walk(state, [fix(60, 20 + lostAfterS), fix(70, 30 + lostAfterS)])

		expect(state.status).toBe('active')
		// The ten metres before the blackout, plus the ten after it picked up.
		// Nothing joins across the gap itself — that is what the new segment is for.
		expect(state.distanceMeters).toBeCloseTo(20, 0)
	})

	/**
	 * And the walker is not powerless during one: they may take it over by hand,
	 * and what they set by hand they may lift.
	 */
	it('lets the walker take an auto-pause over and then lift it', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = tick(state, at(10 + lostAfterS))

		state = pauseActivity(state, at(15 + lostAfterS))

		expect(state.status).toBe('paused')
		expect(state.manuallyPaused).toBe(true)

		state = resumeActivity(state, at(20 + lostAfterS))

		expect(state.status).toBe('active')
	})

	it('leaves a manual pause alone, signal or not', () => {
		let state = pauseActivity(walk(started(), [fix(0, 0), fix(10, 10)]), at(12))
		state = tick(state, at(12 + lostAfterS * 2))

		expect(state.status).toBe('paused')

		// And a returning signal does not resume what the user paused.
		state = walk(state, [fix(20, 20 + lostAfterS * 2)])

		expect(state.status).toBe('paused')
	})
})

describe('recording with the screen off', () => {
	/**
	 * What `controller.drainBackground` does with a batch off the queue: replay
	 * each fix at its own timestamp, then bring the clock up to now.
	 */
	function drain(state: ActivityTrackingState, fixes: ReturnType<typeof fix>[], nowS: number) {
		let next = state

		for (const point of fixes) {
			next = processLocation(next, point, { now: Math.max(point.timestamp, next.lastTickAt) }).state
		}

		return tick(next, at(nowS))
	}

	/** A minute on screen before the phone goes in a pocket. */
	function walkedThenLocked() {
		let state = beginTracking(createActivity({ activityId: 'a1', now: T0 }), T0)

		for (let second = 1; second <= 60; second += 1) {
			state = processLocation(state, fix(1.4 * second, second, 8), { now: at(second) }).state
		}

		return state
	}

	/**
	 * THE WALK IN A POCKET THAT CAME BACK EMPTY.
	 *
	 * iOS hands a suspended app its locations in batches, and the wake can be well
	 * past the forty-second signal-lost window. The tick at the head of
	 * `processLocation` therefore saw "no fix for forty-five seconds" and
	 * auto-paused — and only THEN did the fix that had just arrived move
	 * `lastLocatedAt` and lift it again. Every delivery went pause, pick up,
	 * pause, pick up; a pick-up throws away the leg that caused it; and the walk
	 * came back from a locked screen with the clock and the distance exactly where
	 * they were when it went in the pocket.
	 *
	 * The fix's own timestamp is the answer to the question auto-pause asks, and
	 * it is in hand before the question needs answering.
	 */
	it('records a stretch the OS hands over late, in one piece', () => {
		let state = walkedThenLocked()

		expect(Math.round(state.movingDuration / 1000)).toBe(60)

		// Ten minutes locked, woken every forty-five seconds with the newest fix.
		let north = 1.4 * 60

		for (let second = 105; second <= 645; second += 45) {
			north += 1.4 * 45
			state = drain(state, [fix(north, second, 8)], second)
		}

		expect(state.status).toBe('active')
		// Every second of it walked, and every second of it counted.
		expect(state.elapsedDuration).toBe(645_000)
		expect(Math.round(state.movingDuration / 1000)).toBe(645)
		expect(state.distanceMeters).toBeGreaterThan(800)
	})

	/** The ordinary case, batched at `deferredUpdatesInterval`, is unaffected. */
	it('records a stretch handed over in full batches', () => {
		let state = walkedThenLocked()
		let north = 1.4 * 60

		for (let second = 65; second <= 645; second += 5) {
			const batch = [0, 1, 2, 3, 4].map((offset) => fix((north += 1.4), second - 4 + offset, 8))

			state = drain(state, batch, second)
		}

		expect(Math.round(state.movingDuration / 1000)).toBe(645)
		expect(state.distanceMeters).toBeGreaterThan(800)
	})

	/**
	 * And the cap it leans on still does its job. `maxTickMs` exists so a phone
	 * that genuinely slept does not report the nap as walking — a gap with NO fix
	 * to close it is still elapsed time and nothing else.
	 */
	it('does not credit a gap nothing came back from', () => {
		let state = walkedThenLocked()

		state = tick(state, at(660))

		expect(state.elapsedDuration).toBe(660_000)
		expect(Math.round(state.movingDuration / 1000)).toBe(60)
	})
})

describe('moving time', () => {
	/** A straight, steady walk, one fix a second, for ten minutes. */
	function steadyWalk(accuracy: number, speedMs = 1.4, seconds = 600) {
		let state = beginTracking(createActivity({ activityId: 'a1', now: T0 }), T0)

		for (let second = 1; second <= seconds; second += 1) {
			state = processLocation(state, fix(speedMs * second, second, accuracy), { now: at(second) }).state
		}

		return state
	}

	/**
	 * THE WHOLE WALK COUNTS, WHATEVER THE RECEIVER SAYS ABOUT ITSELF.
	 *
	 * The detector only hears about movement through ACCEPTED legs, and a leg is
	 * accepted once it clears `minimumLegM` — which scales with the claimed
	 * accuracy. At +/-25 m the floor is 17.5 m, which the same walker takes
	 * twelve seconds to clear, so the flat twelve-second stop threshold fired
	 * between every pair of legs. The walk latched on `stopped`: the moving clock
	 * froze AND, because distance is only banked while not stopped, ten minutes of
	 * walking recorded zero metres. See `movementThresholds`.
	 */
	it('runs for the whole walk at every accuracy the filter accepts', () => {
		for (const accuracy of [5, 10, 15, 20, 25, 30, 38]) {
			const state = steadyWalk(accuracy)

			expect([accuracy, Math.round(state.movingDuration / 1000)]).toEqual([accuracy, 600])
			expect([accuracy, state.distanceMeters > 700]).toEqual([accuracy, true])
		}
	})

	/**
	 * `possiblyStopped` decides nothing — it exists so `stopped` can be slow — and
	 * it was quietly stopping the clock. Distance is banked in that state, so the
	 * two disagreed and average pace came out fast by whatever share of the walk
	 * fell in the middle.
	 */
	it('keeps counting through the state that decides nothing', () => {
		const state = tick(
			{ ...steadyWalk(5, 1.4, 10), movement: 'possiblyStopped', lastMovementAt: at(10), lastTickAt: at(10) },
			at(15),
		)

		expect(state.movingDuration).toBe(10_000 + 5_000)
	})

	/**
	 * And it stops when there is nothing behind it. `movement` is only ever set by
	 * a fix, so with no fixes at all the last one to arrive said "moving" and the
	 * clock went on crediting minutes to a walk nothing was watching — up to the
	 * full forty seconds before auto-pause noticed, and indefinitely with
	 * auto-pause off.
	 */
	it('stops crediting a walk it has stopped hearing from', () => {
		let state = steadyWalk(5, 1.4, 60)

		expect(Math.round(state.movingDuration / 1000)).toBe(60)

		for (let second = 61; second <= 90; second += 1) {
			state = tick(state, at(second))
		}

		// The detector's own stop threshold, and not a second more.
		expect(Math.round(state.movingDuration / 1000)).toBeLessThanOrEqual(72)
		expect(state.elapsedDuration).toBe(90_000)
	})

	/**
	 * A fix thrown out for ACCURACY is not evidence of stillness — it is the
	 * absence of evidence — and reading it as "no movement" is how a walk through
	 * a mall or a market stopped its clock while the walker was plainly walking.
	 * The pedometer is the only witness left, and it says whether, never where:
	 * the time counts, the distance does not.
	 */
	it('counts a blind stretch the pedometer can vouch for', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		const before = state.distanceMeters

		state = walk(
			state,
			Array.from({ length: 30 }, (_, index) => fix(20 + index * 2, 12 + index * 2, 90)),
			true,
		)

		// Up to the point auto-pause fires, which it still does and still should:
		// the pedometer says the walker is walking, never where, and a recording
		// that cannot place anybody is right to stop. What the steps buy is the
		// forty seconds before that, which used to be twelve.
		expect(Math.round(state.movingDuration / 1000)).toBe(50)
		// Not one metre of it, though: nothing knew where any of it happened.
		expect(state.distanceMeters).toBeCloseTo(before, 0)
	})

	/** Without the pedometer there is nothing to vouch for it, and it does not count. */
	it('does not count a blind stretch on its own say-so', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10)])
		state = walk(
			state,
			Array.from({ length: 30 }, (_, index) => fix(20 + index * 2, 12 + index * 2, 90)),
		)

		expect(state.movement).toBe('stopped')
		expect(state.movingDuration).toBeLessThan(25_000)
	})

	/** Jitter is a GOOD reading of somebody standing still, steps or no steps. */
	it('still calls a stop a stop when the fixes are good', () => {
		const drift = Array.from({ length: 30 }, (_, index) => fix(index % 2 === 0 ? 0 : 1.5, index * 2))
		const state = walk(started(), drift, true)

		expect(state.movement).toBe('stopped')
		expect(state.distanceMeters).toBe(0)
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
		const preparing = createActivity({ activityId: 'a1', now: T0 })
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
		// Rendered as a zero of the right shape, not a dash — the null is still
		// what the maths returns, and only the label is a number.
		expect(formatPace(null)).toBe('0:00')
	})

	it('converts between speed and pace', () => {
		// 1 m/s is a kilometre every 1000 s — 16:40.
		expect(formatPace(speedToPace(1))).toBe('16:40 /km')
		expect(speedToPace(0)).toBeNull()
	})
})

describe('movement state machine', () => {
	/** Regression: drift banked distance when steps overruled a speed of 0, or with no speed at all. */
	it('does not let the pedometer overrule a reported speed of zero', () => {
		expect(isMovement({ legM: 4, elapsedMs: 2000, stepping: true, platformSpeedMs: 0 })).toBe(false)
		// A slow shuffle the receiver does see is still movement.
		expect(isMovement({ legM: 4, elapsedMs: 2000, stepping: true, platformSpeedMs: 0.3 })).toBe(true)
	})

	it('treats a speed-less leg as drift when the pedometer says nobody is walking', () => {
		expect(isMovement({ legM: 8, elapsedMs: 4000, stepping: false, platformSpeedMs: null })).toBe(false)
		expect(isMovement({ legM: 8, elapsedMs: 4000, stepping: false, platformSpeedMs: -1 })).toBe(false)
		// No pedometer at all: the leg is all there is, as before.
		expect(isMovement({ legM: 8, elapsedMs: 4000, platformSpeedMs: null })).toBe(true)
	})

	/**
	 * Regression: the blackout test measured from the last ACCEPTED fix, so a
	 * wait over a minute — fixes still arriving, rejected as jitter — zeroed the
	 * first leg after it and split the route.
	 */
	it('treats a long wait with fixes still arriving as a stop, not a blackout', () => {
		const withSpeed = (northM: number, seconds: number, speed: number) => ({ ...fix(northM, seconds, 4), speed })
		let state = started()
		let north = 0
		let t = 0
		for (let round = 0; round < 5; round++) {
			for (let i = 0; i < 30; i++) state = walk(state, [withSpeed((north += 3.5), (t += 1), 3.5)])
			// 90 s at a crossing: a fix every 2 s, 1 m of wander, Doppler says still.
			for (let i = 0; i < 45; i++) state = walk(state, [withSpeed(north + (i % 2), (t += 2), 0)])
		}

		expect(state.segments).toHaveLength(1)
		expect(state.distanceMeters).toBeGreaterThan(0.95 * 5 * 30 * 3.5)
	})

	/**
	 * Regression: the resume window was measured from the PREVIOUS moving fix, so
	 * with fixes a second apart it never filled and a walker who set off promptly
	 * after a stop banked nothing for minutes.
	 */
	it('resumes from stopped under dense fixes and banks the run', () => {
		// 3.5 m/s clears the 3 m minimum leg on every one-second fix, so every fix is
		// an accepted moving leg — the case the old window could never fill.
		const pace = 3.5
		const withSpeed = (northM: number, seconds: number, speed: number) => ({ ...fix(northM, seconds, 4), speed })
		let state = started()
		for (let s = 0; s <= 60; s++) state = walk(state, [withSpeed(s * pace, s, pace)])
		const stopAt = 60 * pace
		let s = 61
		while (state.movement !== 'stopped' && s < 200) {
			state = walk(state, [withSpeed(stopAt, s, 0)])
			s++
		}
		expect(state.movement).toBe('stopped')
		const before = state.distanceMeters
		// Off again straight away: five minutes, one fix a second.
		for (let t = 1; t <= 300; t++) state = walk(state, [withSpeed(stopAt + t * pace, s + t, pace)])

		expect(state.movement).toBe('moving')
		expect(state.distanceMeters - before).toBeGreaterThan(0.95 * 300 * pace)
	})

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

describe('what the activity turned out to be', () => {
	/**
	 * Nobody declares walk or run up front. Each LEG is judged by its own speed,
	 * and the label is written at the finish — which is the only way an outing
	 * that did both gets described honestly.
	 */
	const runLeg = (index: number) => fix(index * 30, index * 10)
	const walkLeg = (index: number) => fix(index * 10, index * 10)

	it('calls a steady stroll a walk', () => {
		const state = finishActivity(walk(started(), [0, 1, 2, 3, 4].map(walkLeg)), at(50))

		expect(state.type).toBe('walk')
		expect(state.runningMeters).toBe(0)
	})

	it('calls a steady 3 m/s effort a run', () => {
		const state = finishActivity(walk(started(), [0, 1, 2, 3, 4].map(runLeg)), at(50))

		expect(state.type).toBe('run')
		expect(state.walkingMeters).toBe(0)
	})

	// A warm-up walk, a run, and a walk home: one outing, and neither label
	// on its own is true of it.
	it('calls a walk-run-walk mixed', () => {
		let state = walk(started(), [fix(0, 0), fix(10, 10), fix(20, 20)])
		state = walk(state, [fix(50, 30), fix(80, 40), fix(110, 50)])
		state = walk(state, [fix(120, 60), fix(130, 70)])
		state = finishActivity(state, at(75))

		expect(state.type).toBe('mixed')
		expect(state.walkingMeters).toBeGreaterThan(0)
		expect(state.runningMeters).toBeGreaterThan(0)
	})

	it('accepts a runner’s legs, which a walk ceiling would have thrown out', () => {
		// 3 m/s — impossible for a walker, ordinary for a runner. One ceiling
		// means it is simply movement.
		const state = walk(started(), [0, 1, 2].map(runLeg))

		expect(state.distanceMeters).toBeCloseTo(60, 0)
		expect(state.rawPoints.every((point) => point.isAccepted)).toBe(true)
	})

	it('splits the distance it counts, never more', () => {
		const state = finishActivity(walk(started(), [0, 1, 2, 3].map(walkLeg)), at(40))

		expect(state.walkingMeters + state.runningMeters).toBeCloseTo(state.distanceMeters, 5)
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

describe('elevation', () => {
	/** A segment of fixes at the given altitudes, one every ten seconds. */
	const climb = (altitudes: (number | null)[]) => [
		{
			id: 's1',
			startedAt: T0,
			points: altitudes.map((altitude, index) => ({
				...fix(index * 10, index * 10),
				altitude,
				isAccepted: true,
			})),
		},
	]

	it('sums the climbs, not the net change', () => {
		// Up 20, down 20, up 20: a loop that ends where it started still climbed.
		expect(elevationGain(climb([100, 110, 120, 110, 100, 110, 120]))).toBe(40)
	})

	// GPS altitude wanders by metres while standing still. Summing every rise
	// would report a hillside for a walk along a flat seafront.
	it('ignores noise below the threshold', () => {
		expect(elevationGain(climb([100, 102, 100, 101, 100, 102, 100]))).toBe(0)
	})

	/**
	 * What the threshold does NOT do, stated so nobody is surprised by it.
	 *
	 * The reference follows every dip, so noise that wanders DOWN and then back
	 * up by more than the threshold banks the difference — 98 to 102 is a real
	 * four-metre climb as far as this can tell. A tighter rule would need the
	 * altitudes smoothed first, which is a barometer's job rather than a
	 * filter's.
	 */
	it('banks a rise that clears the threshold from the lowest point', () => {
		expect(elevationGain(climb([100, 102, 99, 101, 98, 100, 102]))).toBe(4)
	})

	it('measures the next climb from the bottom of the dip', () => {
		expect(elevationGain(climb([100, 90, 100]))).toBe(10)
	})

	it('says nothing when the device reported no altitude', () => {
		expect(elevationGain(climb([null, null, null]))).toBeNull()
		// No altitude at all is unknown, not flat.
		expect(formatElevation(null)).toBe('—')
		expect(formatElevation(0)).toBe('0 m')
		expect(formatElevation(120)).toBe('120 m')
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

describe('the noise floor', () => {
	/**
	 * The rule that stops a walk gaining distance it never went.
	 *
	 * A four-metre step is a step when the receiver says ±5 m, and is very likely
	 * the same spot measured twice when it says ±30 m. The floor scales with what
	 * the fix admits to, capped so it can never shut on a real walk.
	 */
	it('asks for a longer leg the less the fix is trusted', () => {
		const { minLegM, accuracyLegFactor, accuracyLegMaxM } = TRACKING_CONFIG.distance

		// A good fix lands within half a metre of the flat floor it always had.
		expect(minimumLegM(5)).toBeCloseTo(5 * accuracyLegFactor, 5)
		expect(minimumLegM(5)).toBeLessThan(minLegM + 1)
		expect(minimumLegM(20)).toBeCloseTo(20 * accuracyLegFactor, 5)
		// Capped, so even the vaguest fix the accuracy gate allows keeps counting.
		expect(minimumLegM(40)).toBe(accuracyLegMaxM)
	})

	// Android omits accuracy, and a missing number is not a bad one.
	it('falls back to the flat minimum when the fix says nothing', () => {
		expect(minimumLegM(null)).toBe(TRACKING_CONFIG.distance.minLegM)
		expect(minimumLegM(undefined)).toBe(TRACKING_CONFIG.distance.minLegM)
	})

	/** Steps halve the floor — they are evidence of walking, not of where. */
	it('softens the floor when the pedometer is counting, never removes it', () => {
		expect(minimumLegM(30, true)).toBeLessThan(minimumLegM(30))
		expect(minimumLegM(5, true)).toBe(TRACKING_CONFIG.distance.minLegM)
	})

	/**
	 * The case the whole rule is for: standing about with a poor fix, wandering a
	 * few metres between readings. Every one of these legs would have counted
	 * against a flat three-metre floor.
	 */
	it('does not bank drift measured at a poor accuracy', () => {
		const drift = Array.from({ length: 12 }, (_, index) => fix(index % 2 === 0 ? 0 : 6, index * 3, 32))

		expect(walk(started(), drift).distanceMeters).toBe(0)
	})

	/** And the walk it must not break: real legs at a good accuracy. */
	it('still counts real legs at a good accuracy', () => {
		const state = walk(started(), [fix(0, 0, 5), fix(4, 4, 5), fix(8, 8, 5), fix(12, 12, 5)])

		expect(state.distanceMeters).toBeCloseTo(12, 0)
	})
})

describe('smoothing', () => {
	/**
	 * The split that makes smoothing safe: the DRAWN route is smoothed, the
	 * distance is not. A filter that shortens a leg would quietly shorten the
	 * walk, so every figure is still measured between the fixes as they came.
	 */
	it('leaves distance measured on the raw fixes', () => {
		const state = walk(started(), [fix(0, 0), fix(6, 3), fix(12, 6), fix(18, 9)])

		expect(state.distanceMeters).toBeCloseTo(18, 0)
	})

	it('never edits what the receiver actually reported', () => {
		const sent = [fix(0, 0), fix(6, 3), fix(12, 6)]
		const state = walk(started(), sent)

		state.rawPoints.forEach((point, index) => {
			expect(point.latitude).toBe(sent[index].latitude)
			expect(point.longitude).toBe(sent[index].longitude)
			expect(point.horizontalAccuracy).toBe(sent[index].horizontalAccuracy)
		})
	})

	/**
	 * A straight walk measured badly — every other fix thrown four metres to the
	 * side. The line drawn from it has to be straighter than the fixes were.
	 */
	it('draws a straighter line than the receiver gave it', () => {
		const east = 4 / (M_PER_DEG * Math.cos((14.6 * Math.PI) / 180))
		const wobble = Array.from({ length: 14 }, (_, index) => {
			const point = fix(index * 6, index * 3, 8)

			return index % 2 === 0 ? point : { ...point, longitude: point.longitude + east }
		})

		const drawn = toWalkPoints(walk(started(), wobble))
		const spread = Math.max(...drawn.map((point) => point.lon)) - Math.min(...drawn.map((point) => point.lon))

		expect(drawn.length).toBeGreaterThan(2)
		expect(spread).toBeLessThan(east)
	})

	/**
	 * The estimate is a blend of two real readings, never an extrapolation, so a
	 * drawn route cannot leave the ground the raw one covered.
	 */
	it('keeps every drawn point inside the ground the fixes covered', () => {
		const sent = [fix(0, 0), fix(10, 5), fix(4, 10), fix(20, 15), fix(14, 20)]
		const north = sent.map((point) => point.latitude)

		for (const point of toWalkPoints(walk(started(), sent))) {
			expect(point.lat).toBeGreaterThanOrEqual(Math.min(...north) - 1e-9)
			expect(point.lat).toBeLessThanOrEqual(Math.max(...north) + 1e-9)
		}
	})

	/**
	 * THE LAG, which is what "the route is drawn but it is not accurate" was.
	 *
	 * A position-only filter predicts that you have not moved and charges the
	 * walking itself to noise, so its correction is permanently behind the walker
	 * — at the numbers this shipped with, about eight metres at ±10 m fixes once a
	 * second. Straight roads hide it and corners do not: the line rounds the turn
	 * off and rejoins the street half a block late.
	 *
	 * Fed a perfectly clean walk there is nothing to smooth, so the drawn line has
	 * no excuse to be anywhere but on top of the fixes.
	 */
	it('keeps up with a steady walk instead of trailing it', () => {
		// 1.4 m/s — an ordinary walking pace — sampled once a second.
		const steady = Array.from({ length: 40 }, (_, index) => fix(index * 1.4, index, 10))
		const drawn = toWalkPoints(walk(started(), steady))
		const last = drawn[drawn.length - 1]
		/**
		 * Compared against the fix it was DRAWN FROM, not the last one sent.
		 *
		 * At ±10 m the noise floor asks for a seven-metre leg, so a 1.4 m/s walk
		 * joins the route every fifth fix — which is the filter working correctly
		 * and would otherwise be measured here as five seconds of "lag".
		 */
		const truth = steady.find((point) => point.timestamp === last.at)!
		const lagM = Math.abs(truth.latitude - last.lat) * M_PER_DEG

		expect(lagM).toBeLessThan(2)
	})

	/**
	 * And it still may not run AHEAD of the evidence.
	 *
	 * The one thing a velocity model can do that a position-only one cannot is
	 * predict past the newest reading. A walker who stops dead must not have a
	 * line drawn on down the street they were about to take.
	 */
	it('never draws past the newest fix when a walker stops', () => {
		const approach = Array.from({ length: 20 }, (_, index) => fix(index * 1.4, index, 10))
		// Then twenty seconds standing still at the same spot.
		const halt = Array.from({ length: 20 }, (_, index) => fix(19 * 1.4, 20 + index, 10))
		const drawn = toWalkPoints(walk(started(), [...approach, ...halt]))
		const furthestNorth = Math.max(...drawn.map((point) => point.lat))

		expect(furthestNorth).toBeLessThanOrEqual(fix(19 * 1.4, 0).latitude + 1e-9)
	})

	/** A break in tracking restarts the estimate rather than dragging it across. */
	it('does not pull the far side of a gap back toward the near one', () => {
		let state = walk(started(), [fix(0, 0), fix(8, 4), fix(16, 8)])
		// Far enough to break the segment, slow enough to be a person rather than
		// a receiver jumping.
		state = walk(state, [fix(900, 300)])

		const drawn = toWalkPoints(state)
		const last = drawn[drawn.length - 1]

		expect((last.lat - fix(900, 300).latitude) * M_PER_DEG).toBeCloseTo(0, 0)
	})
})

describe('noisy receiver', () => {
	/** Seeded, so a failure reproduces. Wander is correlated, as real GPS error is. */
	function noisyWalk(speedMs: number, seconds: number, seed: number) {
		let s = seed
		const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
		const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
		const keep = Math.exp(-1 / 30)
		const step = 5 * Math.sqrt(1 - keep * keep)
		let northErrorM = 0
		let eastErrorM = 0
		let state = started()

		for (let t = 0; t <= seconds; t++) {
			northErrorM = keep * northErrorM + step * gauss()
			eastErrorM = keep * eastErrorM + step * gauss()
			const base = fix(speedMs * t + northErrorM + 2 * gauss(), t, 10)
			const sample = {
				...base,
				longitude: base.longitude + (eastErrorM + 2 * gauss()) / (M_PER_DEG * Math.cos((14.6 * Math.PI) / 180)),
				speed: Math.max(0, speedMs + 0.2 * gauss()),
			}
			state = processLocation(state, sample, { now: sample.timestamp }).state
		}

		return state.distanceMeters
	}

	// Raw legs read this walk 20–40% long; the smoothed estimate should not.
	it('does not count the wander as distance on a walk', () => {
		for (const seed of [1, 2, 3]) {
			expect(noisyWalk(1.4, 600, seed)).toBeLessThan(840 * 1.15)
			expect(noisyWalk(1.4, 600, seed)).toBeGreaterThan(840 * 0.95)
		}
	})

	// Raw legs banked hundreds of metres here. Doppler speed says nobody moved.
	it('banks almost nothing standing still for ten minutes', () => {
		for (const seed of [1, 2, 3]) {
			expect(noisyWalk(0, 600, seed)).toBeLessThan(50)
		}
	})
})

describe('walk record', () => {
	it('stores a thinned route but the full distance, and carries linked habits', () => {
		let state = started()
		for (let s = 0; s <= 100; s++) state = walk(state, [Object.assign(fix(s * 1.5, s), { speed: 1.5 })])
		const record = toWalkRecordFromActivity(finishActivity(state, at(101)), ['h1'])!

		// A straight line needs only its ends; the distance is the tracker's, untouched.
		expect(record.route.length).toBeLessThan(5)
		expect(record.distanceM).toBe(state.distanceMeters)
		expect(record.habitIds).toEqual(['h1'])
	})
})
