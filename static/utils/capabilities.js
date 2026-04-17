/**
 * Shared capability constants and helpers.
 * Used by UserModal, SettingsView (SSO default capabilities), etc.
 */

// Must match server/modules/userManager.js ALL_CAPABILITIES
export const ALL_CAPABILITIES = [
  'search', 'add_downloads', 'remove_downloads', 'pause_resume',
  'assign_categories', 'move_files', 'rename_files', 'set_comment',
  'manage_categories',
  'view_history', 'clear_history', 'view_shared', 'view_uploads',
  'view_statistics', 'view_logs', 'view_servers',
  'view_all_downloads', 'edit_all_downloads'
];

export const CAPABILITY_LABELS = {
  search: 'Search indexers',
  add_downloads: 'Add downloads',
  remove_downloads: 'Remove downloads',
  pause_resume: 'Pause / resume',
  assign_categories: 'Assign categories',
  move_files: 'Move files',
  rename_files: 'Rename files',
  set_comment: 'Set rating & comment',
  manage_categories: 'Manage categories',
  view_history: 'View history',
  clear_history: 'Clear history',
  view_shared: 'View shared files',
  view_uploads: 'View uploads',
  view_statistics: 'View statistics',
  view_logs: 'View logs',
  view_servers: 'Manage ED2K servers',
  view_all_downloads: "View all users' downloads",
  edit_all_downloads: "Edit all users' downloads"
};

export const CAPABILITY_GROUPS = [
  { label: 'Downloads', caps: ['search', 'add_downloads', 'remove_downloads', 'pause_resume', 'assign_categories', 'move_files', 'rename_files', 'set_comment'] },
  { label: 'System', caps: ['manage_categories', 'view_history', 'view_logs', 'clear_history', 'view_servers'] },
  { label: 'Viewing', caps: ['view_shared', 'view_uploads', 'view_statistics'] },
  { label: 'Multi-User', caps: ['view_all_downloads', 'edit_all_downloads'] }
];

export const PRESETS = {
  full: ALL_CAPABILITIES.slice(),
  readonly: ['search', 'view_history', 'view_shared', 'view_uploads', 'view_statistics', 'view_logs', 'view_all_downloads']
};

// SSO + history-import default capabilities. Frontend mirror — must match
// SSO_EXCLUDED_CAPABILITIES in server/modules/userManager.js.
const SSO_EXCLUDED = ['edit_all_downloads', 'manage_categories', 'view_servers', 'view_logs'];
export const SSO_DEFAULT_CAPABILITIES = ALL_CAPABILITIES.filter(c => !SSO_EXCLUDED.includes(c));

export function detectPreset(caps) {
  if (!caps || caps.length === 0) return 'custom';
  const sorted = [...caps].sort();
  const fullSorted = [...PRESETS.full].sort();
  const roSorted = [...PRESETS.readonly].sort();
  if (sorted.length === fullSorted.length && sorted.every((c, i) => c === fullSorted[i])) return 'full';
  if (sorted.length === roSorted.length && sorted.every((c, i) => c === roSorted[i])) return 'readonly';
  return 'custom';
}
