// src/app/_context/model-context.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

// Available Anthropic models
export const AVAILABLE_MODELS = {
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
  'claude-3-haiku-20240307': 'Claude 3 Haiku',
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;

interface ModelContextType {
  selectedModelId: ModelId;
  setSelectedModelId: (modelId: ModelId) => void;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [selectedModelId, setSelectedModelId] = useState<ModelId>('claude-3-haiku-20240307');

  return (
    <ModelContext.Provider value={{ selectedModelId, setSelectedModelId }}>
      {children}
    </ModelContext.Provider>
  );
}

export function useModel() {
  const context = useContext(ModelContext);
  if (context === undefined) {
    throw new Error('useModel must be used within a ModelProvider');
  }
  return context;
}
