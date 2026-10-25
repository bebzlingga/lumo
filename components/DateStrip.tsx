import type { ScrollViewInstance } from "react-native";
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { fontFamilies, layout, radius, spacing } from '@/constants/theme'
import { useLumo } from '@/context/LumoContext'
import { alpha } from '@/lib/color'
import { monthRange, parseDateKey, toDateKey } from '@/lib/date'
import { completionCount, isDoneOnDate, isScheduledOnDate } from '@/lib/habitMath'
import { Habit } from '@/types/habit'
import { AppText } from './ui'
import { Pressable } from '@/components/Pressable'

const ITEM_GAP = 4
const DATE_CARD_WIDTH = 44
const DATE_CARD_STEP = DATE_CARD_WIDTH + ITEM_GAP

type DateItem = {
	dateKey: string
	disabled: boolean
}

type DateProgressStatus = 'none' | 'complete' | 'partial' | 'incomplete'

function getDateProgressStatus(habits: Habit[], dateKey: string, todayKey: string): DateProgressStatus {
	if (dateKey > todayKey) {
		return 'none'
	}

	const scheduledHabits = habits.filter((habit) => isScheduledOnDate(habit, dateKey))

	if (scheduledHabits.length === 0) {
		return 'none'
	}

	const completedCount = scheduledHabits.filter((habit) => isDoneOnDate(habit, dateKey)).length
	const startedCount = scheduledHabits.filter((habit) => completionCount(habit, dateKey) > 0).length

	if (completedCount === scheduledHabits.length) {
		return 'complete'
	}

	if (startedCount > 0) {
		return 'partial'
	}

	return 'incomplete'
}

const statusLabel: Record<DateProgressStatus, string> = {
	none: 'No scheduled habits',
	complete: 'Complete',
	partial: 'Partial',
	incomplete: 'Incomplete',
}

export function DateStrip({
	habits,
	selectedDateKey,
	onSelectDate,
}: {
	habits: Habit[]
	selectedDateKey: string
	onSelectDate: (dateKey: string) => void
}) {
	const { isDark, palette } = useLumo()
	const scrollRef = useRef<ScrollViewInstance>(null)
	const [scrollerWidth, setScrollerWidth] = useState(0)
	const todayKey = toDateKey()
	const selectedBorder = isDark ? palette.greenSoft : palette.greenDark
	const statusGreen = isDark ? palette.greenDark : palette.greenDark
	const noStatusColor = isDark ? palette.surfaceStrong : palette.subtle
	const disabledText = alpha(palette.subtle, isDark ? '5C' : '66')
	const selectedText = palette.onGreen
	const statusColors: Record<DateProgressStatus, string> = {
		none: 'transparent',
		complete: statusGreen,
		partial: palette.danger,
		incomplete: palette.danger,
	}
	const dates = useMemo<DateItem[]>(() => {
		return monthRange(todayKey).map((dateKey) => {
			return {
				dateKey,
				disabled: dateKey > todayKey,
			}
		})
	}, [todayKey])
	const todayIndex = dates.findIndex((date) => date.dateKey === todayKey)

	useEffect(() => {
		if (todayIndex < 0 || scrollerWidth <= 0) {
			return
		}

		const frame = requestAnimationFrame(() => {
			const contentWidth = dates.length * DATE_CARD_WIDTH + Math.max(0, dates.length - 1) * ITEM_GAP + spacing.lg * 2
			const centeredOffset = spacing.lg + todayIndex * DATE_CARD_STEP + DATE_CARD_WIDTH / 2 - scrollerWidth / 2
			const maxOffset = Math.max(0, contentWidth - scrollerWidth)
			const scrollX = Math.min(Math.max(0, centeredOffset), maxOffset)

			scrollRef.current?.scrollTo({
				x: scrollX,
				animated: false,
			})
		})

		return () => cancelAnimationFrame(frame)
	}, [dates.length, scrollerWidth, todayIndex])

	return (
		<View style={styles.scrollerWrap}>
			<ScrollView
				ref={scrollRef}
				horizontal
				showsHorizontalScrollIndicator={false}
				style={styles.scroller}
				contentContainerStyle={styles.content}
				onLayout={(event) => setScrollerWidth(event.nativeEvent.layout.width)}
			>
				{dates.map(({ dateKey, disabled: isFutureDate }) => {
					const date = parseDateKey(dateKey)
					const isSelected = dateKey === selectedDateKey
					const isToday = dateKey === todayKey
					const progressStatus = getDateProgressStatus(habits, dateKey, todayKey)
					// Future dates and past dates with no scheduled habits are inactive.
					const disabled = isFutureDate || (dateKey < todayKey && progressStatus === 'none')
					const progressColor = statusColors[progressStatus]
					const displayProgressColor = isToday ? statusGreen : progressColor
					const selectedCardColor = isToday || (isDark && progressStatus === 'complete')
						? selectedBorder
						: progressStatus === 'none'
							? noStatusColor
							: displayProgressColor
					const dateTextColor = isSelected ? selectedText : disabled ? disabledText : progressStatus === 'none' ? (isToday ? statusGreen : disabledText) : displayProgressColor
					const selectedFillColor = isDark ? palette.greenDark : selectedCardColor
					const cardBorderColor = isSelected ? selectedFillColor : dateTextColor
					const lightBorderColor = cardBorderColor
					const completedBackgroundColor = isDark ? alpha(statusGreen, '14') : alpha(palette.greenSoft, '45')
					const missedBackgroundColor = alpha(palette.danger, isDark ? '14' : '0D')
					const accessibilityStatusLabel = isFutureDate ? 'Future date' : disabled ? 'No scheduled habits' : statusLabel[progressStatus]
					const dayLabel = date.toLocaleDateString(undefined, { weekday: 'short' })
					const dayNumber = String(date.getDate()).padStart(2, '0')

					return (
						<Pressable
							key={dateKey}
							disabled={disabled}
							onPress={() => onSelectDate(dateKey)}
							accessibilityRole='button'
							accessibilityState={{ selected: isSelected, disabled }}
							accessibilityLabel={`${dayLabel} ${dayNumber}, ${accessibilityStatusLabel}`}
							style={({ pressed }) => [
								styles.item,
								{
									opacity: pressed ? 0.72 : 1,
								},
							]}
						>
							<View
								style={[
									styles.dateCard,
									isSelected ? styles.selectedDateCard : null,
										disabled ? styles.disabledDateCard : null,
									{
										backgroundColor: isSelected
											? selectedFillColor
											: progressStatus === 'complete'
												? completedBackgroundColor
												: progressStatus === 'partial' || progressStatus === 'incomplete'
													? missedBackgroundColor
													: 'transparent',
										borderColor: lightBorderColor,
										borderBottomColor: lightBorderColor,
										borderBottomWidth: !isSelected && progressStatus === 'complete' ? 3 : isSelected ? 1 : 2,
										shadowColor: isSelected ? palette.shadow : 'transparent',
									},
								]}
							>
								<AppText
									variant='titleSmall'
									color={dateTextColor}
									style={styles.dayNumber}
								>
									{dayNumber}
								</AppText>
								<AppText
									variant='caption'
									color={dateTextColor}
									style={styles.dayLabel}
								>
									{dayLabel}
								</AppText>
							</View>
							<View style={styles.todayMarkerWrap}>
								{isToday ? <View style={[styles.todayDot, { backgroundColor: statusGreen }]} /> : null}
							</View>
						</Pressable>
					)
				})}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	scrollerWrap: {
		alignItems: 'center',
		alignSelf: 'stretch',
		marginHorizontal: -layout.screenPaddingX,
		paddingTop: spacing.sm,
		paddingBottom: spacing.sm,
	},
	scroller: {
		alignSelf: 'stretch',
		width: '100%',
	},
	content: {
		flexDirection: 'row',
		gap: ITEM_GAP,
		paddingHorizontal: spacing.lg,
	},
	item: {
		width: DATE_CARD_WIDTH,
		minHeight: 78,
		alignItems: 'center',
		borderRadius: radius.lg,
	},
	dateCard: {
		width: DATE_CARD_WIDTH,
		minHeight: 58,
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: radius.lg,
		borderWidth: 1,
		borderBottomWidth: 1,
		paddingVertical: spacing.xs,
	},
	selectedDateCard: {
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.06,
		shadowRadius: 8,
		elevation: 2,
	},
	disabledDateCard: {
		opacity: 0.6,
	},
	dayLabel: {
		width: '100%',
		textAlign: 'center',
		fontFamily: fontFamilies.lexendSemiBold,
		fontSize: 10,
		lineHeight: 13,
	},
	dayNumber: {
		width: '100%',
		textAlign: 'center',
		fontFamily: fontFamilies.lexendBold,
		fontSize: 15,
		lineHeight: 19,
	},
	todayDot: {
		width: 12,
		height: 4,
		borderRadius: radius.xs,
	},
	todayMarkerWrap: {
		width: DATE_CARD_WIDTH,
		height: 4,
		marginTop: 9,
		alignItems: 'center',
	},
})
