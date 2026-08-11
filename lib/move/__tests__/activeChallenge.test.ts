import {
	achievementFor,
	describeAchievement,
	describeFamilyProgress,
	earnedFamilies,
	familyProgress,
	hasMilestone,
	isFamilyLocked,
	routesRequired,
	routesToBadge,
	nextFamily,
	normalizeAchievement,
	withAchievement,
	type MoveAchievement,
} from '../achievements'
import {
	activeParticipants,
	canStartChallenge,
	challengeEndsAt,
	challengeProgress,
	challengeWindow,
	MAX_PAUSES,
	myContribution,
	pauseChallenge,
	pauseState,
	normalizeActiveChallenge,
	type ActiveMoveChallenge,
} from '../activeChallenge'
import { MOVE_FAMILIES, MOVE_VARIANTS, findFamily, findVariant } from '../challengeDefs'
import type { MovementSummary } from '../types'

const T0 = Date.parse('2026-08-10T09:00:00.000Z')
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
/** Local-date-key extraction, passed in the way the module expects. */
const dayKeyOf = (value: string) => value.slice(0, 10)

function day(date: string, distanceMeters: number): MovementSummary {
	return { date, steps: 0, distanceMeters, activeMinutes: 0 }
}

function challenge(over: Partial<ActiveMoveChallenge> = {}): ActiveMoveChallenge {
	return {
		id: 'ch-1',
		variantId: '10k-timed',
		startedAt: iso(T0),
		endsAt: iso(T0 + 7 * DAY),
		status: 'active',
		completedAt: null,
		pausesUsed: 0,
		participants: [],
		ownerId: null,
		...over,
	}
}

describe('challenge definitions', () => {
	it('gives every milestone three variants, all reaching the same badge', () => {
		expect(MOVE_FAMILIES.map((entry) => entry.id)).toEqual(['1k', '5k', '10k', '25k', '50k', '100k', '300k'])

		for (const entry of MOVE_FAMILIES) {
			expect(entry.variants).toHaveLength(3)

			// The badge belongs to the MILESTONE, not the variant — every route
			// through a family has to land on the same one.
			for (const variant of entry.variants) {
				expect(variant.milestoneId).toBe(entry.id)
				expect(variant.targetM).toBe(entry.distanceM)
			}
		}
	})

	it('has unique variant ids', () => {
		const ids = MOVE_VARIANTS.map((entry) => entry.id)

		expect(new Set(ids).size).toBe(ids.length)
	})

	it('offers exactly one open, one timed and one team route per family', () => {
		for (const entry of MOVE_FAMILIES) {
			expect(entry.variants.filter((variant) => variant.durationDays === null)).toHaveLength(1)
			expect(entry.variants.filter((variant) => variant.kind === 'team')).toHaveLength(1)
		}
	})

	// An open-ended team challenge never resolves: someone drifts off and it
	// sits in everybody's one slot for months.
	it('always puts a clock on a team challenge', () => {
		for (const variant of MOVE_VARIANTS.filter((entry) => entry.kind === 'team')) {
			expect(variant.durationDays).not.toBeNull()
			expect(variant.minFriends).toBeGreaterThanOrEqual(1)
		}
	})

	it('never asks a solo challenge for friends', () => {
		for (const variant of MOVE_VARIANTS.filter((entry) => entry.kind === 'solo')) {
			expect(variant.minFriends).toBe(0)
		}
	})

	it('rises in distance up the ladder', () => {
		for (let index = 1; index < MOVE_FAMILIES.length; index += 1) {
			expect(MOVE_FAMILIES[index].distanceM).toBeGreaterThan(MOVE_FAMILIES[index - 1].distanceM)
		}
	})

	it('has no family or variant for an unknown id', () => {
		expect(findFamily('moonwalk')).toBeUndefined()
		expect(findVariant(null)).toBeUndefined()
	})
})

describe('starting a challenge', () => {
	// THE rule. Also enforced by the store and by a primary key in the database —
	// three places, because each catches a different failure.
	it('refuses while another is active, with a reason a screen can print', () => {
		const result = canStartChallenge({ active: challenge(), variantId: '5k-open' })

		expect(result).toEqual({ ok: false, reason: 'MOVE_CHALLENGE_ALREADY_ACTIVE' })
	})

	it('allows one once the last is finished or cancelled', () => {
		expect(canStartChallenge({ active: challenge({ status: 'completed' }), variantId: '5k-open' }).ok).toBe(true)
		expect(canStartChallenge({ active: challenge({ status: 'cancelled' }), variantId: '5k-open' }).ok).toBe(true)
		expect(canStartChallenge({ active: null, variantId: '5k-open' }).ok).toBe(true)
	})

	it('refuses an unknown variant', () => {
		expect(canStartChallenge({ active: null, variantId: 'nope' })).toEqual({
			ok: false,
			reason: 'MOVE_CHALLENGE_UNKNOWN_VARIANT',
		})
	})

	it('refuses a team challenge without enough friends', () => {
		// 100k-team asks for three; the owner is never counted.
		expect(canStartChallenge({ active: null, variantId: '100k-team', invitedFriendIds: ['a', 'b'] })).toEqual({
			ok: false,
			reason: 'MOVE_CHALLENGE_NEEDS_FRIENDS',
		})
		expect(canStartChallenge({ active: null, variantId: '100k-team', invitedFriendIds: ['a', 'b', 'c'] }).ok).toBe(true)
	})

	it('works out the deadline, or leaves it open', () => {
		const timed = findVariant('10k-timed')
		const open = findVariant('10k-open')

		expect(timed && challengeEndsAt(timed, iso(T0))).toBe(iso(T0 + 7 * DAY))
		expect(open && challengeEndsAt(open, iso(T0))).toBeNull()
	})
})

describe('challenge progress', () => {
	const base = { todayKey: '2026-08-12', dayKeyOf, now: T0 + 2 * DAY }

	it('counts only movement inside the window', () => {
		const summaries = [
			// Before it started — must not count, whatever else happens.
			day('2026-08-09', 5000),
			day('2026-08-10', 2000),
			day('2026-08-11', 2200),
		]
		const progress = challengeProgress({ challenge: challenge(), summaries, ...base })

		expect(progress?.currentM).toBe(4200)
		expect(progress?.remainingM).toBe(5800)
		expect(progress?.ratio).toBeCloseTo(0.42, 5)
	})

	it('stops counting at the deadline, not at today', () => {
		const past = challenge({ startedAt: iso(T0 - 20 * DAY), endsAt: iso(T0 - 13 * DAY) })
		const summaries = [day('2026-07-25', 3000), day('2026-08-12', 9000)]
		const progress = challengeProgress({ challenge: past, summaries, ...base })

		expect(progress?.currentM).toBe(3000)
	})

	// Your own bar always reads the device, never the participant row — that row
	// is what OTHERS see of you and only refreshes on sync, so reading it here
	// would make your own progress lag your own walk.
	it('measures you against the full target on a team challenge', () => {
		const team = challenge({
			variantId: '100k-team',
			participants: [
				{ userId: 'me', name: 'You', contributionM: 12_400, leftAt: null },
				{ userId: 'a', name: 'Abdul', contributionM: 8100, leftAt: null },
				{ userId: 's', name: 'Sarah', contributionM: 7300, leftAt: null },
				{ userId: 'l', name: 'Ali', contributionM: 6800, leftAt: null },
			],
		})
		const progress = challengeProgress({ challenge: team, summaries: [day('2026-08-11', 12_400)], ...base })

		expect(progress?.currentM).toBe(12_400)
		expect(progress?.targetM).toBe(100_000)
		// The pooled figure is a motivator shown beside it, never the measure.
		expect(progress?.teamM).toBe(34_600)
		expect(progress?.teamDone).toBe(0)
		expect(progress?.teamSize).toBe(4)
	})

	// THE rule. Pooling would let four people walk a quarter each and all take
	// the badge someone else earned walking the lot.
	it('is not complete until everyone has reached the target', () => {
		const nearly = challenge({
			variantId: '10k-team',
			participants: [
				{ userId: 'me', name: 'You', contributionM: 10_000, leftAt: null },
				{ userId: 'a', name: 'Abdul', contributionM: 9500, leftAt: null },
			],
		})

		expect(challengeProgress({ challenge: nearly, summaries: [day('2026-08-11', 10_000)], ...base })?.complete).toBe(false)

		const done = challenge({
			variantId: '10k-team',
			participants: [
				{ userId: 'me', name: 'You', contributionM: 10_000, leftAt: null },
				{ userId: 'a', name: 'Abdul', contributionM: 10_400, leftAt: null },
			],
		})
		const progress = challengeProgress({ challenge: done, summaries: [day('2026-08-11', 10_000)], ...base })

		expect(progress?.complete).toBe(true)
		expect(progress?.teamDone).toBe(2)
	})

	// Someone who walks off stops being counted toward "everyone is there" —
	// otherwise one person leaving would hold the rest hostage forever.
	it('drops a leaver from the roster', () => {
		const team = challenge({
			variantId: '10k-team',
			participants: [
				{ userId: 'me', name: 'You', contributionM: 10_000, leftAt: null },
				{ userId: 'a', name: 'Abdul', contributionM: 3000, leftAt: iso(T0 + DAY) },
			],
		})
		const progress = challengeProgress({ challenge: team, summaries: [day('2026-08-11', 10_000)], ...base })

		expect(progress?.teamSize).toBe(1)
		expect(progress?.complete).toBe(true)
		expect(activeParticipants(team).map((entry) => entry.userId)).toEqual(['me'])
		expect(myContribution(team, 'me')).toBe(10_000)
		expect(myContribution(team, 'nobody')).toBe(0)
	})

	it('rounds days left up, so the last part-day still counts', () => {
		const progress = challengeProgress({
			challenge: challenge(),
			summaries: [],
			todayKey: '2026-08-16',
			dayKeyOf,
			now: T0 + 6.2 * DAY,
		})

		expect(progress?.daysLeft).toBe(1)
	})

	it('has no clock on an open-ended challenge', () => {
		const progress = challengeProgress({ challenge: challenge({ variantId: '10k-open', endsAt: null }), summaries: [], ...base })

		expect(progress?.daysLeft).toBeNull()
		expect(progress?.expired).toBe(false)
	})

	it('completes at the target and clamps past it', () => {
		const progress = challengeProgress({ challenge: challenge(), summaries: [day('2026-08-11', 25_000)], ...base })

		expect(progress?.complete).toBe(true)
		expect(progress?.ratio).toBe(1)
		expect(progress?.remainingM).toBe(0)
	})

	// A challenge finished on its final morning stays finished, however the
	// clock reads afterwards.
	it('is never complete and expired at once', () => {
		const done = challenge({ completedAt: iso(T0 + DAY) })
		const progress = challengeProgress({ challenge: done, summaries: [], todayKey: '2026-08-30', dayKeyOf, now: T0 + 30 * DAY })

		expect(progress?.complete).toBe(true)
		expect(progress?.expired).toBe(false)
	})

	it('expires when the clock runs out short', () => {
		const progress = challengeProgress({ challenge: challenge(), summaries: [], todayKey: '2026-08-30', dayKeyOf, now: T0 + 30 * DAY })

		expect(progress?.expired).toBe(true)
		expect(progress?.daysLeft).toBe(0)
	})

	// Slightly generous on the first day, deliberately: the alternative is
	// discarding a day someone genuinely walked because they signed up at 3pm.
	it('counts the whole day a challenge started on', () => {
		expect(challengeWindow(challenge(), '2026-08-12', dayKeyOf)).toEqual({ start: '2026-08-10', end: '2026-08-12' })
	})

	it('has no progress for a variant that no longer exists', () => {
		const stale = { ...challenge(), variantId: 'gone' }

		expect(challengeProgress({ challenge: stale, summaries: [], ...base })).toBeNull()
	})
})

describe('pausing', () => {
	it('moves the deadline out by a day and counts the pause', () => {
		const paused = pauseChallenge(challenge())

		expect(paused.endsAt).toBe(iso(T0 + 8 * DAY))
		expect(paused.pausesUsed).toBe(1)
	})

	it('stops at three', () => {
		let current = challenge()

		for (let index = 0; index < MAX_PAUSES; index += 1) {
			current = pauseChallenge(current)
		}

		expect(current.pausesUsed).toBe(MAX_PAUSES)
		expect(pauseState(current).can).toBe(false)
		expect(pauseState(current).left).toBe(0)

		// A caller that skipped `pauseState` still cannot overrun the cap.
		const again = pauseChallenge(current)

		expect(again.endsAt).toBe(current.endsAt)
		expect(again.pausesUsed).toBe(MAX_PAUSES)
	})

	it('has nothing to pause on an open-ended challenge', () => {
		const open = challenge({ variantId: '10k-open', endsAt: null })

		expect(pauseState(open).can).toBe(false)
		expect(pauseChallenge(open)).toEqual(open)
	})

	it('will not pause a challenge that has stopped', () => {
		expect(pauseState(challenge({ status: 'completed' })).can).toBe(false)
	})

	// The deadline is the only thing a pause moves — progress is derived from
	// the day-keyed summaries and must not shift under it.
	it('leaves the window and the distance alone', () => {
		const paused = pauseChallenge(challenge())
		const summaries = [day('2026-08-06', 4000)]
		const at = { todayKey: '2026-08-12', dayKeyOf: (value: string) => value.slice(0, 10), now: T0 + 2 * DAY }
		const before = challengeProgress({ challenge: challenge(), summaries, ...at })
		const after = challengeProgress({ challenge: paused, summaries, ...at })

		expect(after?.currentM).toBe(before?.currentM)
		expect(after?.daysLeft).toBe((before?.daysLeft ?? 0) + 1)
	})
})

describe('achievements', () => {
	const solo = achievementFor({ variantId: '10k-open', startedAt: iso(T0), completedAt: iso(T0 + 5 * DAY) })
	const team = achievementFor({
		variantId: '10k-team',
		startedAt: iso(T0),
		completedAt: iso(T0 + 6 * DAY),
		withUserIds: ['a', 's', 'l', 'a'],
	})

	// Every route files against the same milestone; the badge needs all of them.
	it('files the same milestone whichever route was run', () => {
		expect(solo?.milestoneId).toBe('10k')
		expect(team?.milestoneId).toBe('10k')
	})

	it('records how it was done', () => {
		expect(solo?.completionType).toBe('solo')
		expect(solo?.days).toBe(5)
		expect(team?.completionType).toBe('team')
		// Deduped — a friend listed twice would be counted twice on the card.
		expect(team?.withUserIds).toEqual(['a', 's', 'l'])
		expect(team && describeAchievement(team)).toBe('Completed together in 6 days')
	})

	it('never records a solo completion as having company', () => {
		const withFriends = achievementFor({ variantId: '10k-open', startedAt: iso(T0), completedAt: iso(T0 + DAY), withUserIds: ['a'] })

		expect(withFriends?.withUserIds).toEqual([])
	})

	it('counts a same-day finish as one day, not zero', () => {
		expect(achievementFor({ variantId: '1k-open', startedAt: iso(T0), completedAt: iso(T0 + 3600_000) })?.days).toBe(1)
	})

	/** Every route of a family, finished. */
	const allRoutes = (familyId: string) =>
		['open', 'timed', 'team'].map(
			(route) => achievementFor({ variantId: `${familyId}-${route}`, startedAt: iso(T0), completedAt: iso(T0 + DAY) })!
		)

	// Re-running a route must not overwrite the day it was first finished, but a
	// DIFFERENT route is progress toward the badge and has to be kept.
	it('keeps the first run of a route and ignores a repeat', () => {
		const again = withAchievement(withAchievement([], solo as MoveAchievement), solo as MoveAchievement)

		expect(again).toHaveLength(1)
		expect(again[0].completionType).toBe('solo')
	})

	it('files a second route alongside the first', () => {
		const both = withAchievement(withAchievement([], solo as MoveAchievement), team as MoveAchievement)

		expect(both).toHaveLength(2)
		expect(familyProgress(both, MOVE_FAMILIES.find((entry) => entry.id === '10k')!)).toEqual({ done: 2, total: 3 })
	})

	// The early rungs are where somebody decides whether Move is for them, so a
	// single route earns the badge — no friend required.
	it('unlocks an early badge on any one route', () => {
		const family = MOVE_FAMILIES.find((entry) => entry.id === '10k')!

		expect(hasMilestone([solo as MoveAchievement], '10k')).toBe(true)
		expect(describeFamilyProgress([solo as MoveAchievement], family)).toBe('Badge earned')
		expect(routesToBadge([], family)).toBe(1)
		expect(routesToBadge([solo as MoveAchievement], family)).toBe(0)
	})

	// From 50K the badge asks for company AND a solo run — either solo route.
	it('needs the team route plus a solo one from 50K up', () => {
		const family = MOVE_FAMILIES.find((entry) => entry.id === '50k')!
		const route = (id: string) => achievementFor({ variantId: id, startedAt: iso(T0), completedAt: iso(T0 + DAY) })!

		expect(hasMilestone([route('50k-open')], '50k')).toBe(false)
		expect(hasMilestone([route('50k-team')], '50k')).toBe(false)
		// Both solo routes is still not enough: the team one is not optional.
		expect(hasMilestone([route('50k-open'), route('50k-timed')], '50k')).toBe(false)
		expect(routesToBadge([route('50k-open'), route('50k-timed')], family)).toBe(1)

		expect(hasMilestone([route('50k-team'), route('50k-open')], '50k')).toBe(true)
		expect(hasMilestone([route('50k-team'), route('50k-timed')], '50k')).toBe(true)
		expect(routesToBadge([route('50k-team'), route('50k-open')], family)).toBe(0)
		expect(routesToBadge([], family)).toBe(2)
	})

	it('says nothing about a milestone with no route finished', () => {
		expect(describeFamilyProgress([], MOVE_FAMILIES[0])).toBeNull()
	})

	// Counted against what the badge COSTS, not the three routes that exist.
	it('tallies routes against the rung\'s own requirement', () => {
		const family = MOVE_FAMILIES.find((entry) => entry.id === '50k')!
		const route = (id: string) => achievementFor({ variantId: id, startedAt: iso(T0), completedAt: iso(T0 + DAY) })!

		expect(routesRequired(family)).toBe(2)
		expect(routesRequired(MOVE_FAMILIES.find((entry) => entry.id === '1k')!)).toBe(1)
		expect(describeFamilyProgress([route('50k-open')], family)).toBe('1 of 2 routes done')
		// The second solo route buys nothing toward the badge, so the tally holds.
		expect(describeFamilyProgress([route('50k-open'), route('50k-timed')], family)).toBe('1 of 2 routes done')
	})

	it('shuts every rung until the one below it is earned', () => {
		const first = MOVE_FAMILIES[0]
		const second = MOVE_FAMILIES[1]

		// There is always exactly one way in.
		expect(isFamilyLocked([], first)).toBe(false)
		expect(isFamilyLocked([], second)).toBe(true)

		const opened = [achievementFor({ variantId: `${first.id}-open`, startedAt: iso(T0), completedAt: iso(T0) })!]

		expect(isFamilyLocked(opened, second)).toBe(false)
		expect(isFamilyLocked(opened, MOVE_FAMILIES[2])).toBe(true)
	})

	it('offers the next rung in ladder order, not by distance', () => {
		expect(nextFamily([])?.id).toBe('1k')
		// 10K earned, 1K not — the ladder does not skip ahead.
		expect(nextFamily([solo as MoveAchievement])?.id).toBe('1k')
		expect(nextFamily([achievementFor({ variantId: '1k-open', startedAt: iso(T0), completedAt: iso(T0) })!])?.id).toBe('5k')
	})

	it('lists what has been earned in ladder order', () => {
		expect(earnedFamilies([]).map((entry) => entry.id)).toEqual([])
		expect(earnedFamilies([solo as MoveAchievement]).map((entry) => entry.id)).toEqual(['10k'])
	})

	it('has nothing left to offer once every rung is done', () => {
		const all = MOVE_FAMILIES.flatMap((entry) => allRoutes(entry.id))

		expect(nextFamily(all)).toBeNull()
	})

	it('still counts routes finished after the badge was earned', () => {
		const family = MOVE_FAMILIES.find((entry) => entry.id === '10k')!

		expect(familyProgress(allRoutes('10k'), family)).toEqual({ done: 3, total: 3 })
	})

	describe('reading back from storage', () => {
		it('round-trips', () => {
			expect(normalizeAchievement(JSON.parse(JSON.stringify(team)))).toEqual(team)
		})

		it('drops an award for a milestone that no longer exists', () => {
			expect(normalizeAchievement({ milestoneId: 'moonwalk' })).toBeNull()
			expect(normalizeAchievement(null)).toBeNull()
		})

		it('repairs a damaged award rather than losing the badge', () => {
			const repaired = normalizeAchievement({ milestoneId: '10k', days: -4 })

			expect(repaired?.variantId).toBe('10k-open')
			expect(repaired?.days).toBe(1)
			expect(repaired?.completionType).toBe('solo')
		})
	})
})

describe('reading an active challenge back', () => {
	it('round-trips', () => {
		const stored = challenge({ participants: [{ userId: 'a', name: 'Abdul', contributionM: 100, leftAt: null }] })

		expect(normalizeActiveChallenge(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
	})

	// A build whose ladder has changed must not leave someone stuck on a
	// challenge nothing can evaluate.
	it('drops one whose variant is gone', () => {
		expect(normalizeActiveChallenge({ ...challenge(), variantId: 'gone' })).toBeNull()
		expect(normalizeActiveChallenge(null)).toBeNull()
	})

	it('repairs participants rather than dropping the challenge', () => {
		const repaired = normalizeActiveChallenge({
			...challenge(),
			participants: [{ userId: 'a' }, { name: 'nobody' }, { userId: 'b', contributionM: -5 }],
		})

		expect(repaired?.participants).toEqual([
			{ userId: 'a', name: 'A friend', contributionM: 0, leftAt: null },
			{ userId: 'b', name: 'A friend', contributionM: 0, leftAt: null },
		])
	})
})
