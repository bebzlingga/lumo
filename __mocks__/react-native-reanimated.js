/**
 * Reanimated stand-in for Jest. The package's own mock reaches native-only
 * worklet/CSS modules under Reanimated 4, so render tests use this: animations
 * resolve to their end values and animated components are the plain ones.
 * Covers only the APIs the app imports — add one here when a screen starts
 * using another.
 */
const RN = require('react-native')
const identity = (value) => value
const easing = () => identity

module.exports = {
  __esModule: true,
  default: { View: RN.View, Text: RN.Text, ScrollView: RN.ScrollView, Image: RN.Image, createAnimatedComponent: identity },
  useSharedValue: (value) => ({ value }),
  useAnimatedStyle: () => ({}),
  withTiming: identity,
  withSpring: identity,
  withSequence: (...steps) => steps[steps.length - 1],
  withDelay: (_delay, value) => value,
  runOnJS: identity,
  Easing: { linear: identity, ease: identity, quad: identity, cubic: identity, in: easing, out: easing, inOut: easing, bezier: easing }
}
