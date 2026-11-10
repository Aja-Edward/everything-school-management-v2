// The roles POST /api/auth/admins/ accepts. A section admin sees and manages
// only their section; the server sets the section from the role.
export const ADMIN_ROLE_OPTIONS = [
  { value: 'admin', label: 'School Admin', hint: 'Every section, and school settings' },
  { value: 'nursery_admin', label: 'Nursery Admin', hint: 'Nursery section only' },
  { value: 'primary_admin', label: 'Primary Admin', hint: 'Primary section only' },
  { value: 'junior_secondary_admin', label: 'Junior Secondary Admin', hint: 'JSS only' },
  { value: 'senior_secondary_admin', label: 'Senior Secondary Admin', hint: 'SSS only' },
  { value: 'secondary_admin', label: 'Secondary Admin', hint: 'JSS and SSS' },
];

// The titles the school's owner may go by. Until they pick one, others see
// "Proprietor/Proprietress" in place of their name.
export const OWNER_TITLE_OPTIONS = ['Proprietor', 'Proprietress'];

// "primary_admin" → "Primary Admin". The owner is the one superadmin a
// school has, made when it registered.
export const adminRoleLabel = (role: string) =>
  role === 'superadmin'
    ? 'Owner'
    : ADMIN_ROLE_OPTIONS.find(option => option.value === role)?.label ?? role;
