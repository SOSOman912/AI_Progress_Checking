import { useCallback, useEffect, useState } from 'react';
import { projectStorageKey } from './projectStorage';

/**
 * Project-level pricing decision taken during BQ / Activity Schedule import.
 * `quantity-only` means rates and amounts were not imported, so every money
 * column across all tables must be hidden.
 */
export type PricingMode = 'priced' | 'quantity-only';

const STORAGE_BASE = 'apc.pricing-mode.v1';
const EVENT_NAME = 'apc:pricing-mode';

export const PRICING_MODE_INFO: Record<
  PricingMode,
  { label: string; description: string }
> = {
  priced: {
    label: 'Import prices',
    description: 'Import quantities, rates and amounts.'
  },
  'quantity-only': {
    label: 'Quantity only',
    description: 'Import quantities only — all money columns are removed.'
  }
};

export const loadPricingMode = (projectId?: string): PricingMode => {
  try {
    const raw = window.localStorage.getItem(
      projectStorageKey(STORAGE_BASE, projectId)
    );
    return raw === 'quantity-only' ? 'quantity-only' : 'priced';
  } catch {
    return 'priced';
  }
};

export const savePricingMode = (mode: PricingMode, projectId?: string) => {
  try {
    window.localStorage.setItem(
      projectStorageKey(STORAGE_BASE, projectId),
      mode
    );
  } catch {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: { projectId: projectId ?? 'unassigned', mode }
      })
    );
  } catch {
    return;
  }
};

export const showPricingFor = (mode: PricingMode): boolean =>
  mode === 'priced';

export const usePricingMode = (
  projectId?: string
): [PricingMode, (mode: PricingMode) => void] => {
  const [mode, setMode] = useState<PricingMode>(() =>
    loadPricingMode(projectId)
  );

  useEffect(() => {
    setMode(loadPricingMode(projectId));
    const sync = () => setMode(loadPricingMode(projectId));
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', sync);
    };
  }, [projectId]);

  const update = useCallback(
    (next: PricingMode) => {
      savePricingMode(next, projectId);
      setMode(next);
    },
    [projectId]
  );

  return [mode, update];
};
