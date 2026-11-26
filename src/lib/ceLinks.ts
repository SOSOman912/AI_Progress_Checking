/**
 * Backwards-compatible façade for CE links.
 *
 * The implementation (storage + derived money) now lives in `src/data/ce.ts`,
 * which is the single source of CE amounts. This file only keeps the historical
 * import path and the demo item list used by pickers.
 */

import { demoData } from './demo';
import {
  ceAmountByItem,
  ceLinkTarget,
  linksForActivity,
  linksForBq,
  linksForTarget,
  loadBqOptions,
  loadCeLinks,
  loadPricingOptions,
  removeCeLink,
  saveCeLink,
  type CeLink,
  type CeTargetType
} from '../data/ce';
import type { DocumentOption } from '../data/documents';

export type BqOption = DocumentOption;

export interface BqItemOption {
  id: string;
  no: string;
  label: string;
  unit: string;
  qty: number;
  rate: number | null;
  ce: number;
}

export type { CeLink, CeTargetType, DocumentOption };

export {
  ceAmountByItem,
  ceLinkTarget,
  linksForActivity,
  linksForBq,
  linksForTarget,
  loadBqOptions,
  loadCeLinks,
  loadPricingOptions,
  removeCeLink,
  saveCeLink
};

/**
 * Demo BQ items used by CE / mapping pickers.
 * NOTE: this is sample data, not the imported BQ. Replace with document items when
 * the import parser lands.
 */
export const BQ_ITEMS: BqItemOption[] = demoData.bill.lines
  .filter(line => line.type === 'item')
  .map(line => ({
    id: line.id,
    no: line.no ?? '',
    label: line.label,
    unit: line.unit ?? '',
    qty: line.override ?? line.contractQty ?? 0,
    rate: line.rate ?? null,
    ce: Number(line.ce) || 0
  }));
