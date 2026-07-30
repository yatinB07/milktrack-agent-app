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
  expect(require('../../../assets/images/splash-icon.png')).toBeTruthy();
});
