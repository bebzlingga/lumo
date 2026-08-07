import { badges, badgesByTier, currentBadge, earnedBadgeCount, habitBadges, nextBadge } from '../badges'

/**
 * Every assertion below is derived from `badges` rather than restating its
 * numbers. The suite used to hard-code the old ladder (3, 10, 15, 20, 30); when
 * the rungs were redrawn to 1, 3, 7, 14, 30, 60, 120, 360 the ladder was right
 * and five of these tests were simply out of date, which is a failing suite
 * that says nothing about the code. Written this way they hold whatever the
 * milestones are, and only break when the LOGIC does.
 */
const FIRST = badges[0].threshold
const SECOND = badges[1].threshold
const LAST = badges[badges.length - 1].threshold
/** A streak past the first rung but short of the second. */
const BETWEEN = SECOND - 1

describe('habitBadges', () => {
	it('marks a badge earned exactly at its threshold', () => {
		expect(habitBadges(FIRST)[0].earned).toBe(true)
	})

	it('leaves a badge locked one day short of it', () => {
		expect(habitBadges(FIRST - 1)[0].earned).toBe(false)
	})

	it('returns one entry per defined badge', () => {
		expect(habitBadges(0)).toHaveLength(badges.length)
	})
})

describe('earnedBadgeCount', () => {
	it('is 0 before the first milestone', () => {
		expect(earnedBadgeCount(FIRST - 1)).toBe(0)
	})

	it('counts every threshold crossed', () => {
		for (const streak of badges.map((badge) => badge.threshold)) {
			expect(earnedBadgeCount(streak)).toBe(badges.filter((badge) => badge.threshold <= streak).length)
		}
	})

	it('caps at the full badge list', () => {
		expect(earnedBadgeCount(LAST * 10)).toBe(badges.length)
	})
})

describe('nextBadge', () => {
	it('points at the first unearned milestone', () => {
		expect(nextBadge(0)?.threshold).toBe(FIRST)
		expect(nextBadge(FIRST)?.threshold).toBe(SECOND)
	})

	it('is null once every badge is earned', () => {
		expect(nextBadge(LAST)).toBeNull()
	})
})

describe('currentBadge', () => {
	it('falls back to the first (locked) badge when none are earned', () => {
		const badge = currentBadge(FIRST - 1)
		expect(badge.earned).toBe(false)
		expect(badge.threshold).toBe(FIRST)
	})

	it('returns the highest earned milestone', () => {
		const badge = currentBadge(LAST)
		expect(badge.earned).toBe(true)
		expect(badge.threshold).toBe(LAST)
	})

	it('does not skip ahead to an unearned milestone', () => {
		expect(currentBadge(BETWEEN).threshold).toBe(FIRST)
	})
})

describe('badgesByTier', () => {
	it('groups every badge into a tier without losing any', () => {
		const groups = badgesByTier(0)
		const total = groups.reduce((sum, group) => sum + group.badges.length, 0)
		expect(total).toBe(badges.length)
	})

	it('orders tiers bronze → diamond', () => {
		expect(badgesByTier(0).map((group) => group.key)).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond'])
	})
})
