import type { ProjectData } from './demo';

export type AccessRole = 'qs' | 'member' | 'admin';

export interface Permissions {
  role: AccessRole;
  canViewMoney: boolean;
}

export function loadPermissions(): Permissions {
  const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('apc.role')) || 'qs';
  const role: AccessRole = stored === 'member' || stored === 'admin' ? stored : 'qs';
  return { role, canViewMoney: role !== 'member' };
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
