import { drainFixes, enqueueFixes, type PendingFix } from '../storage'

jest.mock('@react-native-async-storage/async-storage', () =>
	require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

const fixAt = (seconds: number): PendingFix => ({
	latitude: 14.6,
	longitude: 120.98,
	horizontalAccuracy: 5,
	timestamp: Date.parse('2026-08-11T09:00:00.000Z') + seconds * 1000,
})

describe('background fix queue', () => {
	/** Regression: a delivery landing mid-drain was removed with the drained batch. */
	it('never loses a fix enqueued while a drain is in flight', async () => {
		await enqueueFixes([fixAt(1), fixAt(2)])

		// The background task delivers while the foreground is draining.
		const draining = drainFixes()
		const delivering = enqueueFixes([fixAt(3)])
		const first = await draining
		await delivering
		const second = await drainFixes()

		expect([...first, ...second].map((fix) => fix.timestamp)).toEqual([fixAt(1), fixAt(2), fixAt(3)].map((fix) => fix.timestamp))
	})
})
