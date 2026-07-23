import * as Location from 'expo-location';

export async function captureOptionalLocation(enabled: boolean) {
  if (!enabled) return undefined;

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return undefined;

    const result = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      5_000,
    );
    return {
      latitude: result.coords.latitude,
      longitude: result.coords.longitude,
    };
  } catch {
    return undefined;
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Location timed out')),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
