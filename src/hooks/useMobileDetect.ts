import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'travel-mobile-mode';

interface UseMobileDetectReturn {
  isMobile: boolean;
  toggleMobile: () => void;
  manualOverride: boolean | null; // null = auto, true = forced mobile, false = forced desktop
}

export function useMobileDetect(): UseMobileDetectReturn {
  const [matchesMedia, setMatchesMedia] = useState(() => {
    return window.matchMedia('(max-width: 768px)').matches;
  });

  const [manualOverride, setManualOverride] = useState<boolean | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
    return null;
  });

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setMatchesMedia(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const toggleMobile = useCallback(() => {
    setManualOverride(prev => {
      const current = prev ?? matchesMedia;
      const next = !current;
      if (next === matchesMedia) {
        // Matches auto-detect, clear override
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, [matchesMedia]);

  const isMobile = manualOverride ?? matchesMedia;

  return { isMobile, toggleMobile, manualOverride };
}
