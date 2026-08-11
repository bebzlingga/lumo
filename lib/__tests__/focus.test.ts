import {
	DEFAULT_MINUTES,
	MAX_MINUTES,
	MIN_MINUTES,
	addTask,
	HISTORY_LIMIT,
	clearFinished,
	clearHistory,
	describeRemaining,
	dialToMinutes,
	doneCount,
	emptyFocusState,
	endSession,
	formatRemaining,
	isFinished,
	isPaused,
	minutesToDial,
	minutesToMs,
	normalizeFocusState,
	pauseSession,
	progress,
	remainingMs,
	removeTask,
	resumeSession,
	setActivity,
	setDuration,
	setTaskDone,
	snapMinutes,
	startSession,
	totalFocusedMs,
	type FocusState,
} from '../focus'

// Every test passes `now` explicitly — the module never reads the clock itself,
// which is what keeps this suite free of fake timers.
const T0 = 1_700_000_000_000
const MIN = 60_000

function running(minutes = 25): FocusState {
	return startSession(setDuration(emptyFocusState, minutes), T0)
}

function withTasks(...titles: string[]): FocusState {
	return titles.reduce((state, title) => addTask(state, title), emptyFocusState)
}

function idOf(state: FocusState, title: string): string {
	const task = state.tasks.find((item) => item.title === title)

	if (!task) {
		throw new Error(`no task titled ${title}`)
	}

	return task.id
}

describe('focus countdown', () => {
	describe('the dial', () => {
		it('clamps, and rounds to whole minutes', () => {
			// Every minute in range is reachable — 23 used to round away to 25.
			expect(snapMinutes(23)).toBe(23)
			expect(snapMinutes(22.4)).toBe(22)
			expect(snapMinutes(22.6)).toBe(23)
			expect(snapMinutes(0)).toBe(MIN_MINUTES)
			expect(snapMinutes(-30)).toBe(MIN_MINUTES)
			expect(snapMinutes(500)).toBe(MAX_MINUTES)
		})

		it('round-trips between minutes and dial position', () => {
			expect(minutesToDial(MIN_MINUTES)).toBe(0)
			expect(minutesToDial(MAX_MINUTES)).toBe(1)
			expect(dialToMinutes(0)).toBe(MIN_MINUTES)
			expect(dialToMinutes(1)).toBe(MAX_MINUTES)
			expect(dialToMinutes(minutesToDial(25))).toBe(25)
			expect(dialToMinutes(minutesToDial(23))).toBe(23)
			expect(dialToMinutes(minutesToDial(60))).toBe(60)
		})

		it('survives a handle dragged past either end', () => {
			expect(dialToMinutes(-3)).toBe(MIN_MINUTES)
			expect(dialToMinutes(4)).toBe(MAX_MINUTES)
		})
	})

	describe('the clock', () => {
		it('counts down from the wall clock, not from ticks', () => {
			const state = running(25)

			expect(remainingMs(state.session!, T0)).toBe(25 * MIN)
			expect(remainingMs(state.session!, T0 + 10 * MIN)).toBe(15 * MIN)
		})

		// The reason the model stores an instant at all: the app is suspended for
		// exactly the stretch that is worth counting.
		it('counts time that passed while the app was backgrounded', () => {
			const state = running(25)

			expect(isFinished(state.session!, T0 + 26 * MIN)).toBe(true)
			expect(remainingMs(state.session!, T0 + 26 * MIN)).toBe(0)
		})

		it('never reports negative time, however long the gap', () => {
			expect(remainingMs(running(25).session!, T0 + 24 * 60 * MIN)).toBe(0)
		})

		it('is not finished a moment before it ends', () => {
			const state = running(25)

			expect(isFinished(state.session!, T0 + 25 * MIN - 1)).toBe(false)
			expect(isFinished(state.session!, T0 + 25 * MIN)).toBe(true)
		})

		it('runs progress 0 to 1, clamped', () => {
			const state = running(20)

			expect(progress(state.session!, T0)).toBe(0)
			expect(progress(state.session!, T0 + 10 * MIN)).toBeCloseTo(0.5)
			expect(progress(state.session!, T0 + 20 * MIN)).toBe(1)
			expect(progress(state.session!, T0 + 90 * MIN)).toBe(1)
		})

		it('starts at the snapped duration, not the raw one', () => {
			const state = startSession(setDuration(emptyFocusState, 23.4), T0)

			expect(state.session!.durationMs).toBe(minutesToMs(23))
		})

		it('ignores a second start rather than restarting', () => {
			const state = running(25)

			expect(startSession(state, T0 + 5 * MIN)).toBe(state)
		})

		it('carries the chosen activity into the session', () => {
			const state = startSession(setActivity(emptyFocusState, 'writing'), T0)

			expect(state.session!.activity).toBe('writing')
		})
	})

	describe('pause and resume', () => {
		it('freezes the remainder rather than the end time', () => {
			const paused = pauseSession(running(25), T0 + 10 * MIN)

			expect(isPaused(paused.session!)).toBe(true)
			// Still 15 minutes an hour later — a paused timer owes nothing to the
			// clock. Keeping `endsAt` through a pause is what would break here.
			expect(remainingMs(paused.session!, T0 + 70 * MIN)).toBe(15 * MIN)
		})

		it('costs no time across a pause, however long', () => {
			let state = pauseSession(running(25), T0 + 10 * MIN)
			state = resumeSession(state, T0 + 70 * MIN)

			expect(isPaused(state.session!)).toBe(false)
			expect(remainingMs(state.session!, T0 + 70 * MIN)).toBe(15 * MIN)
			expect(remainingMs(state.session!, T0 + 75 * MIN)).toBe(10 * MIN)
		})

		it('ignores a double pause or a resume that was never paused', () => {
			const live = running(25)
			const paused = pauseSession(live, T0 + 5 * MIN)

			expect(pauseSession(paused, T0 + 9 * MIN)).toBe(paused)
			expect(resumeSession(live, T0 + 9 * MIN)).toBe(live)
		})

		it('does nothing with no session', () => {
			expect(pauseSession(emptyFocusState, T0)).toBe(emptyFocusState)
			expect(resumeSession(emptyFocusState, T0)).toBe(emptyFocusState)
		})

		it('can be paused at zero without going negative on resume', () => {
			const paused = pauseSession(running(25), T0 + 30 * MIN)

			expect(remainingMs(paused.session!, T0 + 30 * MIN)).toBe(0)
			expect(isFinished(resumeSession(paused, T0 + 30 * MIN).session!, T0 + 30 * MIN)).toBe(true)
		})
	})

	describe('ending', () => {
		it('clears the session but keeps the settings', () => {
			let state = setActivity(setDuration(emptyFocusState, 45), 'work')
			state = startSession(state, T0)
			state = endSession(state, T0 + 5 * MIN)

			expect(state.session).toBeNull()
			expect(state.durationMinutes).toBe(45)
			expect(state.activity).toBe('work')
		})

		// The list is per-session: a list that accumulates across sessions turns
		// into a backlog nobody prunes.
		it('clears the task list so the next session starts fresh', () => {
			let state = withTasks('A', 'B')
			state = setTaskDone(state, idOf(state, 'A'), true)
			state = endSession(startSession(state, T0), T0 + 5 * MIN)

			expect(state.tasks).toHaveLength(0)
		})

		it('clears the list even when the session was too short to record', () => {
			const state = endSession(startSession(withTasks('A'), T0), T0 + 20_000)

			expect(state.tasks).toHaveLength(0)
			expect(state.history).toHaveLength(0)
		})
	})

	describe('history', () => {
		it('records a finished session with what was focused and what was planned', () => {
			let state = setActivity(setDuration(emptyFocusState, 30), 'work')
			state = endSession(startSession(state, T0), T0 + 30 * MIN)

			expect(state.history).toHaveLength(1)
			expect(state.history[0]).toMatchObject({
				activity: 'work',
				focusedMs: 30 * MIN,
				plannedMs: 30 * MIN,
				finished: true,
				endedAt: T0 + 30 * MIN,
			})
		})

		// A history that rounds an abandoned block up to its planned length is a
		// history worth nothing.
		it('records a session stopped early as what it actually was', () => {
			const state = endSession(startSession(setDuration(emptyFocusState, 60), T0), T0 + 12 * MIN)

			expect(state.history[0]).toMatchObject({ focusedMs: 12 * MIN, plannedMs: 60 * MIN, finished: false })
		})

		it('counts only running time when the session was paused', () => {
			let state = startSession(setDuration(emptyFocusState, 30), T0)
			state = pauseSession(state, T0 + 10 * MIN)
			state = endSession(state, T0 + 90 * MIN)

			expect(state.history[0].focusedMs).toBe(10 * MIN)
		})

		it('ignores a start-then-stop mis-tap', () => {
			const state = endSession(startSession(emptyFocusState, T0), T0 + 20_000)

			expect(state.session).toBeNull()
			expect(state.history).toHaveLength(0)
		})

		// The count is read before the clear, so the record keeps it.
		it('records how many items were ticked, even though the list is cleared', () => {
			let state = withTasks('A', 'B', 'C')
			state = setTaskDone(state, idOf(state, 'A'), true)
			state = setTaskDone(state, idOf(state, 'B'), true)
			state = endSession(startSession(state, T0), T0 + 25 * MIN)

			expect(state.history[0].ticked).toBe(2)
			expect(state.tasks).toHaveLength(0)
		})

		it('keeps the newest first and caps the list', () => {
			let state = emptyFocusState

			for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
				state = endSession(startSession(state, T0 + index * MIN), T0 + (index + 10) * MIN)
			}

			expect(state.history).toHaveLength(HISTORY_LIMIT)
			expect(state.history[0].endedAt).toBeGreaterThan(state.history[1].endedAt)
		})

		it('totals and clears', () => {
			let state = endSession(startSession(setDuration(emptyFocusState, 30), T0), T0 + 30 * MIN)
			state = endSession(startSession(state, T0 + 60 * MIN), T0 + 80 * MIN)

			expect(totalFocusedMs(state)).toBe(50 * MIN)
			expect(clearHistory(state).history).toHaveLength(0)
		})

		it('survives a round trip and repairs bad records', () => {
			const state = endSession(startSession(emptyFocusState, T0), T0 + 25 * MIN)

			expect(normalizeFocusState(JSON.parse(JSON.stringify(state)))).toEqual(state)
			expect(
				normalizeFocusState({ history: [{ id: 'a', endedAt: T0, focusedMs: 60_000 }, { id: 'b' }, null] }).history
			).toHaveLength(1)
		})
	})

	describe('the checklist', () => {
		it('trims, and ignores an empty title', () => {
			const state = addTask(addTask(emptyFocusState, '  Write  '), '   ')

			expect(state.tasks).toHaveLength(1)
			expect(state.tasks[0].title).toBe('Write')
		})

		it('allows duplicate free-text titles', () => {
			expect(withTasks('Email', 'Email').tasks).toHaveLength(2)
		})

		// Two rows for one habit would give it two ticks that both claim to
		// complete it.
		it('refuses to add the same habit twice', () => {
			const first = addTask(emptyFocusState, 'Read 10 pages', 'habit-1')

			expect(addTask(first, 'Read again', 'habit-1')).toBe(first)
		})

		it('ticks, un-ticks, counts, removes and clears', () => {
			let state = withTasks('A', 'B', 'C')
			state = setTaskDone(state, idOf(state, 'A'), true)
			state = setTaskDone(state, idOf(state, 'B'), true)
			expect(doneCount(state)).toBe(2)

			state = setTaskDone(state, idOf(state, 'B'), false)
			expect(doneCount(state)).toBe(1)

			state = removeTask(state, idOf(state, 'C'))
			expect(state.tasks.map((task) => task.title)).toEqual(['A', 'B'])

			state = clearFinished(state)
			expect(state.tasks.map((task) => task.title)).toEqual(['B'])
		})

		// The list is editable mid-session — that is the point of having it on the
		// running screen.
		it('leaves the running clock alone when the list changes', () => {
			let state = startSession(withTasks('A'), T0)
			state = addTask(state, 'B')
			state = setTaskDone(state, idOf(state, 'A'), true)

			expect(remainingMs(state.session!, T0 + 8 * MIN)).toBe(17 * MIN)
		})
	})

	describe('formatting', () => {
		it('rounds up, so a fresh session does not open on 24:59', () => {
			expect(formatRemaining(25 * MIN)).toBe('25:00')
			expect(formatRemaining(25 * MIN - 1)).toBe('25:00')
		})

		it('pads seconds and holds 0:00 only at zero', () => {
			expect(formatRemaining(MIN + 5000)).toBe('1:05')
			expect(formatRemaining(1)).toBe('0:01')
			expect(formatRemaining(0)).toBe('0:00')
			expect(formatRemaining(-500)).toBe('0:00')
		})

		it('describes time in words for screen readers', () => {
			expect(describeRemaining(25 * MIN)).toBe('25 minutes left')
			expect(describeRemaining(MIN)).toBe('1 minute left')
			expect(describeRemaining(MIN + 5000)).toBe('1 minute 5 seconds left')
			expect(describeRemaining(1000)).toBe('1 second left')
			expect(describeRemaining(0)).toBe('0 seconds left')
		})
	})

	describe('reading back from storage', () => {
		it('round-trips a running session', () => {
			const state = startSession(addTask(setActivity(emptyFocusState, 'creative'), 'Sketch'), T0)

			expect(normalizeFocusState(JSON.parse(JSON.stringify(state)))).toEqual(state)
		})

		it('round-trips a paused session', () => {
			const state = pauseSession(running(30), T0 + 12 * MIN)
			const restored = normalizeFocusState(JSON.parse(JSON.stringify(state)))

			expect(isPaused(restored.session!)).toBe(true)
			expect(remainingMs(restored.session!, T0 + 99 * MIN)).toBe(18 * MIN)
		})

		it('falls back to defaults on junk', () => {
			expect(normalizeFocusState(null)).toEqual(emptyFocusState)
			expect(normalizeFocusState('focus')).toEqual(emptyFocusState)
			expect(normalizeFocusState({})).toEqual(emptyFocusState)
		})

		it('drops a session that could never finish', () => {
			expect(normalizeFocusState({ session: { endsAt: NaN, durationMs: 100 } }).session).toBeNull()
			expect(normalizeFocusState({ session: { endsAt: T0, durationMs: 0 } }).session).toBeNull()
		})

		// A build that later removes an activity must still open a blob naming it.
		it('falls back to a real activity and a snapped duration', () => {
			const restored = normalizeFocusState({ activity: 'napping', durationMinutes: 23 })

			expect(restored.activity).toBe('study')
			// 23 is a real length now that the dial steps by one — snapping only
			// has to clamp the range and drop a fraction.
			expect(restored.durationMinutes).toBe(23)
			expect(normalizeFocusState({ durationMinutes: 200 }).durationMinutes).toBe(MAX_MINUTES)
			expect(normalizeFocusState({ durationMinutes: NaN }).durationMinutes).toBe(DEFAULT_MINUTES)
		})

		it('repairs bad task records rather than dropping the list', () => {
			const restored = normalizeFocusState({
				tasks: [{ id: 'a', title: 'A', done: 'yes' }, { id: 'b', title: 'B' }, { title: 'no id' }, null],
			})

			expect(restored.tasks).toHaveLength(2)
			expect(restored.tasks[0]).toEqual({ id: 'a', title: 'A', habitId: undefined, done: false })
		})

		it('keeps both sound choices and the habit link', () => {
			const restored = normalizeFocusState({
				tasks: [{ id: 'a', title: 'Read', habitId: 'habit-1', done: false }],
				backgroundSoundId: 'birdsong',
				endSoundId: 'chime',
			})

			expect(restored.tasks[0].habitId).toBe('habit-1')
			expect(restored.backgroundSoundId).toBe('birdsong')
			expect(restored.endSoundId).toBe('chime')
		})
	})
})
