// Pure helpers for picking where a task should land when the user didn't
// explicitly choose a category (quick-add, calendar drag-create,
// promote-from-scratchpad, etc). No React dependency so they're trivially
// unit-testable and safe to call from any layer.
//
// Two levels, deliberately kept separate:
//
// - `resolveDefaultCategory(workspace, enabled)` — WORKSPACE-scoped. Use it
//   when the caller already knows which workspace the task belongs to (e.g.
//   a calendar slot type bound to a workspace). Answers "which category
//   inside THIS workspace".
// - `resolveGlobalDefaultCategory(workspaces, enabled)` — GLOBAL. Use it
//   when there is no workspace context at all (quick-add, calendar click on
//   empty space, promote-from-scratchpad). Answers "the 未分類 bucket", i.e.
//   the workspace flagged `isDefault` and its default category.
//
// `sortWorkspacesForDisplay` is the single sorting rule for every list of
// workspaces shown to the user: 未分類 pinned first, everyone else by
// sortOrder.
import type { Workspace, Category } from '@/lib/types'

/**
 * Icon for the global 未分類 workspace. Kept next to the resolver so every
 * creation path (signup seed, onboarding reset, SQL migration) uses the same
 * value — the SQL copy in supabase/migrations/20260810130000_default_workspace.sql
 * is maintained by hand and must match.
 */
export const UNCATEGORIZED_WORKSPACE_ICON = '📥'

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

/**
 * The user's global "未分類" (Uncategorized) workspace, if it exists.
 *
 * Returns `undefined` for legacy data (pre-migration) or if the user somehow
 * deleted it — callers must handle that, see `resolveGlobalDefaultCategory`.
 * Never throws.
 */
export function resolveDefaultWorkspace(
  workspaces: Workspace[] | undefined | null
): Workspace | undefined {
  return (workspaces ?? []).find((w) => w.isDefault && !w.isArchived)
}

/**
 * Where a task created with NO workspace/category context should land.
 *
 * - `defaultCategoryEnabled` true → the 未分類 workspace's default category
 *   (or, if none is flagged, its first non-archived category).
 * - No 未分類 workspace (legacy/deleted data) or the setting is off → fall
 *   back to the first non-archived workspace's first non-archived category,
 *   i.e. exactly the pre-未分類 behavior.
 *
 * Returns `undefined` when the account has no usable category anywhere.
 * Never throws.
 */
export function resolveGlobalDefaultCategory(
  workspaces: Workspace[] | undefined | null,
  defaultCategoryEnabled: boolean
): { workspace: Workspace; category: Category } | undefined {
  const list = workspaces ?? []

  if (defaultCategoryEnabled) {
    const defaultWs = resolveDefaultWorkspace(list)
    if (defaultWs) {
      const category = resolveDefaultCategory(defaultWs, true)
      if (category) return { workspace: defaultWs, category }
      // 未分類 workspace exists but has no usable category — fall through
      // rather than blocking task creation entirely.
    }
  }

  for (const workspace of list) {
    if (workspace.isArchived) continue
    const category = resolveDefaultCategory(workspace, defaultCategoryEnabled)
    if (category) return { workspace, category }
  }

  return undefined
}

/**
 * Display order for any user-facing list of workspaces: the 未分類 bucket
 * is pinned to the top, everything else keeps its sortOrder. Returns a new
 * array (never mutates the input).
 */
export function sortWorkspacesForDisplay<T extends Pick<Workspace, 'isDefault' | 'sortOrder'>>(
  workspaces: T[]
): T[] {
  return [...workspaces].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
}
