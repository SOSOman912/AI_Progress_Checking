export type ProjectStandard = 'HKSMM4' | 'CESMM';

export interface ProjectRecord {
  id: string;
  name: string;
  number: string;
  description: string;
  standard: ProjectStandard;
  createdAt: number;
}

const STORAGE_KEY = 'apc.projects.v1';

export const SEED_PROJECTS: ProjectRecord[] = [
  {
    id: 'p-tank',
    name: 'ND201801 Tank STM',
    number: 'ND201801-BK-ST-NC-TANK_STM-300',
    description: 'Structural concrete tank package',
    standard: 'HKSMM4',
    createdAt: Date.UTC(2026, 10, 13)
  },
  {
    id: 'p-rc-frame',
    name: 'KT-2026-01 RC Frame',
    number: 'BK-KT-2026-01',
    description: 'Reinforced concrete frame and basement',
    standard: 'HKSMM4',
    createdAt: Date.UTC(2026, 10, 9)
  },
  {
    id: 'p-drainage',
    name: 'CESMM4 Drainage Upgrade',
    number: 'CE-2026-014',
    description: 'Site drainage and external works',
    standard: 'CESMM',
    createdAt: Date.UTC(2026, 9, 28)
  }
];

const isProject = (value: unknown): value is ProjectRecord => {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<ProjectRecord>;
  return (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.number === 'string' &&
    typeof project.description === 'string' &&
    (project.standard === 'HKSMM4' || project.standard === 'CESMM') &&
    typeof project.createdAt === 'number'
  );
};

export const loadProjects = (): ProjectRecord[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_PROJECTS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return SEED_PROJECTS;
    const projects = parsed.filter(isProject);
    return projects.length ? projects : SEED_PROJECTS;
  } catch {
    return SEED_PROJECTS;
  }
};

export const saveProjects = (projects: ProjectRecord[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    return;
  }
};
