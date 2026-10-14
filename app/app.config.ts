// Nuxt UI theme defaults. The rules behind them are in docs/design.md.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'crimson',
      error: 'crimson',
      success: 'emerald',
      warning: 'amber',
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
    // The title holds the logo next to the site name, so center them.
    header: { slots: { title: 'items-center gap-2.5' } },
    // Selection is state, not an action, so tabs stay neutral.
    tabs: { defaultVariants: { color: 'neutral' } },
    input: { defaultVariants: { size: 'xl' } },
    select: { defaultVariants: { size: 'xl' } },
    selectMenu: { defaultVariants: { size: 'xl' } },
    inputMenu: { defaultVariants: { size: 'xl' } },
    textarea: { defaultVariants: { size: 'xl' } },
  },
});
