/**
 * Role -> CSS class. Kept out of Field.tsx so that file only exports a
 * component (fast refresh needs that), and so the field markers and the
 * assignment list are guaranteed to read from the same mapping.
 */
import type { Role } from '../field/assignment';

export const ROLE_CLASS: Record<Role['kind'], string> = {
  primary: 'role-primary',
  cutoff: 'role-cut',
  relay: 'role-cut',
  trail: 'role-cut',
  cover: 'role-cover',
  backupBase: 'role-backup',
  backupFielder: 'role-backup',
  chase: 'role-primary',
  rotate: 'role-cut',
  watch: 'role-watch',
};
