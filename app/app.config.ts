// Nuxt UI theme defaults. The rules behind them are in docs/design.md.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'crimson',
      error: 'crimson',
      success: 'emerald',
      warning: 'amber',
      secondary: 'dusk',
      neutral: 'night',
    },
    button: {
      compoundVariants: [
        {
          // `primary` is tuned for red text, so the solid fill uses the darker action color.
          color: 'primary',
          variant: 'solid',
          class:
            'bg-action text-on-action hover:bg-action-hover active:bg-action-hover disabled:bg-action aria-disabled:bg-action',
        },
        {
          // One step above cards, so neutral buttons stay visible on a surface.
          color: 'neutral',
          variant: 'soft',
          class:
            'bg-accented hover:bg-accented/75 active:bg-accented/75 disabled:bg-accented aria-disabled:bg-accented',
        },
      ],
      defaultVariants: { size: 'xl' },
    },
    badge: {
      slots: { base: 'rounded-full' },
      variants: {
        size: {
          xs: { base: 'rounded-full' },
          sm: { base: 'rounded-full' },
          md: { base: 'rounded-full' },
          lg: { base: 'rounded-full' },
          xl: { base: 'rounded-full' },
        },
      },
    },
    card: {
      // Fills over borders: cards sit on a surface step, not inside an outline.
      variants: { variant: { soft: { root: 'bg-elevated' } } },
      defaultVariants: { variant: 'soft' },
    },
    // Checked controls use the action fill, like the main button.
    checkbox: {
      variants: { color: { primary: { indicator: 'bg-action text-on-action' } } },
    },
    switch: {
      variants: { color: { primary: { base: 'data-[state=checked]:bg-action' } } },
    },
    // The admin sidebar is a surface step beside the page, not a bordered column.
    dashboardSidebar: {
      slots: { root: 'bg-elevated' },
      variants: { side: { left: { root: 'border-e-0' } } },
    },
    dashboardNavbar: { slots: { root: 'border-b-0' } },
    // The title holds the logo next to the site name, so center them.
    header: { slots: { title: 'items-center gap-2.5' } },
    // A dropdown sits in a wrapper as wide as the menu, so a short menu would squeeze it and cut
    // off its right edge. Keep it at its own width.
    // The current page is state, not an action, so it's marked with the second accent.
    // Dropdown icons sit on a tinted tile, drawn by `after:` since an icon can't hold a background.
    navigationMenu: {
      slots: {
        viewport: 'shrink-0',
        childLink:
          'after:absolute after:top-0.5 after:left-1.5 after:-z-1 after:size-8 after:rounded-md after:bg-secondary/15',
      },
      variants: {
        // Room between the tile and the label, set here since the orientation sets its own gap.
        orientation: { horizontal: { childLink: 'gap-4' } },
        active: {
          true: { childLinkIcon: 'text-secondary' },
          false: { childLinkIcon: 'text-secondary group-hover:text-secondary' },
        },
      },
      defaultVariants: { color: 'secondary', highlightColor: 'secondary' },
    },
    // Selection is state, not an action: the selected tab gets a soft second-accent tint.
    tabs: {
      compoundVariants: [
        {
          color: 'secondary',
          variant: 'pill',
          class: {
            indicator: 'bg-secondary/15',
            trigger: 'data-[state=active]:text-secondary',
          },
        },
      ],
      defaultVariants: { color: 'secondary' },
    },
    input: { defaultVariants: { size: 'xl' } },
    select: { defaultVariants: { size: 'xl' } },
    selectMenu: { defaultVariants: { size: 'xl' } },
    inputMenu: { defaultVariants: { size: 'xl' } },
    textarea: { defaultVariants: { size: 'xl' } },
    // Used for 6-digit link codes: larger boxes than other controls, so each digit reads at a glance.
    pinInput: {
      variants: { size: { xl: { base: 'h-14 w-11 text-2xl font-semibold tabular-nums sm:w-12' } } },
      defaultVariants: { size: 'xl' },
    },
  },
});
