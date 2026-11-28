import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from './shims/async-storage';
import { type AdminUser, type RoleKey, SEED_ADMINS } from './rbac';

/** Admin console state: staff accounts, sign-in protection, the audit log and approvals. Kept apart from app data. */

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  actorRole: RoleKey;
  op: string;
  summary: string;
  target?: string;
  reason?: string;
  /** How to reverse it, if it can be reversed. */
  undo?: { op: string; args: Record<string, unknown>; label: string };
  undoneAt?: string;
  undoneBy?: string;
  /** Set on entries that undo an earlier one. */
  undoes?: string;
}

export interface Approval {
  id: string;
  op: string;
  args: Record<string, unknown>;
  summary: string;
  amount: number;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export interface AdminSession {
  adminId: string;
  startedAt: number;
  lastActiveAt: number;
}

interface ConsoleState {
  admins: AdminUser[];
  audit: AuditEntry[];
  approvals: Approval[];
  lockouts: Record<string, { failures: number; lockedUntil?: number }>;
  session: AdminSession | null;
  hydrated: boolean;
}

export const useConsole = create<ConsoleState>()(
  persist(
    (): ConsoleState => ({ admins: SEED_ADMINS, audit: [], approvals: [], lockouts: {}, session: null, hydrated: false }),
    {
      name: 'sleek-admin-console',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ admins: s.admins, audit: s.audit, approvals: s.approvals, lockouts: s.lockouts, session: s.session }) as unknown as ConsoleState,
      onRehydrateStorage: () => () => useConsole.setState({ hydrated: true }),
    },
  ),
);

let n = 0;
export const cid = (p: string) => `${p}_${Date.now().toString(36)}${(n++).toString(36)}`;

export async function sha256(text: string): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('This browser cannot run the secure sign-in check. Use an up-to-date browser over HTTPS.');
}

export function currentAdmin(): AdminUser | undefined {
  const s = useConsole.getState();
  return s.session ? s.admins.find((a) => a.id === s.session!.adminId) : undefined;
}

export function writeAudit(e: Omit<AuditEntry, 'id' | 'at'>) {
  const entry: AuditEntry = { ...e, id: cid('aud'), at: new Date().toISOString() };
  useConsole.setState((s) => ({ audit: [entry, ...s.audit].slice(0, 1000) }));
  return entry;
}

// Another tab (or the app on the same site) changed something: reload.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'sleek-admin-console') void useConsole.persist.rehydrate();
  });
}
