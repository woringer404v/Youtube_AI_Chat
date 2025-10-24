// src/app/_context/scope-context.tsx
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type ScopeMode = 'all' | 'subset';

// Define the shape of our context data
interface ScopeContextType {
  scopedVideos: string[]; // An array of selected video IDs
  setScopedVideos: (videos: string[]) => void;
  scopeMode: ScopeMode; // 'all' or 'subset'
  setScopeMode: (mode: ScopeMode) => void;
  allVideos: string[]; // All available video IDs
  setAllVideos: (videos: string[]) => void;
}

// Create the context with a default value
const ScopeContext = createContext<ScopeContextType | undefined>(undefined);

// Create a provider component that will wrap our app
export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scopedVideos, setScopedVideos] = useState<string[]>([]);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [allVideos, setAllVideos] = useState<string[]>([]);

  return (
    <ScopeContext.Provider value={{
      scopedVideos,
      setScopedVideos,
      scopeMode,
      setScopeMode,
      allVideos,
      setAllVideos
    }}>
      {children}
    </ScopeContext.Provider>
  );
}

// Create a custom hook for easy access to the context
export function useScope() {
  const context = useContext(ScopeContext);
  if (context === undefined) {
    throw new Error('useScope must be used within a ScopeProvider');
  }
  return context;
}