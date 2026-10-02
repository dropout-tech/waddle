/**
 * What the penguin says at the igloo (paired 繁中 / English, like
 * lib/pet/lines.ts). Pure — shared by the igloo scene and the native widget
 * payload (lib/widgets/pet.ts), so it can't go through the React `t()`.
 *
 * Tone (DESIGN.md 不催促): warm, never guilt. Waiting lines never mention
 * how long you were gone and always say nothing was lost.
 */
import type { IglooMood, IglooState } from './compute'

type Lang = 'zh-TW' | 'en'
type Pair = [zh: string, en: string]

const MOOD_LINES: Record<IglooMood | 'fresh' | 'quietToday', Pair[]> = {
  fresh: [
    ['冰屋的地基畫好了。你做完一件事，我就搬一塊冰磚。', 'The igloo\'s outline is drawn. Every time you finish something, I carry one ice brick.'],
  ],
  building: [
    ['今天搬了 {today} 塊，這座還差 {left} 塊。', '{today} bricks today. {left} more to finish this one.'],
    ['冰磚 +{today}，今天的手感不錯。', '+{today} bricks today. Nice and steady.'],
    ['我把今天的 {today} 塊排好了，歪了一點，但很可愛。', 'I lined up today\'s {today} bricks. Slightly crooked, very cute.'],
  ],
  quietToday: [
    ['今天還沒有新冰磚，慢慢來就好。', 'No new bricks yet today. No rush.'],
    ['我先把昨天的冰磚擦亮，等你。', 'I\'m polishing yesterday\'s bricks while I wait.'],
    ['這座還差 {left} 塊，不急，冰不會跑掉。', '{left} bricks to go on this one. No hurry, ice doesn\'t run off.'],
  ],
  proud: [
    ['蓋好了！這是我們的第 {built} 座冰屋。', 'Done! That\'s our igloo number {built}.'],
    ['第 {built} 座冰屋完工，我在門口站了好一下。', 'Igloo number {built} is finished. I stood at the door admiring it for a while.'],
  ],
  waiting: [
    ['我坐在雪地裡等你，冰磚都還在，一塊也沒少。', 'I\'m sitting in the snow waiting for you. Every brick is still here.'],
    ['回來就好。冰屋好好的，我們慢慢繼續。', 'Good to see you. The igloo is just fine; we can pick up whenever.'],
    ['我幫冰屋掃了雪，等你一起蓋下一塊。', 'I swept the snow off the igloo. Ready for the next brick whenever you are.'],
  ],
  sleeping: [
    ['（呼……）冰屋明天再蓋，先睡吧。', '(zzz…) The igloo can wait till tomorrow. Time to sleep.'],
    ['（打呵欠）今天的冰磚我都收好了，晚安。', '(yawn) I put today\'s bricks away. Good night.'],
  ],
}

/** Small stable hash so a given day shows the same line (no flicker on re-render). */
function pick<T>(list: T[], seed: string): T {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return list[(h >>> 0) % list.length]
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** The penguin's one line about today, for the igloo scene and the widget. */
export function iglooLine(state: IglooState, lang: Lang, seed = ''): string {
  let key: keyof typeof MOOD_LINES = state.mood
  if (state.mood === 'building') {
    if (state.totalBricks === 0) key = 'fresh'
    else if (state.bricksToday === 0) key = 'quietToday'
  }
  const pair = pick(MOOD_LINES[key], `${key}:${seed}`)
  const text = lang === 'en' ? pair[1] : pair[0]
  return fill(text, {
    today: state.bricksToday,
    left: state.bricksPerIgloo - state.bricksInCurrent,
    built: state.completedIgloos,
    total: state.totalBricks,
  })
}

/** The catch-up line after the brick replay. */
export function catchUpLine(n: number, lang: Lang, firstVisit: boolean): string {
  if (firstVisit) {
    return lang === 'en'
      ? `Everything you've finished so far became ${n} ice ${n === 1 ? 'brick' : 'bricks'}. I built them in.`
      : `你之前做完的事，變成了 ${n} 塊冰磚，我都蓋上去了。`
  }
  return lang === 'en'
    ? `While you were away, I carried ${n} ${n === 1 ? 'brick' : 'bricks'} for you.`
    : `你不在的時候，我幫你搬了 ${n} 塊。`
}

/** Shown the moment a whole igloo is finished during the replay. */
export function iglooDoneLine(built: number, lang: Lang): string {
  return lang === 'en' ? `Igloo number ${built} is done!` : `第 ${built} 座冰屋蓋好了！`
}
