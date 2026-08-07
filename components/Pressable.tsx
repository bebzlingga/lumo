import React from 'react'
import { Pressable as RNPressable, type PressableProps, type PressableStateCallbackType } from 'react-native'

/**
 * Drop-in replacement for React Native's `Pressable`.
 *
 * WHY THIS EXISTS
 * NativeWind registers `cssInterop(Pressable, { className: "style" })`, which
 * runs on EVERY Pressable — there is no bail-out when `className` is absent.
 * The interop rebuilds the `style` prop by walking it as data, so a
 * function-valued style gets collected into the style array rather than left
 * as a function. React Native only calls `style` when it is literally a
 * function, so once it is nested in an array it is never invoked and the whole
 * returned style is silently dropped.
 *
 * The symptom is a component that renders with NO styling at all — it has bitten
 * this codebase twice (the onboarding "Get Started" button, then the habits
 * tabs and "Add Habit" button).
 *
 * The fix: resolve the callback here, so what reaches the interop is always a
 * plain style value. Press state is tracked locally rather than read from RN,
 * which keeps the public API and the layout identical — no wrapper view.
 *
 * Import this instead of `Pressable` from 'react-native'.
 */
export function Pressable({ style, children, onPressIn, onPressOut, ...rest }: PressableProps) {
	const [pressed, setPressed] = React.useState(false)
	// Cast because the resolved RN types disagree on this shape across
	// platforms (web adds `hovered`); only `pressed` is ever set natively.
	const state = { pressed, hovered: false, focused: false } as unknown as PressableStateCallbackType

	return (
		<RNPressable
			{...rest}
			onPressIn={(event) => {
				setPressed(true)
				onPressIn?.(event)
			}}
			onPressOut={(event) => {
				setPressed(false)
				onPressOut?.(event)
			}}
			style={typeof style === 'function' ? style(state) : style}
		>
			{typeof children === 'function' ? children(state) : children}
		</RNPressable>
	)
}
