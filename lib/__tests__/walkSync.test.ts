import {
	BATCH_SIZE,
	backoffMs,
	dueJobs,
	emptyWalkQueue,
	normalizeWalkQueue,
	routeBatches,
	walkRow,
	withFailure,
	withJob,
	withoutJob,
	type WalkQueue,
} from '../walkSync'
import type { WalkPoint, WalkRecord } from '../walk'

/**
 * The queue's decision-making, tested without a network or a clock.
 *
 * Every function here takes `now` as a parameter — the house rule — so this
 * suite needs no fake timers. `drainWalkQueue` itself is deliberately not
 * covered: it is the thin layer that calls Supabase, and everything it decides
 * before it does so lives in the functions below.
 */
const T0 = 1_700_000_000_000
const SECOND = 1000

function job(walkId: string, overrides: Partial<WalkQueue['jobs'][number]> = {}) {
	return { walkId, attempts: 0, nextAttemptAt: 0, batchesDone: 0, ...overrides }
}

function point(index: number): WalkPoint {
	return { lat: 14.6 + index / 100_000, lon: 120.98, at: T0 + index * 3000, accuracy: 8 }
}

function record(overrides: Partial<WalkRecord> = {}): WalkRecord {
	return {
		id: 'walk-1',
		startedAt: T0,
		endedAt: T0 + 30 * 60 * SECOND,
		activeMs: 30 * 60 * SECOND,
		distanceM: 2400,
		vehicleM: 0,
		steps: 3100,
		route: [point(0), point(1)],
		habitIds: ['habit-1'],
		synced: false,
		...overrides,
	}
}

describe('walk sync queue', () => {
	describe('backoff', () => {
		it('doubles from ten seconds', () => {
			expect(backoffMs(0)).toBe(10 * SECOND)
			expect(backoffMs(1)).toBe(20 * SECOND)
			expect(backoffMs(2)).toBe(40 * SECOND)
		})

		// Capped rather than unbounded: the common failure is "no signal", and a
		// queue that has backed off to six hours would sit idle through the
		// whole evening the connection came back.
		it('caps at an hour however many attempts have failed', () => {
			expect(backoffMs(20)).toBe(60 * 60 * SECOND)
			expect(backoffMs(500)).toBe(60 * 60 * SECOND)
		})

		it('treats a negative attempt count as the first', () => {
			expect(backoffMs(-3)).toBe(10 * SECOND)
		})
	})

	describe('queue shape', () => {
		it('holds one job per walk, and re-queuing resets the backoff', () => {
			const queued = withJob({ jobs: [job('walk-1', { attempts: 4, nextAttemptAt: T0 + 10_000 })] }, 'walk-1')

			expect(queued.jobs).toHaveLength(1)
			expect(queued.jobs[0]).toEqual(job('walk-1'))
		})

		it('records a failure by advancing attempts and pushing the next try out', () => {
			const failed = withFailure({ jobs: [job('walk-1')] }, 'walk-1', T0)

			expect(failed.jobs[0].attempts).toBe(1)
			expect(failed.jobs[0].nextAttemptAt).toBe(T0 + 10 * SECOND)
		})

		// A half-uploaded route resumes rather than restarting — and because the
		// route batches are keyed `(walk_id, seq)`, re-sending the last one is a
		// no-op upsert rather than a duplicate.
		it('remembers how much of a route landed before the failure', () => {
			const failed = withFailure({ jobs: [job('walk-1')] }, 'walk-1', T0, 3)

			expect(failed.jobs[0].batchesDone).toBe(3)
		})

		it('keeps the batch count when a failure does not report one', () => {
			const failed = withFailure({ jobs: [job('walk-1', { batchesDone: 2 })] }, 'walk-1', T0)

			expect(failed.jobs[0].batchesDone).toBe(2)
		})

		it('leaves other walks alone', () => {
			const failed = withFailure({ jobs: [job('walk-1'), job('walk-2')] }, 'walk-1', T0)

			expect(failed.jobs[1]).toEqual(job('walk-2'))
		})

		it('drops a job by id', () => {
			expect(withoutJob({ jobs: [job('walk-1'), job('walk-2')] }, 'walk-1').jobs).toEqual([job('walk-2')])
		})

		it('runs only what is due', () => {
			const queue = { jobs: [job('walk-1'), job('walk-2', { nextAttemptAt: T0 + 60 * SECOND })] }

			expect(dueJobs(queue, T0).map((entry) => entry.walkId)).toEqual(['walk-1'])
			expect(dueJobs(queue, T0 + 60 * SECOND).map((entry) => entry.walkId)).toEqual(['walk-1', 'walk-2'])
		})
	})

	describe('route batching', () => {
		it('splits a long route into whole batches', () => {
			const route = Array.from({ length: BATCH_SIZE * 2 + 7 }, (_, index) => point(index))
			const batches = routeBatches(route)

			expect(batches).toHaveLength(3)
			expect(batches[0]).toHaveLength(BATCH_SIZE)
			expect(batches[2]).toHaveLength(7)
		})

		// Rejoining the batches has to give back exactly the route, in order —
		// the server stores them by `seq` and reads them back the same way.
		it('loses nothing and reorders nothing', () => {
			const route = Array.from({ length: 250 }, (_, index) => point(index))

			expect(routeBatches(route).flat()).toEqual(route)
		})

		it('makes no batches from an empty route', () => {
			expect(routeBatches([])).toEqual([])
		})
	})

	describe('the row a walk becomes', () => {
		it('stamps updated_at from the passed instant rather than reading a clock', () => {
			expect(walkRow(record(), 'user-1', T0).updated_at).toBe(new Date(T0).toISOString())
		})

		it('sends instants as ISO strings and keeps the client id', () => {
			const row = walkRow(record(), 'user-1', T0)

			expect(row.id).toBe('walk-1')
			expect(row.user_id).toBe('user-1')
			expect(row.started_at).toBe(new Date(T0).toISOString())
		})

		// The distinction the whole feature rests on: no pedometer is null, not
		// zero. A nullable column exists for exactly this.
		it('keeps a missing step count as null rather than zero', () => {
			expect(walkRow(record({ steps: null }), 'user-1', T0).steps).toBeNull()
			expect(walkRow(record({ steps: 0 }), 'user-1', T0).steps).toBe(0)
		})

		// The two distances stay separate all the way to the server: milestones
		// are measured from `distance_m` alone, and `vehicle_m` is only ever
		// reported.
		it('keeps vehicle distance out of the counted distance', () => {
			const row = walkRow(record({ distanceM: 900, vehicleM: 24_000 }), 'user-1', T0)

			expect(row.distance_m).toBe(900)
			expect(row.vehicle_m).toBe(24_000)
		})

		it('sends an absent mood and note as null', () => {
			const row = walkRow(record(), 'user-1', T0)

			expect(row.mood).toBeNull()
			expect(row.note).toBeNull()
		})
	})

	describe('reading the queue back from storage', () => {
		it('round-trips', () => {
			const queue = { jobs: [job('walk-1', { attempts: 2, nextAttemptAt: T0, batchesDone: 1 })] }

			expect(normalizeWalkQueue(JSON.parse(JSON.stringify(queue)))).toEqual(queue)
		})

		it('falls back to empty on junk', () => {
			expect(normalizeWalkQueue(null)).toEqual(emptyWalkQueue)
			expect(normalizeWalkQueue('queue')).toEqual(emptyWalkQueue)
			expect(normalizeWalkQueue({ jobs: 'nope' })).toEqual(emptyWalkQueue)
		})

		it('drops jobs with no walk to point at', () => {
			expect(normalizeWalkQueue({ jobs: [{ attempts: 1 }, job('walk-1'), { walkId: '' }] }).jobs).toEqual([job('walk-1')])
		})

		// A duplicate would double every request for that walk, and the second
		// copy's counters would fight the first's.
		it('keeps one job per walk', () => {
			const queue = normalizeWalkQueue({ jobs: [job('walk-1'), job('walk-1', { attempts: 9 })] })

			expect(queue.jobs).toHaveLength(1)
			expect(queue.jobs[0].attempts).toBe(0)
		})

		it('repairs missing counters rather than dropping the job', () => {
			expect(normalizeWalkQueue({ jobs: [{ walkId: 'walk-1' }] }).jobs).toEqual([job('walk-1')])
			expect(normalizeWalkQueue({ jobs: [{ walkId: 'walk-1', attempts: -5 }] }).jobs[0].attempts).toBe(0)
		})
	})
})
