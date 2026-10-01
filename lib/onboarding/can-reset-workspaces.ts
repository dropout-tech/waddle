// Safety check for the onboarding "apply template / start blank" step, which
// deletes every workspace (and, by cascade, every task) before rebuilding.
//
// Rule: the wipe is allowed only when every task in the account is an
// untouched demo task (the ones lib/supabase/seed.ts plants at signup) — that
// is exactly the content this step exists to clear. Any user-made or edited
// task, or any uncertainty (query error, unknown count), means "don't touch
// the data".
//
// Dependency-free on purpose so scripts/verify-onboarding-guard.mjs can import
// it directly; callers inject the demo data and the translator.

type DemoWorkspaceLike = { categories: { tasks: { title: string }[] }[] }
type Translate = (lang: 'zh-TW' | 'en', text: string) => string

export type DemoTaskInfo = {
  /** Every title a seeded demo task can have, in both languages. */
  titles: ReadonlySet<string>
  /** How many demo tasks seed.ts creates (the most a fresh account can hold). */
  count: number
}

/** Derive the demo-task fingerprint from the real demo data (no hard-coded list). */
export function collectDemoTaskInfo(
  demoWorkspaces: readonly DemoWorkspaceLike[],
  translateFor: Translate,
): DemoTaskInfo {
  const titles = new Set<string>()
  let count = 0
  for (const ws of demoWorkspaces) {
    for (const cat of ws.categories) {
      for (const task of cat.tasks) {
        count += 1
        // seed.ts writes t(task.title) in whatever language was active.
        titles.add(task.title)
        titles.add(translateFor('zh-TW', task.title))
        titles.add(translateFor('en', task.title))
      }
    }
  }
  return { titles, count }
}

export type ServerTaskTitles = {
  data: { title: string }[] | null
  count: number | null
  error: unknown
}

/** Pure rule: are these titles all untouched demo tasks (and not too many)? */
export function areAllUntouchedDemoTasks(titles: readonly string[], demo: DemoTaskInfo): boolean {
  return titles.length <= demo.count && titles.every((title) => demo.titles.has(title))
}

export async function canResetWorkspaces(opts: {
  demo: DemoTaskInfo
  /** Titles of tasks already loaded in local state. */
  localTaskTitles: readonly string[]
  /**
   * Server lookup of the account's tasks (RLS scopes it to the user). Callers
   * must cap it at `demo.count + 1` rows, e.g.
   * `select('title', { count: 'exact' }).limit(demo.count + 1)`.
   */
  fetchServerTasks: () => PromiseLike<ServerTaskTitles>
}): Promise<boolean> {
  if (!areAllUntouchedDemoTasks(opts.localTaskTitles, opts.demo)) return false
  try {
    const { data, count, error } = await opts.fetchServerTasks()
    if (error || count === null || count === undefined || !data) return false
    if (count > opts.demo.count || data.length !== count) return false
    return areAllUntouchedDemoTasks(
      data.map((row) => row.title),
      opts.demo,
    )
  } catch {
    return false
  }
}
