import type { ProjectData } from './demo';
import { STORAGE_KEYS, readRaw, writeRaw } from '../data/storage';

export type AccessRole = 'qs' | 'member' | 'admin';

export interface Permissions {
  role: AccessRole;
  canViewMoney: boolean;
}

export function loadPermissions(): Permissions {
  const stored = readRaw(STORAGE_KEYS.role) || 'qs';
  const role: AccessRole =
    stored === 'member' || stored === 'admin' ? stored : 'qs';
  return { role, canViewMoney: role !== 'member' };
}

export function saveAccessRole(role: AccessRole): boolean {
  return writeRaw(STORAGE_KEYS.role, role);
}

export function withMoneyPermission(data: ProjectData, canViewMoney: boolean): ProjectData {
  if (canViewMoney) return data;
  return {
    ...data,
    bill: {
      ...data.bill,
      lines: data.bill.lines.map(line =>
        line.type === 'item' ? { ...line, rate: undefined } : line
      )
    }
  };
}
