/**
 * Jest config for the Lumo app.
 *
 * `jest-expo` wires up the React Native / Expo module mocks. The nested
 * `habit-journey/` folder is a separate Vite web app and is excluded.
 */
module.exports = {
	preset: 'jest-expo',
	// Only *.test.* files are suites — shared fixtures can live in __tests__ too.
	testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
	testPathIgnorePatterns: ['/node_modules/', '/habit-journey/', '/.expo/'],
	transformIgnorePatterns: [
		'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@kingstinct/react-native-healthkit|react-native-health-connect|react-native-nitro-modules|react-native-maps|iconsax-react-native|nativewind|react-native-css-interop)',
	],
	collectCoverageFrom: ['lib/**/*.ts', 'constants/**/*.ts', '!**/node_modules/**'],
}
