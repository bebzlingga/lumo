import { challengeNudge, NUDGE_COOLDOWN_MS, shouldNudge } from '../nudges'
import type { ChallengeProgress } from '../activeChallenge'
import { findVariant } from '../challengeDefs'

function progress(over: Partial<ChallengeProgress> = {}): ChallengeProgress {
	const variant = findVariant('10k-timed')!

	return {
		challenge: {
			id: 'c1',
			variantId: variant.id,
			startedAt: '2026-08-10T00:00:00.000Z',
			endsAt: '2026-08-17T00:00:00.000Z',
			status: 'active',
			completedAt: null,
			pausesUsed: 0,
			participants: [],
			ownerId: null,
		},
		variant,
		currentM: 8000,
		targetM: 10_000,
		ratio: 0.8,
		remainingM: 2000,
		daysLeft: 4,
		complete: false,
		expired: false,
		teamM: 0,
		teamDone: 0,
		teamSize: 0,
		...over,
	}
}

describe('move nudges', () => {
	it('says nothing without a challenge, or once it is over', () => {
		expect(challengeNudge(null)).toBeNull()
		expect(challengeNudge(progress({ complete: true }))).toBeNull()
		expect(challengeNudge(progress({ expired: true }))).toBeNull()
	})

	// A nudge at 40% is not encouragement, it is a reminder that most of it is
	// still left.
	it('waits until three quarters of the way', () => {
		expect(challengeNudge(progress({ ratio: 0.4, remainingM: 6000 }))).toBeNull()
		expect(challengeNudge(progress())?.body).toContain('2 km')
	})

	// The only case where staying quiet actually costs the person something, so
	// it outranks being nearly there.
	it('leads with the clock on the last day, however far along you are', () => {
		const nudge = challengeNudge(progress({ ratio: 0.2, remainingM: 8000, daysLeft: 1 }))

		expect(nudge?.title).toBe('Last day')
		expect(nudge?.body).toContain('8 km')
	})

	it('has no clock to warn about on an open-ended challenge', () => {
		expect(challengeNudge(progress({ daysLeft: null }))?.title).toBe('Almost there')
	})

	// The group cannot walk for you, and you cannot walk for them — so being
	// done yourself is a different message.
	it('says something different when you are done and the others are not', () => {
		const team = findVariant('10k-team')!
		const nudge = challengeNudge(
			progress({ variant: team, currentM: 10_000, ratio: 1, remainingM: 0, teamDone: 1, teamSize: 3, daysLeft: 3 })
		)

		expect(nudge?.title).toBe('Waiting on the others')
		expect(nudge?.body).toContain('1 of 3')
	})

	describe('whether it may speak at all', () => {
		const base = { notificationsEnabled: true, lastNudgeAt: null, now: 1_000_000_000, hour: 14 }

		it('respects the notification setting above everything', () => {
			expect(shouldNudge({ ...base, notificationsEnabled: false })).toBe(false)
		})

		it('stays quiet early and late', () => {
			expect(shouldNudge({ ...base, hour: 6 })).toBe(false)
			expect(shouldNudge({ ...base, hour: 22 })).toBe(false)
			expect(shouldNudge({ ...base, hour: 9 })).toBe(true)
		})

		it('never speaks twice inside the cooldown', () => {
			expect(shouldNudge({ ...base, lastNudgeAt: base.now - 60_000 })).toBe(false)
			expect(shouldNudge({ ...base, lastNudgeAt: base.now - NUDGE_COOLDOWN_MS })).toBe(true)
		})
	})
})
