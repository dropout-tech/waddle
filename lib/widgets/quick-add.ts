/**
 * 快速新增任務 (home-screen widget → components/widgets/quick-add-sheet.tsx):
 * turn what was typed / pasted into the box into the list of task titles to
 * create. The sheet creates one task per returned title, in order, and creates
 * nothing when the list is empty.
 *
 * Kept as its own tiny pure function on purpose — the owner decides the real
 * rules later (split pasted lines? strip "- " bullets? one task per sentence?),
 * and this is the only place that should change when he does.
 *
 * Current rule: the whole box is ONE task, surrounding whitespace trimmed,
 * inner line breaks kept as typed. Blank / whitespace-only input → no tasks.
 */
export function quickAddTitles(raw: string): string[] {
  const t = raw.trim()
  return t ? [t] : []
}
