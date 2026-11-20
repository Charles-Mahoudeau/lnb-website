const KEY = 'lnb_admin_folds';

type Group = 'events' | 'minecraft';

/**
 * Which sidebar groups are open. Both start open. Each browser remembers its choice in
 * localStorage, read after mount so server and client render the same first.
 */
export function useAdminFold() {
  const open = useState<Record<Group, boolean>>('admin-folds', () => ({
    events: true,
    minecraft: true,
  }));

  onMounted(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<
        Record<Group, unknown>
      >;
      for (const group of ['events', 'minecraft'] as const) {
        if (typeof stored[group] === 'boolean') open.value[group] = stored[group];
      }
    } catch {
      // Storage blocked or unreadable: the groups stay open.
    }
  });

  function set(group: Group, value: boolean) {
    open.value[group] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(open.value));
    } catch {
      // Not remembered, still works.
    }
  }

  return { open, set };
}
