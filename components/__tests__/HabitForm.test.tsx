/**
 * The habit form's "Count my walks" option: a walk target is shown in the
 * units people think in and saved in the base units the walk store sums.
 */
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { makeHabit } from '@/lib/__tests__/factories'
import { HabitForm } from '../HabitForm'

jest.mock('@/context/LumoContext', () => ({
	useLumo: () => ({
		palette: require('@/constants/theme').lightPalette,
		isDark: false,
		themeId: 'cream',
		settings: { textSize: 'default', minimalMode: false },
		habits: [],
	}),
}))
jest.mock('expo-router', () => ({
	useFocusEffect: jest.fn(),
	useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
	useLocalSearchParams: () => ({}),
}))

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, left: 0, right: 0, bottom: 34 } }
async function renderScreen(element: ReactElement) {
	return await render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>)
}

describe('HabitForm walk counting', () => {
	it('shows an existing walk target in kilometres', async () => {
		await renderScreen(
			<HabitForm habit={makeHabit({ measurement: { kind: 'distance', target: 2500 } })} title="Edit habit" onSave={jest.fn()} />,
		)

		expect(screen.getByText('Target per day (km)')).toBeTruthy()
		expect(screen.getByDisplayValue('2.5')).toBeTruthy()
	})

	it('saves a new walk target in metres once switched on', async () => {
		const onSave = jest.fn(async () => undefined)
		await renderScreen(<HabitForm habit={makeHabit({ name: 'Walk' })} title="Edit habit" onSave={onSave} />)

		expect(screen.queryByText('Target per day (km)')).toBeNull()
		await fireEvent.press(screen.getByLabelText('Count my walks'))
		expect(screen.getByDisplayValue('2')).toBeTruthy()

		await fireEvent.press(screen.getByText('Save changes'))

		expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ measurement: { kind: 'distance', target: 2000 } }))
	})
})
