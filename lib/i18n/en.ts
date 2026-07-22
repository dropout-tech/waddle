import { dict as appShell } from './dict/app-shell'
import { dict as taskPanel } from './dict/task-panel'
import { dict as calendar } from './dict/calendar'
import { dict as timer } from './dict/timer'
import { dict as notebook } from './dict/notebook'
import { dict as modals } from './dict/modals'
import { dict as misc } from './dict/misc'
import { dict as reports } from './dict/reports'
import { dict as dataLayer } from './dict/data-layer'
import { dict as growth } from './dict/growth'

// Merged English dictionary. Keys are the Traditional Chinese source strings
// (see lib/i18n/index.ts). Split by feature area purely to keep files
// reviewable; duplicate keys across fragments are harmless as long as the
// translations agree.
export const en: Record<string, string> = {
  ...appShell,
  ...taskPanel,
  ...calendar,
  ...timer,
  ...notebook,
  ...modals,
  ...misc,
  ...reports,
  ...dataLayer,
  ...growth,
}
