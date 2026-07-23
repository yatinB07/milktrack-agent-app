import * as Location from 'expo-location';
import { captureOptionalLocation } from '../location';

jest.mock(
  'expo-location',
  () => ({
    Accuracy: { Balanced: 3 },
    requestForegroundPermissionsAsync: jest.fn(),
    getCurrentPositionAsync: jest.fn(),
  }),
  { virtual: true },
);

const mockRequestForegroundPermissionsAsync =
  Location.requestForegroundPermissionsAsync as jest.Mock;
const mockGetCurrentPositionAsync =
  Location.getCurrentPositionAsync as jest.Mock;

beforeEach(() => {
  mockRequestForegroundPermissionsAsync.mockReset();
  mockGetCurrentPositionAsync.mockReset();
  jest.useRealTimers();
});

it('does not request permission when location is disabled', async () => {
  await expect(captureOptionalLocation(false)).resolves.toBeUndefined();
  expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

it('returns no coordinates when permission is denied', async () => {
  mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

  await expect(captureOptionalLocation(true)).resolves.toBeUndefined();
  expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
});

it('returns no coordinates when the sensor fails', async () => {
  mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockGetCurrentPositionAsync.mockRejectedValue(new Error('sensor unavailable'));

  await expect(captureOptionalLocation(true)).resolves.toBeUndefined();
});

it('returns no coordinates when the sensor times out', async () => {
  jest.useFakeTimers();
  mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockGetCurrentPositionAsync.mockReturnValue(new Promise(() => undefined));

  const location = captureOptionalLocation(true);
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(5_000);

  await expect(location).resolves.toBeUndefined();
});

it('returns the complete coordinate pair on success', async () => {
  mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockGetCurrentPositionAsync.mockResolvedValue({
    coords: { latitude: 19.076, longitude: 72.8777 },
  });

  const result = await captureOptionalLocation(true);

  expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(mockGetCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 3 });
  expect(result).toEqual({
    latitude: 19.076,
    longitude: 72.8777,
  });
});
