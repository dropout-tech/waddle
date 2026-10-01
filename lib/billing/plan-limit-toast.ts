import { toast } from 'sonner'
import { t } from '@/lib/i18n'
import { planLimitMessage, type PlanLimitCode } from './plan-errors'

/** Gentle toast + "了解 Pro" action that opens the membership page. */
export function showPlanLimitToast(code: PlanLimitCode, opts: { id?: string | number } = {}) {
  toast.error(planLimitMessage(code), {
    id: opts.id,
    duration: 8000,
    action: {
      label: t('了解 Pro'),
      // Full navigation: this runs outside React (hooks / editor callbacks),
      // and trailingSlash keeps the path valid in the Capacitor static export.
      onClick: () => {
        window.location.assign(new URL('/membership/', window.location.origin).href)
      },
    },
  })
}
