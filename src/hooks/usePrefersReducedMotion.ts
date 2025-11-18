import { useEffect } from 'react';
import useMediaQuery from './useMediaQuery';

export const usePrefersReducedMotion = (): boolean => {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-motion', prefersReducedMotion ? 'reduce' : 'full');
  }, [prefersReducedMotion]);

  return prefersReducedMotion;
};

export default usePrefersReducedMotion;

