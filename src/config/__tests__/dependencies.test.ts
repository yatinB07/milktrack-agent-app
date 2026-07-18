const packageJson = require('../../../package.json') as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

it.each([
  '@expo/ui',
  'expo-device',
  'expo-font',
  'expo-glass-effect',
  'expo-image',
  'expo-symbols',
  'expo-web-browser',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-worklets',
])('does not install unused direct dependency %s', (dependency) => {
  expect({ ...packageJson.dependencies, ...packageJson.devDependencies }).not.toHaveProperty(dependency);
});
