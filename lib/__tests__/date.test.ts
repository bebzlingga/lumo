import {
	addDays,
	dateRange,
	daysBetween,
	monthRange,
	startOfMonth,
	startOfWeek,
	startOfWeekMonday,
	toDateKey,
	weekRange,
	weekRangeMonday,
} from '../date'

describe('toDateKey / parseDateKey', () => {
	it('formats a local date as YYYY-MM-DD', () => {
		expect(toDateKey(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05')
	})

	it('zero-pads month and day', () => {
		expect(toDateKey(new Date(2026, 8, 9, 12, 0, 0))).toBe('2026-09-09')
	})

	it('round-trips through addDays without drifting across DST', () => {
		// US DST starts 2026-03-08. Pinning to noon keeps the day stable.
		expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
		expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
	})
})

describe('addDays', () => {
	it('moves forward and backward across month and year boundaries', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
	})

	it('handles a leap day', () => {
		// 2028 is a leap year.
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
		expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
	})
})

describe('daysBetween', () => {
	it('counts whole days, signed', () => {
		expect(daysBetween('2026-01-01', '2026-01-04')).toBe(3)
		expect(daysBetween('2026-01-04', '2026-01-01')).toBe(-3)
		expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0)
	})
})

describe('dateRange', () => {
	it('returns ascending keys ending at the anchor', () => {
		expect(dateRange(3, '2026-01-05')).toEqual(['2026-01-03', '2026-01-04', '2026-01-05'])
	})
})

describe('startOfWeek / weekRange', () => {
	it('anchors weeks to Sunday', () => {
		// 2026-01-04 is a Sunday, 2026-01-06 a Tuesday.
		expect(startOfWeek('2026-01-06')).toBe('2026-01-04')
		expect(startOfWeek('2026-01-04')).toBe('2026-01-04')
	})

	it('returns seven consecutive days Sun→Sat', () => {
		expect(weekRange('2026-01-06')).toEqual([
			'2026-01-04',
			'2026-01-05',
			'2026-01-06',
			'2026-01-07',
			'2026-01-08',
			'2026-01-09',
			'2026-01-10',
		])
	})
})

describe('startOfWeekMonday / weekRangeMonday', () => {
	it('anchors weeks to Monday', () => {
		// 2026-01-05 is a Monday, 2026-01-07 a Wednesday.
		expect(startOfWeekMonday('2026-01-07')).toBe('2026-01-05')
		expect(startOfWeekMonday('2026-01-05')).toBe('2026-01-05')
	})

	it('treats Sunday as the END of its week, not the start of the next', () => {
		// The regression this guards: deriving Monday as `addDays(startOfWeek(k), 1)`
		// lands on NEXT Monday when k is itself a Sunday.
		expect(startOfWeekMonday('2026-01-11')).toBe('2026-01-05') // Sunday
		expect(startOfWeekMonday('2026-01-04')).toBe('2025-12-29') // Sunday
	})

	it('returns seven consecutive days Mon→Sun', () => {
		expect(weekRangeMonday('2026-01-07')).toEqual([
			'2026-01-05',
			'2026-01-06',
			'2026-01-07',
			'2026-01-08',
			'2026-01-09',
			'2026-01-10',
			'2026-01-11',
		])
	})

	it('never starts after the date it is given', () => {
		for (let offset = 0; offset < 14; offset += 1) {
			const key = addDays('2026-01-01', offset)
			expect(startOfWeekMonday(key) <= key).toBe(true)
		}
	})
})

describe('startOfMonth / monthRange', () => {
	it('finds the first of the month', () => {
		expect(startOfMonth('2026-01-17')).toBe('2026-01-01')
	})

	it('covers every day of the month', () => {
		const january = monthRange('2026-01-17')
		expect(january).toHaveLength(31)
		expect(january[0]).toBe('2026-01-01')
		expect(january[30]).toBe('2026-01-31')
	})

	it('handles February in a leap year', () => {
		expect(monthRange('2028-02-10')).toHaveLength(29)
	})

	it('handles February in a non-leap year', () => {
		expect(monthRange('2026-02-10')).toHaveLength(28)
	})
})
