// Pure helper for picking which category a task should land in when the
// user didn't explicitly choose one (quick-add, calendar drag-create,
// promote-from-scratchpad, etc). No React dependency so it's trivially
// unit-testable and safe to call from any layer.
import type { Workspace, Category } from '@/lib/types'

/**
 * Resolve the category a new task should default into for `workspace`.
 *
 * - `defaultCategoryEnabled` true → prefer the workspace's category with
 *   `isDefault === true` (that isn't archived). If none is marked default
 *   (e.g. it was deleted, or this is pre-migration/legacy data), fall back
 *   to the first non-archived category.
 * - `defaultCategoryEnabled` false → always use the first non-archived
 *   category, ignoring any `isDefault` flag.
 *
 * Returns `undefined` if the workspace has no usable (non-archived)
 * category at all. Never throws.
 */
export function resolveDefaultCategory(
  workspace: Pick<Workspace, 'categories'> | undefined | null,
  defaultCategoryEnabled: boolean
): Category | undefined {
  const categories = workspace?.categories ?? []
  const activeCategories = categories.filter((c) => !c.isArchived)

  if (defaultCategoryEnabled) {
    const marked = activeCategories.find((c) => c.isDefault)
    if (marked) return marked
  }

  return activeCategories[0]
}
