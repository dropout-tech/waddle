/**
 * Shared look of the AI screens (consent, report viewer): a centred dialog on
 * desktop, a full-screen takeover on phones (mobile-ux §4: forms and
 * multi-step reading flows are never small centred modals on a phone).
 * Applied on top of DialogContent, so these override its defaults.
 */
export const AI_SHEET_CLASS = [
  'flex flex-col gap-0 p-0 overflow-hidden',
  // phone: edge-to-edge, dynamic viewport height, respects the notch
  'max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0',
  'max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0',
  // desktop / tablet
  'sm:max-h-[88vh] sm:max-w-xl',
].join(' ')

/** 44px minimum touch target, quiet icon button used in sheet headers. */
export const AI_ICON_BUTTON_CLASS =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50 touch-manipulation'
