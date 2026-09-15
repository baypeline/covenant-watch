'use client';

import type { CaseId, RequestPhase } from '@/types/covenant';
import { create } from 'zustand';

interface CovenantUiState {
  selectedCase: CaseId;
  phase: RequestPhase;
  setSelectedCase: (selectedCase: CaseId) => void;
  setPhase: (phase: RequestPhase) => void;
}

export const useCovenantStore = create<CovenantUiState>((set) => ({
  selectedCase: 'round-1-pass',
  phase: 'idle',
  setSelectedCase: (selectedCase) => set({ selectedCase, phase: 'idle' }),
  setPhase: (phase) => set({ phase }),
}));
