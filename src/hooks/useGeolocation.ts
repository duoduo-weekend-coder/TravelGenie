import { useState, useEffect, useCallback, useRef } from 'react';

interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

interface UseGeolocationReturn {
  position: Position | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

const ERROR_MESSAGES: Record<number, string> = {
  1: 'Location permission denied. Please allow location access in your browser settings.',
  2: 'Location unavailable. Make sure GPS is enabled on your device.',
  3: 'Location request timed out. Please try again.',
};

export function useGeolocation(enabled: boolean): UseGeolocationReturn {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    setPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    });
    setError(null);
    setLoading(false);
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    setError(ERROR_MESSAGES[err.code] || 'Unable to get your location.');
    setLoading(false);
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setLoading(true);
    setError(null);

    // Fast initial fix
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    });

    // Background updates (low accuracy, 2min cache to save battery)
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 120000,
      }
    );
  }, [handleSuccess, handleError]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      startTracking();
    } else {
      stopTracking();
    }
    return stopTracking;
  }, [enabled, startTracking, stopTracking]);

  const refresh = useCallback(() => {
    stopTracking();
    setPosition(null);
    startTracking();
  }, [stopTracking, startTracking]);

  return { position, error, loading, refresh };
}
