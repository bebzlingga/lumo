import {
	TROPHY_MIN_MEMBERS,
	bestEarnedTrophy,
	challengeProgressFor,
	challengeTarget,
	countWonChallenges,
	earnedTrophyCount,
	groupScoreForXp,
	groupTrophies,
	groupXpFromCounts,
	productivityChallenges,
	trophyEarned,
	xpForHabitName,
	type GroupTrophy,
	type GroupTrophyMetrics,
} from '../groupChallenges'

const NO_TROPHY_METRICS: GroupTrophyMetrics = {
	members: 0,
	completions: 0,
	streak: 0,
	rollCallStreak: 0,
	challengesWon: 0,
}
/** Nothing done, but past the member floor — the baseline for testing a target. */
const PAIRED_METRICS: GroupTrophyMetrics = { ...NO_TROPHY_METRICS, members: TROPHY_MIN_MEMBERS }

describe('groupScoreForXp', () => {
	it('starts everyone at level 1 with zero XP', () => {
		const score = groupScoreForXp(0)
		expect(score.level).toBe(1)
		expect(score.floor).toBe(0)
		expect(score.into).toBe(0)
	})

	it('levels up exactly at the cumulative threshold', () => {
		// Curve is 50 * (level-1) * level  =>  L2 at 100, L3 at 300, L4 at 600.
		expect(groupScoreForXp(99).level).toBe(1)
		expect(groupScoreForXp(100).level).toBe(2)
		expect(groupScoreForXp(299).level).toBe(2)
		expect(groupScoreForXp(300).level).toBe(3)
		expect(groupScoreForXp(600).level).toBe(4)
	})

	it('reports progress within the current level', () => {
		// Level 2 spans 100..300, so 200 XP is halfway.
		const score = groupScoreForXp(200)
		expect(score.level).toBe(2)
		expect(score.floor).toBe(100)
		expect(score.ceiling).toBe(300)
		expect(score.into).toBe(100)
		expect(score.span).toBe(200)
		expect(score.progress).toBeCloseTo(0.5)
	})

	it('clamps negative and fractional XP', () => {
		expect(groupScoreForXp(-50).xp).toBe(0)
		expect(groupScoreForXp(-50).level).toBe(1)
		expect(groupScoreForXp(150.9).xp).toBe(150)
	})

	it('keeps levelling without an upper bound', () => {
		expect(groupScoreForXp(1_000_000).level).toBeGreaterThan(10)
	})
})

describe('groupXpFromCounts', () => {
	it('sums count × per-habit XP', () => {
		const habits = [
			{ id: 'a', name: 'Unknown habit' },
			{ id: 'b', name: 'Another unknown' },
		]
		// Both fall back to BASE_HABIT_XP (5): 2×5 + 3×5 = 25
		expect(groupXpFromCounts(habits, { a: 2, b: 3 })).toBe(25)
	})

	it('is 0 with no completions', () => {
		expect(groupXpFromCounts([{ id: 'a', name: 'x' }], {})).toBe(0)
	})

	it('uses the challenge XP rate for a known challenge name', () => {
		const known = xpForHabitName('Unknown habit name')
		expect(known).toBeGreaterThan(0)
	})
})

// The ten-level milestone ladder these tests covered is gone — the trophy shelf
// tests the same metrics, and `bestEarnedTrophy` is what the group page now reads
// for its rank.
describe('bestEarnedTrophy', () => {
	it('has no rank before anything is earned', () => {
		expect(bestEarnedTrophy(NO_TROPHY_METRICS)).toBeNull()
	})

	it('is the last trophy on the shelf for a maxed-out group', () => {
		const strong: GroupTrophyMetrics = {
			members: 50,
			completions: 5000,
			streak: 500,
			rollCallStreak: 500,
			challengesWon: 500,
		}
		expect(bestEarnedTrophy(strong)?.id).toBe(groupTrophies[groupTrophies.length - 1].id)
	})

	it('is the best of a partial shelf, not the newest metric', () => {
		// Bronze completions only: the shelf's first entry, whatever else is zero.
		const bronze: GroupTrophyMetrics = { ...PAIRED_METRICS, completions: 14 }
		expect(bestEarnedTrophy(bronze)?.tier).toBe('bronze')
	})
})

describe('challengeProgressFor', () => {
	// Use a real challenge rather than a hand-built object, so the test can't
	// drift from the actual ProductivityChallenge shape.
	const challenge = productivityChallenges[0]

	it('reports zero progress before anything is logged', () => {
		const progress = challengeProgressFor(challenge, 0)
		expect(progress.complete).toBe(false)
		expect(progress.pct).toBe(0)
		expect(progress.target).toBe(challengeTarget(challenge))
	})

	it('reports partial progress mid-way', () => {
		const target = challengeTarget(challenge)
		const progress = challengeProgressFor(challenge, 1)
		expect(progress.daysDone).toBe(1)
		expect(progress.complete).toBe(target <= 1)
		expect(progress.pct).toBeCloseTo(Math.min(1, 1 / target))
	})

	it('caps daysDone and pct once past the target', () => {
		const target = challengeTarget(challenge)
		const over = challengeProgressFor(challenge, target + 99)
		expect(over.daysDone).toBe(target)
		expect(over.complete).toBe(true)
		expect(over.pct).toBe(1)
	})
})

describe('trophies', () => {
	it('awards nothing to a brand-new group', () => {
		expect(earnedTrophyCount(NO_TROPHY_METRICS)).toBe(0)
	})

	it('awards a trophy once its metric reaches the target', () => {
		const trophy = groupTrophies[0]
		const metrics: GroupTrophyMetrics = { ...PAIRED_METRICS, [trophy.metric]: trophy.target }
		expect(trophyEarned(trophy, metrics)).toBe(true)
	})

	it('does not award below the target', () => {
		const trophy = groupTrophies[0]
		const metrics: GroupTrophyMetrics = { ...PAIRED_METRICS, [trophy.metric]: trophy.target - 1 }
		expect(trophyEarned(trophy, metrics)).toBe(false)
	})

	// A group of one can reach every non-member metric on its own — a month of
	// solo check-ins would otherwise unlock "Team Effort".
	it('awards nothing to a group of one, whatever it has done', () => {
		const solo: GroupTrophyMetrics = {
			members: 1,
			completions: 9999,
			streak: 9999,
			rollCallStreak: 9999,
			challengesWon: 9999,
		}
		expect(earnedTrophyCount(solo)).toBe(0)
	})

	it('opens the shelf at the member floor', () => {
		const trophy = groupTrophies.find((entry) => entry.metric !== 'members') as GroupTrophy
		const met = { ...NO_TROPHY_METRICS, [trophy.metric]: trophy.target }
		expect(trophyEarned(trophy, { ...met, members: TROPHY_MIN_MEMBERS - 1 })).toBe(false)
		expect(trophyEarned(trophy, { ...met, members: TROPHY_MIN_MEMBERS })).toBe(true)
	})

	it('awards every trophy to a maxed-out group', () => {
		const maxed: GroupTrophyMetrics = {
			members: 9999,
			completions: 9999,
			streak: 9999,
			rollCallStreak: 9999,
			challengesWon: 9999,
		}
		expect(earnedTrophyCount(maxed)).toBe(groupTrophies.length)
	})
})

describe('countWonChallenges', () => {
	it('is 0 when no group habit matches a built-in challenge', () => {
		expect(countWonChallenges([{ id: 'a', name: 'Totally custom habit' }], { a: ['2026-01-01'] })).toBe(0)
	})
})
