import type { Task } from './types'

/** Fullwidth vertical bar the user types by hand to separate category from task. */
export const CATEGORY_PREFIX_SEPARATOR = '｜'

/**
 * The title to show for a task in read-only surfaces (primarily the calendar).
 *
 * When `showCategoryPrefix` is on, the task's category name is prepended as
 * "分類｜標題" so a glance at a calendar event reveals which category it
 * belongs to — the calendar otherwise only conveys time. The top-level
 * workspace (company) name is deliberately excluded.
 *
 * This is display-only: the stored `task.title` is never modified, so the
 * detail-modal title input stays editable as the clean title and renaming a
 * category re-decorates every event without rewriting data. Per the user's
 * choice we always prepend (no dedupe against a manually-typed prefix) — old
 * tasks that already embed the category are cleaned up by the user.
 *
 * Accepts a loose shape so transient drag previews (which may only carry
 * `title`/`categoryName`) can use it too.
 */
export function taskDisplayTitle(
  task: Pick<Task, 'title'> & { categoryName?: string },
  showCategoryPrefix: boolean,
): string {
  const category = task.categoryName?.trim()
  if (!showCategoryPrefix || !category) return task.title
  return `${category}${CATEGORY_PREFIX_SEPARATOR}${task.title}`
}
