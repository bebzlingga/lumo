import {
	CHECK_INS,
	checkInTimeFor,
	checkInTimeLabel,
	formatCheckInTime,
	normalizeCheckInTimes,
	parseCheckInTime,
} from '../checkIns'

const morning = CHECK_INS[0]
const evening = CHECK_INS[CHECK_INS.length - 1]

describe('check-in defaults', () => {
	it('gives every check-in a parseable 24h default', () => {
		for (const checkIn of CHECK_INS) {
			expect(checkIn.defaultTime).toMatch(/^\d{2}:\d{2}$/)
			const { hour, minute } = parseCheckInTime(checkIn.defaultTime)
			expect(hour).toBeGreaterThanOrEqual(0)
			expect(hour).toBeLessThanOrEqual(23)
			expect(minute).toBeGreaterThanOrEqual(0)
			expect(minute).toBeLessThanOrEqual(59)
		}
	})

	it('runs in chronological order through the day', () => {
		const minutes = CHECK_INS.map((checkIn) => {
			const { hour, minute } = parseCheckInTime(checkIn.defaultTime)
			return hour * 60 + minute
		})

		expect([...minutes].sort((a, b) => a - b)).toEqual(minutes)
	})
})

describe('formatCheckInTime', () => {
	it('renders 24h as the 12h label the rows show', () => {
		expect(formatCheckInTime('06:00')).toBe('6:00 AM')
		expect(formatCheckInTime('12:00')).toBe('12:00 PM')
		expect(formatCheckInTime('15:30')).toBe('3:30 PM')
		expect(formatCheckInTime('19:00')).toBe('7:00 PM')
	})

	it('calls midnight 12 AM rather than 0 AM', () => {
		expect(formatCheckInTime('00:15')).toBe('12:15 AM')
	})
})

describe('checkInTimeFor', () => {
	it('falls back to the default when the user has not moved it', () => {
		expect(checkInTimeFor(morning)).toBe(morning.defaultTime)
		expect(checkInTimeFor(morning, {})).toBe(morning.defaultTime)
	})

	it('uses the stored time once there is one', () => {
		expect(checkInTimeFor(morning, { morning: '05:45' })).toBe('05:45')
	})

	it('only applies an override to its own check-in', () => {
		expect(checkInTimeFor(evening, { morning: '05:45' })).toBe(evening.defaultTime)
	})

	it('labels the row from whichever time is in force', () => {
		expect(checkInTimeLabel(morning, { morning: '05:45' })).toBe('5:45 AM')
	})
})

describe('normalizeCheckInTimes', () => {
	it('is empty for a store that has never set one', () => {
		expect(normalizeCheckInTimes()).toEqual({})
		expect(normalizeCheckInTimes({})).toEqual({})
	})

	it('keeps well-formed entries and pads them to HH:MM', () => {
		expect(normalizeCheckInTimes({ morning: '6:05' })).toEqual({ morning: '06:05' })
	})

	it('drops anything that does not parse, so no trigger gets a NaN hour', () => {
		expect(normalizeCheckInTimes({ morning: 'quarter past six' } as never)).toEqual({})
		expect(normalizeCheckInTimes({ lunch: '' } as never)).toEqual({})
		expect(normalizeCheckInTimes({ evening: 99 } as never)).toEqual({})
	})

	it('clamps an out-of-range time rather than scheduling it', () => {
		expect(normalizeCheckInTimes({ evening: '31:99' })).toEqual({ evening: '23:59' })
	})

	it('ignores keys that are not check-ins', () => {
		expect(normalizeCheckInTimes({ midnight: '00:00' } as never)).toEqual({})
	})
})
