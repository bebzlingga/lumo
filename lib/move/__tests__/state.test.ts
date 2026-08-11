import { emptyMoveState, normalizeMoveState, syncRange, trimSummaries, INITIAL_SYNC_DAYS } from '../state'
import type { MovementSummary } from '../types'

/**
 * The sync window, and reading state back from storage.
 *
 * `syncMovement` itself is not covered here — it is the thin layer that calls
 * the provider, and everything it DECIDES (which range, how to fold, what to
 * trim) lives in the functions below and in `movement.ts`.
 */
function day(date: string): MovementSummary {
	return { date, steps: 100, distanceMeters: 100, activeMinutes: 1 }
}

describe('move store', () => {
	describe('sync range', () => {
		it('reaches back a month on the very first sync', () => {
			const range = syncRange(emptyMoveState, '2026-08-10')

			expect(range.end).toBe('2026-08-10')
			expect(range.start).toBe('2026-07-12')
		})

		// Incremental afterwards — §38. The overlap is not belt-and-braces: a watch
		// syncs hours late and a phone left at home backfills the next morning, so
		// the last couple of days are always re-read.
		it('re-reads a two-day overlap afterwards', () => {
			const range = syncRange({ ...emptyMoveState, lastSyncedDate: '2026-08-09' }, '2026-08-10')

			expect(range).toEqual({ start: '2026-08-07', end: '2026-08-10' })
		})

		it('asks for a whole month, not a day more', () => {
			const range = syncRange(emptyMoveState, '2026-08-10')
			const days = (new Date(`${range.end}T12:00:00`).getTime() - new Date(`${range.start}T12:00:00`).getTime()) / 86_400_000

			expect(days + 1).toBe(INITIAL_SYNC_DAYS)
		})

		// A clock that has gone backwards — travel, or a manual change — must not
		// produce an inverted range that silently reads as nothing.
		it('never inverts when the last sync is in the future', () => {
			const range = syncRange({ ...emptyMoveState, lastSyncedDate: '2026-09-01' }, '2026-08-10')

			expect(range.start <= range.end).toBe(true)
			expect(range.end).toBe('2026-08-10')
		})
	})

	describe('trimming the cache', () => {
		// Safe to drop old days BECAUSE the cumulative ledger is separate: this
		// loses the daily detail, never the total it contributed to.
		it('keeps a year and drops what is older', () => {
			const summaries = [day('2024-01-01'), day('2026-08-01'), day('2026-08-10')]
			const trimmed = trimSummaries(summaries, '2026-08-10')

			expect(trimmed.map((entry) => entry.date)).toEqual(['2026-08-01', '2026-08-10'])
		})
	})

	describe('reading state back', () => {
		it('round-trips', () => {
			const state = {
				...emptyMoveState,
				onboarded: true,
				summaries: [day('2026-08-10')],
				totals: { distanceMeters: 5000, steps: 100, activeMinutes: 10, countedDays: ['2026-08-09'] },
				lastSyncedDate: '2026-08-10',
			}

			expect(normalizeMoveState(JSON.parse(JSON.stringify(state)))).toEqual(state)
		})

		it('falls back to empty on junk', () => {
			expect(normalizeMoveState(null)).toEqual(emptyMoveState)
			expect(normalizeMoveState('move')).toEqual(emptyMoveState)
			expect(normalizeMoveState({})).toEqual(emptyMoveState)
		})

		// Repaired rather than reset: losing the ledger would take someone's
		// badges with it.
		it('repairs a damaged ledger rather than discarding it', () => {
			const state = normalizeMoveState({ totals: { distanceMeters: 34_200, countedDays: null } })

			expect(state.totals.distanceMeters).toBe(34_200)
			expect(state.totals.countedDays).toEqual([])
		})

		it('drops malformed summaries', () => {
			const state = normalizeMoveState({ summaries: [{ date: '2026-08-10', steps: 5 }, { steps: 9 }] })

			expect(state.summaries).toHaveLength(1)
		})

		// A goal was a recurring target with no milestone and no fixed distance,
		// so there is no honest challenge to turn one into. Dropping them is the
		// only truthful migration — and the data that matters survives.
		it('drops goals from the old system without touching movement history', () => {
			const state = normalizeMoveState({
				goals: [{ id: 'a', target: 3000 }],
				summaries: [{ date: '2026-08-10', steps: 500, distanceMeters: 900, activeMinutes: 5 }],
				totals: { distanceMeters: 34_200, steps: 40_000, activeMinutes: 300, countedDays: ['2026-08-09'] },
			})

			expect(state.active).toBeNull()
			expect(state.summaries).toHaveLength(1)
			expect(state.totals.distanceMeters).toBe(34_200)
		})

		// Taking a badge back because the rules changed underneath someone would
		// be the worst thing this migration could do.
		it('carries badges from the old cumulative system across', () => {
			const state = normalizeMoveState({
				milestonesUnlockedAt: { '1k': '2026-01-02T00:00:00.000Z', '5k': '2026-02-02T00:00:00.000Z' },
			})

			expect(state.achievements.map((entry) => entry.milestoneId).sort()).toEqual(['1k', '5k'])
			expect(state.achievements[0].completionType).toBe('solo')
			expect(state.achievements[0].completedAt).toBe('2026-01-02T00:00:00.000Z')
		})

		it('never files a legacy badge twice when it has already been re-earned', () => {
			const state = normalizeMoveState({
				milestonesUnlockedAt: { '10k': '2026-01-02T00:00:00.000Z' },
				achievements: [
					{ milestoneId: '10k', variantId: '10k-team', completionType: 'team', completedAt: '2026-05-05T00:00:00.000Z', days: 6, withUserIds: ['a'] },
				],
			})

			expect(state.achievements).toHaveLength(1)
			expect(state.achievements[0].completionType).toBe('team')
		})

		it('sorts summaries however they were stored', () => {
			const state = normalizeMoveState({ summaries: [day('2026-08-10'), day('2026-08-01')] })

			expect(state.summaries.map((entry) => entry.date)).toEqual(['2026-08-01', '2026-08-10'])
		})
	})
})
