/**
 * Crash recovery through the controller — the part the pure engine tests cannot
 * reach. Storage is an in-memory stand-in; the device sources are inert.
 */
import type { ActivityTrackingState } from '../types'
import type { PendingFix } from '../storage'
import { beginTracking, createActivity, pauseActivity, processLocation, finishActivity } from '../tracker'

let mockStored: ActivityTrackingState | null = null
let mockQueue: PendingFix[] = []

jest.mock('../storage', () => ({
	saveActivity: jest.fn(async (state: ActivityTrackingState) => {
		mockStored = state
	}),
	loadActivity: jest.fn(async () => mockStored),
	clearActivity: jest.fn(async () => {
		mockStored = null
	}),
	clearQueue: jest.fn(async () => {
		mockQueue = []
	}),
	drainFixes: jest.fn(async () => {
		const taken = mockQueue
		mockQueue = []
		return taken
	}),
}))
jest.mock('../backgroundLocation', () => ({
	currentFix: jest.fn(async () => null),
	lastKnownFix: jest.fn(async () => null),
	setLiveFixSink: jest.fn(),
	setSamplingProfile: jest.fn(),
	startTracking: jest.fn(async () => ({ ok: true, background: true })),
	stopTracking: jest.fn(async () => undefined),
	watchForeground: jest.fn(async () => ({ stop: () => undefined })),
}))
jest.mock('../liveNotification', () => ({
	clearRecordingNote: jest.fn(async () => undefined),
	primeRecordingNote: jest.fn(async () => undefined),
	showRecordingNote: jest.fn(async () => undefined),
}))
jest.mock('@/lib/walkTracking', () => ({
	createWalkId: () => 'walk-test',
	watchSteps: jest.fn(async () => null),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { activityTracker } = require('../controller') as typeof import('../controller')

const M = 111_320 // metres per degree of latitude
const T0 = Date.now() - 600_000
const fix = (metres: number, seconds: number): PendingFix => ({
	latitude: 14.6 + metres / M,
	longitude: 120.98,
	horizontalAccuracy: 5,
	speed: 1.4,
	timestamp: T0 + seconds * 1000,
})

/** One minute of walking at 1.4 m/s, recorded before the "crash". */
function walkedMinute(): ActivityTrackingState {
	let state = beginTracking(createActivity({ activityId: 'a', now: T0 }), T0)
	for (let s = 0; s <= 60; s++) {
		state = processLocation(state, fix(s * 1.4, s), { now: T0 + s * 1000 }).state
	}
	return state
}

afterEach(async () => {
	await activityTracker.discard()
	mockStored = null
	mockQueue = []
})

describe('controller recovery', () => {
	it('adopts a finished-but-unsaved walk instead of letting a new one overwrite it', async () => {
		mockStored = finishActivity(walkedMinute(), T0 + 61_000)

		const recovered = await activityTracker.recover()

		expect(recovered?.status).toBe('finished')
		// Held in memory, so the screen shows its summary rather than auto-starting.
		expect(activityTracker.getState()?.activityId).toBe('a')
	})

	it('banks the crash-time queue even when a live fix arrives before "Keep it"', async () => {
		mockStored = walkedMinute()
		// ~460 m walked while the app was dead, collected by the background task.
		mockQueue = Array.from({ length: 330 }, (_, i) => fix((61 + i) * 1.4, 61 + i))

		await activityTracker.recover()
		const afterRecover = activityTracker.getState()!.distanceMeters
		// The foreground watch is already open behind the prompt.
		activityTracker.onFix(fix(400 * 1.4, 400))
		await activityTracker.continueRecovered()

		expect(afterRecover - mockStored!.distanceMeters).toBeGreaterThanOrEqual(0)
		expect(activityTracker.getState()!.distanceMeters).toBeGreaterThan(walkedMinute().distanceMeters + 400)
	})

	it('keeps a manually paused walk paused after recovery', async () => {
		mockStored = pauseActivity(walkedMinute(), T0 + 61_000)

		await activityTracker.recover()
		await activityTracker.continueRecovered()

		expect(activityTracker.getState()?.status).toBe('paused')
	})
})
