'use client';

import type { CaseId, RequestPhase, ViewMode } from '@/types/covenant';
import { create } from 'zustand';

interface CovenantUiState {
  view: ViewMode;
  selectedCase: CaseId;
  phase: RequestPhase;
  setView: (view: ViewMode) => void;
  setSelectedCase: (selectedCase: CaseId) => void;
  setPhase: (phase: RequestPhase) => void;
}

export const useCovenantStore = create<CovenantUiState>((set) => ({
  view: 'company',
  selectedCase: 'round-1-pass',
  phase: 'idle',
  setView: (view) => set({ view }),
  setSelectedCase: (selectedCase) => set({ selectedCase, phase: 'idle' }),
  setPhase: (phase) => set({ phase }),
}));
