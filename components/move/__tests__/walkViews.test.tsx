/**
 * Render tests for the walk screens: what a walker sees and can press, driven by
 * a real activity from the tracking engine. Catches wiring regressions (a button
 * that does nothing, a figure that disappears) the engine tests cannot.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { Animated } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { lightPalette } from '@/constants/theme'
import { beginTracking, createActivity, finishActivity, pauseActivity, processLocation } from '@/lib/move/tracking/tracker'
import type { ActivityTrackingState } from '@/lib/move/tracking/types'
import { LiveWalkView } from '../LiveWalkView'
import { WalkSummaryView } from '../WalkSummaryView'

jest.mock('@/context/LumoContext', () => ({
	useLumo: () => ({
		palette: require('@/constants/theme').lightPalette,
		isDark: false,
		themeId: 'cream',
		settings: { textSize: 'default', minimalMode: false },
	}),
}))
jest.mock('expo-router', () => ({
	useFocusEffect: jest.fn(),
	useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
	useLocalSearchParams: () => ({}),
}))
jest.mock('expo-image-picker', () => ({}))
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }))
jest.mock('@/components/WalkMap', () => ({ WalkMap: () => null }))
jest.mock('@/components/Avatar', () => ({ Avatar: () => null }))

const T0 = Date.parse('2026-08-11T09:00:00.000Z')

/** The app's root provides safe-area insets; a test has to as well. */
const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } }
async function renderScreen(element: ReactElement) {
	return await render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>)
}

/** Two kilometres north at 1.4 m/s, through the real engine. */
function walked(): ActivityTrackingState {
	let state = beginTracking(createActivity({ activityId: 'w', now: T0 }), T0)
	for (let s = 0; s <= 1430; s += 2) {
		state = processLocation(
			state,
			{ latitude: 14.6 + (s * 1.4) / 111_320, longitude: 120.98, horizontalAccuracy: 5, speed: 1.4, timestamp: T0 + s * 1000 },
			{ now: T0 + s * 1000 },
		).state
	}
	return state
}

describe('WalkSummaryView', () => {
	async function renderSummary(onSave = jest.fn(), onDiscard = jest.fn()) {
		const state = finishActivity(walked(), T0 + 1431_000)
		await renderScreen(
			<WalkSummaryView state={state} averagePace={714_000} accent="#C46A2B" companions="" saving={false} onSave={onSave} onDiscard={onDiscard} />,
		)
		return { onSave, onDiscard }
	}

	it('leads with the distance and shows the four figures', async () => {
		await renderSummary()

		expect(screen.getByText(/^2\.0/)).toBeTruthy()
		expect(screen.getByText('Moving time')).toBeTruthy()
		expect(screen.getByText('Avg. pace')).toBeTruthy()
		expect(screen.getByText('Calories (est.)')).toBeTruthy()
		// No altitude in the fixture: unknown, not "0".
		expect(screen.getByText('Elevation')).toBeTruthy()
		expect(screen.getByText('—')).toBeTruthy()
	})

	it('saves from the page bar and discards from the footer', async () => {
		const { onSave, onDiscard } = await renderSummary()

		await fireEvent.press(screen.getByLabelText('Save this activity'))
		await fireEvent.press(screen.getByLabelText('Discard this activity'))

		expect(onSave).toHaveBeenCalledTimes(1)
		expect(onDiscard).toHaveBeenCalledTimes(1)
	})
})

describe('LiveWalkView', () => {
	async function renderLive(state: ActivityTrackingState, handlers = { onTogglePause: jest.fn(), onFinish: jest.fn() }) {
		await renderScreen(
			<LiveWalkView
				state={state}
				permission="always"
				averagePace={714_000}
				accent="#C46A2B"
				lastFix={null}
				enter={new Animated.Value(1)}
				challenge={null}
				challengeFamily={undefined}
				peers={[]}
				companions=""
				onBack={jest.fn()}
				{...handlers}
			/>,
		)
		return handlers
	}

	it('finishes from the card and pauses from the page bar', async () => {
		const handlers = await renderLive(walked())

		await fireEvent.press(screen.getByLabelText('Finish'))
		await fireEvent.press(screen.getByLabelText('Pause'))

		expect(handlers.onFinish).toHaveBeenCalledTimes(1)
		expect(handlers.onTogglePause).toHaveBeenCalledTimes(1)
	})

	it('offers Resume once the walker has paused', async () => {
		await renderLive(pauseActivity(walked(), T0 + 1431_000))

		expect(screen.getByLabelText('Resume')).toBeTruthy()
	})

	it('shows a dash, not zero, when the device has no step counter', async () => {
		await renderLive({ ...walked(), steps: null })

		expect(screen.getAllByText('—').length).toBeGreaterThan(0)
	})
})

// Keeps the palette import honest if the mock factory's require ever drifts.
void lightPalette
