import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../../app.json';

it('uses the branded native splash contract', () => {
  expect(app.expo.plugins).toContainEqual([
    'expo-splash-screen',
    expect.objectContaining({
      backgroundColor: '#146B52',
      image: './assets/images/splash-icon.png',
      imageWidth: 220,
      resizeMode: 'contain',
    }),
  ]);
  expect(existsSync(resolve(process.cwd(), 'assets/images/splash-icon.png'))).toBe(true);
});
