/**
 * Roles and permissions for Sleek staff. Least privilege: each role sees only the
 * modules it needs, and every action is checked again when it runs.
 */

export type Perm =
  | 'overview.view'
  | 'jobs.view'
  | 'users.view'
  | 'users.suspend'
  | 'users.pii'
  | 'verify.view'
  | 'verify.decide'
  | 'services.view'
  | 'products.moderate'
  | 'orders.manage'
  | 'disputes.view'
  | 'disputes.resolve'
  | 'support.view'
  | 'support.reply'
  | 'safety.view'
  | 'safety.manage'
  | 'screening.review'
  | 'finance.view'
  | 'finance.refund'
  | 'finance.approve'
  | 'config.view'
  | 'config.edit'
  | 'integrations.view'
  | 'admins.manage'
  | 'audit.view'
  | 'audit.undo';

export type RoleKey = 'super_admin' | 'ops_manager' | 'support_agent' | 'verification_officer' | 'screening_reviewer' | 'finance' | 'trust_safety' | 'marketing' | 'analyst';

export const ALL_PERMS: Perm[] = [
  'overview.view', 'jobs.view', 'users.view', 'users.suspend', 'users.pii', 'verify.view', 'verify.decide', 'services.view', 'products.moderate', 'orders.manage',
  'disputes.view', 'disputes.resolve', 'support.view', 'support.reply', 'safety.view', 'safety.manage', 'screening.review', 'finance.view', 'finance.refund',
  'finance.approve', 'config.view', 'config.edit', 'integrations.view', 'admins.manage', 'audit.view', 'audit.undo',
];

export const ROLES: Record<RoleKey, { label: string; summary: string; perms: Perm[] }> = {
  super_admin: { label: 'Super Admin', summary: 'Everything, including settings, staff and roles.', perms: ALL_PERMS },
  ops_manager: {
    label: 'Ops Manager',
    summary: 'Jobs, people, Sleek Services, disputes. No money settings.',
    perms: ['overview.view', 'jobs.view', 'users.view', 'users.suspend', 'verify.view', 'services.view', 'products.moderate', 'orders.manage', 'disputes.view', 'disputes.resolve', 'support.view', 'safety.view', 'config.view', 'integrations.view', 'audit.view', 'audit.undo'],
  },
  support_agent: { label: 'Support Agent', summary: 'Support inbox, read-only jobs and orders.', perms: ['overview.view', 'jobs.view', 'users.view', 'services.view', 'support.view', 'support.reply', 'disputes.view'] },
  verification_officer: { label: 'Verification Officer', summary: 'Audits identity and skill checks. Nothing else.', perms: ['verify.view', 'verify.decide', 'users.view'] },
  screening_reviewer: { label: 'Screening Reviewer', summary: 'Blocked contact-sharing attempts only.', perms: ['screening.review', 'safety.view'] },
  finance: { label: 'Finance', summary: 'Sleek Hold, revenue, refunds and approvals.', perms: ['overview.view', 'jobs.view', 'services.view', 'disputes.view', 'finance.view', 'finance.refund', 'finance.approve', 'config.view', 'audit.view'] },
  trust_safety: {
    label: 'Trust & Safety',
    summary: 'Safety alerts, suspensions, screening, listings.',
    perms: ['overview.view', 'users.view', 'users.suspend', 'users.pii', 'verify.view', 'verify.decide', 'services.view', 'products.moderate', 'disputes.view', 'safety.view', 'safety.manage', 'screening.review', 'audit.view', 'audit.undo'],
  },
  marketing: { label: 'Marketing', summary: 'Totals and the Sleek Services catalogue. No personal data.', perms: ['overview.view', 'services.view'] },
  analyst: { label: 'Analyst (read-only)', summary: 'Dashboards and totals only.', perms: ['overview.view', 'finance.view'] },
};

export const can = (role: RoleKey | undefined, p: Perm) => !!role && ROLES[role].perms.includes(p);

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  /** sha256(email:password), never the password itself. */
  passwordHash: string;
  /** sha256(email:pin:PIN) */
  pinHash: string;
  disabled?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

const t0 = new Date(Date.now() - 90 * 86_400_000).toISOString();
export const SEED_ADMINS: AdminUser[] = [
  { id: 'adm_super', name: 'Tolu Adebayo', email: 'super@sleek.demo', role: 'super_admin', passwordHash: '975bd9136cae3f9ad5fba3af494738d99463fce9657b587d5f3d46b3e11990f3', pinHash: '7f791e8aa38125c98d2d7c29efc3f82e85c9856cf067472b053005384bfc07bb', createdAt: t0 },
  { id: 'adm_ops', name: 'Kunle Bakare', email: 'ops@sleek.demo', role: 'ops_manager', passwordHash: '654aa586c8cd8cb6dc72c9e57f517795dcf3ce06da05e983492a5124a9c1dd78', pinHash: 'b91305a2034c52e308dbc0e2fba70256e45de1f01494ba2e9c4a6623759a5aa8', createdAt: t0 },
  { id: 'adm_support', name: 'Zainab Yusuf', email: 'support@sleek.demo', role: 'support_agent', passwordHash: 'd1efea2ba0569998194ade8248e326882edf60c7f27978297b24fae00f99f9f8', pinHash: 'f10440c1aa29a7917ed77f6d7b728a2b3b8304f82afc10cacb33cae8cd8a8976', createdAt: t0 },
  { id: 'adm_verify', name: 'Chinedu Eze', email: 'verify@sleek.demo', role: 'verification_officer', passwordHash: 'b1467b572718de1100187334648061c6d2baa937d993c288639cb347dc8a2ff4', pinHash: '7236e9ef569ef5d50e8dfb72248c0e215de87fff94e7a8097c29e5f59658b367', createdAt: t0 },
  { id: 'adm_screen', name: 'Halima Sani', email: 'screening@sleek.demo', role: 'screening_reviewer', passwordHash: '7c47fc2ea4dd766c19a03875cf522b271c7798050b30c2a79ca3cfe31844725c', pinHash: 'f4052c50fb3b77f1c0169f5fc86eff9641266dbde4b734307d43c81376d81842', createdAt: t0 },
  { id: 'adm_finance', name: 'Ifeoma Nwosu', email: 'finance@sleek.demo', role: 'finance', passwordHash: '341ed46036220279b0d7cffbb6180bb161ba4352d9d1303ee18ebde70481a368', pinHash: 'd1833be484667aaadf51484428fba6754083676aa40d62a547e2cf6dc831fcb9', createdAt: t0 },
  { id: 'adm_safety', name: 'Segun Afolabi', email: 'safety@sleek.demo', role: 'trust_safety', passwordHash: '7101f5f83c4c174d56099510288d06accf1ee3885d5a3f71a6afef5514612f3f', pinHash: '5ed83debc17001b66c45a6539d70ce920165d59a0b911d53502f17016773297f', createdAt: t0 },
  { id: 'adm_marketing', name: 'Bisola Ade', email: 'marketing@sleek.demo', role: 'marketing', passwordHash: '6ed07bda43b2110701ceb4efb47d5c5b524da0894275e2ee1f5b7dc62c052769', pinHash: '7a044833982239e7b1efeb5d8b3c64bc78766424e60337e7d845f0425a6a9f93', createdAt: t0 },
  { id: 'adm_analyst', name: 'Musa Ibrahim', email: 'analyst@sleek.demo', role: 'analyst', passwordHash: '81c7f2dc5e1f5133913a428ecd72fe5c5b7b791e9819e182c6b9d030312ba8a5', pinHash: 'c76914b6ed58bc2ea7c2e223f530115196cf7d9cb9903955e7c1271a9cfed0e2', createdAt: t0 },
];

/** Refunds at or above this amount need a second admin (maker-checker). */
export const REFUND_APPROVAL_THRESHOLD = 50_000;
export const MAX_LOGIN_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;
export const IDLE_MINUTES = 15;
export const SESSION_HOURS = 8;
