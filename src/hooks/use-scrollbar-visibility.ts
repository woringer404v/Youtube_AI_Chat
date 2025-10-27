// src/hooks/use-scrollbar-visibility.ts
'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook to show scrollbar only while actively scrolling
 * Adds 'is-scrolling' class during scroll and removes it after inactivity
 */
export function useScrollbarVisibility<T extends HTMLElement>() {
  const elementRef = useRef<T>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleScroll = () => {
      // Add scrolling class
      element.classList.add('is-scrolling');

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Remove scrolling class after 1 second of inactivity
      scrollTimeoutRef.current = setTimeout(() => {
        element.classList.remove('is-scrolling');
      }, 1000);
    };

    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return elementRef;
}
