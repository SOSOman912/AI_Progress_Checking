import type { ElementData } from './demo';
import type { MappingScenario } from './mappingScenarios';

export type ProgressBand = 'red' | 'amber' | 'green';
export type ActivityStatus = 'ahead' | 'on-track' | 'behind';

export interface MappingElementResult {
  el: ElementData;
  progress: number;
  band: ProgressBand;
  activityId: string;
}

export interface ProgrammeActivity {
  id: string;
  code: string;
  name: string;
  start: string;
  end: string;
  startISO: string;
  endISO: string;
  lateStartISO: string;
  lateEndISO: string;
  delayDays: number;
  plannedPct: number;
  actualPct: number;
  elementIds: string[];
  elementCount: number;
  status: ActivityStatus;
}

export interface MappingResult {
  elements: MappingElementResult[];
  activities: ProgrammeActivity[];
  overall: number;
  counts: Record<ProgressBand, number>;
}

export const BAND_LABEL: Record<ProgressBand, string> = {
  red: 'Under 50%',
  amber: '50–90%',
  green: 'Above 90%'
};

export const BAND_COLOR: Record<ProgressBand, string> = {
  red: '#e4665f',
  amber: '#e3a53a',
  green: '#4faa6a'
};

export const BAND_HEX: Record<ProgressBand, number> = {
  red: 0xe4665f,
  amber: 0xe3a53a,
  green: 0x4faa6a
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const BAND_BASE = [38, 62, 81, 94, 47, 73, 55, 98, 68, 44, 86, 52];

const STATUS_OF = (actual: number, planned: number): ActivityStatus =>
  actual - planned >= 5 ? 'ahead' : actual - planned <= -5 ? 'behind' : 'on-track';

export const bandOf = (progress: number): ProgressBand =>
  progress < 50 ? 'red' : progress <= 90 ? 'amber' : 'green';

const ACTIVITY_START_ISO = [
  '2026-08-01',
  '2026-09-15',
  '2026-11-01',
  '2026-12-05',
  '2027-01-10',
  '2027-02-10'
];
const ACTIVITY_END_ISO = [
  '2026-09-30',
  '2026-11-10',
  '2026-12-15',
  '2027-01-20',
  '2027-02-20',
  '2027-03-20'
];
const ACTIVITY_DELAY = [0, 3, 5, 2, 8, 4];
const ACTIVITY_PLANNED = [100, 100, 80, 55, 30, 15];

export const formatIsoDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const activityName = (level: string) =>
  /^L0*0$/i.test(level) ? 'Foundation & substructure' : `Superstructure — ${level}`;

/**
 * Demo result: point-cloud comparison progress per element, plus the
 * master-programme activities when a programme document is linked.
 */
export function buildMappingResult(
  scenario: MappingScenario,
  sourceElements: ElementData[],
  hasProgramme = false
): MappingResult {
  const seed = hashString(`${scenario.id}:${scenario.type}`);
  const levels = [
    ...new Set(sourceElements.map(element => element.level).filter(Boolean))
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const levelIndex = new Map(levels.map((level, index) => [level, index]));

  const elements: MappingElementResult[] = sourceElements.map((el, index) => {
    const progress = Math.min(
      100,
      Math.max(6, BAND_BASE[index % BAND_BASE.length] + (seed % 7) - 3)
    );
    const position = el.level ? levelIndex.get(el.level) ?? 0 : 0;
    return {
      el,
      progress,
      band: bandOf(progress),
      activityId: hasProgramme ? `a${position + 1}` : ''
    };
  });

  const totalVolume = elements.reduce(
    (sum, element) => sum + Math.max(0.001, element.el.vol),
    0
  );
  const overall = Math.round(
    elements.reduce(
      (sum, element) => sum + element.progress * Math.max(0.001, element.el.vol),
      0
    ) / (totalVolume || 1)
  );

  const activities: ProgrammeActivity[] = [];
  if (hasProgramme) {
    levels.forEach((level, index) => {
      const members = elements.filter(element => element.activityId === `a${index + 1}`);
      const actualPct = members.length
        ? Math.round(members.reduce((sum, element) => sum + element.progress, 0) / members.length)
        : 0;
      const plannedPct = ACTIVITY_PLANNED[Math.min(index, ACTIVITY_PLANNED.length - 1)];
      const startISO = ACTIVITY_START_ISO[Math.min(index, ACTIVITY_START_ISO.length - 1)];
      const endISO = ACTIVITY_END_ISO[Math.min(index, ACTIVITY_END_ISO.length - 1)];
      const delayDays = ACTIVITY_DELAY[Math.min(index, ACTIVITY_DELAY.length - 1)];
      activities.push({
        id: `a${index + 1}`,
        code: `A${1010 + index * 10}`,
        name: activityName(level),
        start: formatIsoDay(startISO),
        end: formatIsoDay(endISO),
        startISO,
        endISO,
        lateStartISO: addDays(startISO, delayDays),
        lateEndISO: addDays(endISO, delayDays),
        delayDays,
        plannedPct,
        actualPct,
        elementIds: members.map(element => element.el.id),
        elementCount: members.length,
        status: STATUS_OF(actualPct, plannedPct)
      });
    });

    activities.push({
      id: 'handover',
      code: 'A1990',
      name: 'Structural completion & handover',
      start: formatIsoDay('2026-12-16'),
      end: formatIsoDay('2027-01-30'),
      startISO: '2026-12-16',
      endISO: '2027-01-30',
      lateStartISO: addDays('2026-12-16', 6),
      lateEndISO: addDays('2027-01-30', 6),
      delayDays: 6,
      plannedPct: 0,
      actualPct: overall,
      elementIds: elements.map(element => element.el.id),
      elementCount: elements.length,
      status: STATUS_OF(overall, 0)
    });
  }

  const counts: Record<ProgressBand, number> = {
    red: elements.filter(element => element.band === 'red').length,
    amber: elements.filter(element => element.band === 'amber').length,
    green: elements.filter(element => element.band === 'green').length
  };

  return { elements, activities, overall, counts };
}
