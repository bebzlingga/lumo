// `lib/supabase` builds a real client at import time, which pulls in the
// AsyncStorage native module and blows up under Jest. `buildGroup` is pure and
// never touches the client, so a stub is enough to get the module loaded.
jest.mock('../supabase', () => ({
	supabase: {},
	isSupabaseConfigured: false,
	ensureSignedIn: async () => null,
}))

import { addDays } from '../date'
import { buildGroup } from '../friends'

/**
 * The rule under test: a group's streaks are grandfathered against each
 * member's join date.
 *
 * Before this, both streaks were evaluated against the CURRENT roster for every
 * past day. A member who joined on Tuesday had no rows for Monday, so Monday
 * failed and the walk-back broke — accepting an invite reset a group's 10-day
 * streak to 0. Growing the group destroyed its history.
 */

const TODAY = '2026-03-20'
const GROUP = 'group-1'
const HABIT = 'habit-1'

const day = (offset: number) => addDays(TODAY, -offset)
/** `joined_at` is a timestamp; members are answerable from the day AFTER it. */
const joinedOn = (dayKey: string) => `${dayKey}T09:00:00.000Z`

function profile(id: string) {
	return { id, lumo_id: `LUMO-${id.toUpperCase()}-01`, nickname: id, avatar: null }
}

function member(id: string, joined_at: string | null) {
	return { member: id, status: 'accepted' as const, joined_at, profiles: profile(id) }
}

function row(members: ReturnType<typeof member>[]) {
	return {
		id: GROUP,
		name: 'Test group',
		owner: 'a',
		weekly_target: null,
		avatar_seed: null,
		group_habits: [
			{
				id: HABIT,
				name: 'Read',
				icon: 'book',
				color: null,
				repeat_schedule: { type: 'daily' as const },
				goal: { type: 'once' as const },
			},
		],
		group_members: members,
	}
}

/** One completion per member per day, for `days` days back from today. */
function completionsFor(memberIds: string[], days: number) {
	return memberIds.flatMap((id) =>
		Array.from({ length: days }, (_, offset) => ({
			group_id: GROUP,
			habit_id: HABIT,
			member: id,
			day: day(offset),
			count: 1,
			completed_at: `${day(offset)}T10:00:00.000Z`,
		})),
	)
}

function checkinsFor(memberIds: string[], days: number) {
	return memberIds.flatMap((id) =>
		Array.from({ length: days }, (_, offset) => ({ group_id: GROUP, member: id, day: day(offset) })),
	)
}

describe('group streak — solo baseline', () => {
	it('counts every consecutive day the only member completed', () => {
		const group = buildGroup(row([member('a', joinedOn(day(30)))]), completionsFor(['a'], 10), [], 'a', TODAY)

		expect(group.streak).toBe(10)
	})
})

describe('group streak — a member joins', () => {
	// A has a 10-day run. B joined yesterday and has done today and yesterday.
	const members = [member('a', joinedOn(day(30))), member('b', joinedOn(day(1)))]

	it("keeps the run going: B's absence before joining is not held against it", () => {
		const completions = [...completionsFor(['a'], 10), ...completionsFor(['b'], 2)]
		const group = buildGroup(row(members), completions, [], 'a', TODAY)

		// The whole point: this was 0 before the join date was taken into
		// account, because B had no rows on day 3, day 4, and so on.
		expect(group.streak).toBe(10)
	})

	it('still breaks when a member who HAD joined missed a day', () => {
		// A skips the day before yesterday — a genuine miss, inside A's tenure.
		const completions = [
			...completionsFor(['a'], 10).filter((entry) => entry.day !== day(2)),
			...completionsFor(['b'], 2),
		]
		const group = buildGroup(row(members), completions, [], 'a', TODAY)

		expect(group.streak).toBe(2)
	})

	it('holds a joined member to their share from the day after they join', () => {
		// B joined two days ago and has not logged since. Their first full day
		// (yesterday) is theirs to answer for, so the run breaks there.
		const twoDayMembers = [member('a', joinedOn(day(30))), member('b', joinedOn(day(2)))]
		const group = buildGroup(row(twoDayMembers), completionsFor(['a'], 10), [], 'a', TODAY)

		expect(group.streak).toBe(0)
	})

	it('gives a brand-new member a grace day rather than breaking on night one', () => {
		// B accepted today and has logged nothing. Today is not theirs to answer
		// for yet, so A's run stands.
		const freshMembers = [member('a', joinedOn(day(30))), member('b', joinedOn(TODAY))]
		const group = buildGroup(row(freshMembers), completionsFor(['a'], 10), [], 'a', TODAY)

		expect(group.streak).toBe(10)
	})
})

describe('roll-call streak', () => {
	const members = [member('a', joinedOn(day(30))), member('b', joinedOn(day(1)))]

	it('is grandfathered on the same rule', () => {
		const checkins = [...checkinsFor(['a'], 10), ...checkinsFor(['b'], 2)]
		const group = buildGroup(row(members), [], checkins, 'a', TODAY)

		expect(group.rollCallStreak).toBe(10)
	})

	it('breaks when someone who had joined did not show up', () => {
		const checkins = [...checkinsFor(['a'], 10).filter((entry) => entry.day !== day(3)), ...checkinsFor(['b'], 2)]
		const group = buildGroup(row(members), [], checkins, 'a', TODAY)

		expect(group.rollCallStreak).toBe(3)
	})
})

describe('missing join dates', () => {
	it('falls back to counting the member for every day', () => {
		// Older rows have no `joined_at`. Failing this way can understate a
		// streak but never inflate one, which is the safe direction.
		const members = [member('a', joinedOn(day(30))), member('b', null)]
		const group = buildGroup(row(members), completionsFor(['a'], 10), [], 'a', TODAY)

		expect(group.streak).toBe(0)
	})
})
