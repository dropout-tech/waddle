'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Barlow_Condensed, Noto_Sans_TC } from 'next/font/google'
import { ArrowDown, ArrowRight, CalendarDays, CalendarClock, Users, CheckSquare2, ChevronDown, Download, NotebookPen, Play, Timer } from 'lucide-react'
import { setLang } from '@/lib/i18n'
import { FeatureFilm } from './feature-film'
import styles from './marketing-page.module.css'

const display = Noto_Sans_TC({ weight: '900', subsets: ['latin'], display: 'swap', preload: false, variable: '--poster-zh' })
const condensed = Barlow_Condensed({ weight: '800', subsets: ['latin'], display: 'swap', variable: '--poster-en' })
const release = 'https://github.com/dropout-tech/waddle/releases/tag/v0.1.2-beta.1'
const download = (arch: string) => `https://github.com/dropout-tech/waddle/releases/download/v0.1.2-beta.1/Huddle-0.1.2-mac-${arch}.dmg`
const copy = {
  zh: {
    nav: ['功能', '方案', '下載', '使用協助'], login: '登入', start: '免費開始使用',
    headline: '慢慢搖擺，把事情做完。', sub: '任務、行程、白板。把腦中的大小事，放進同一張工作桌。',
    watch: '看企鵝變個魔法', desktop: '下載桌面測試版', sample: '實際產品畫面・內容為示範資料',
    pillars: [['事情，先記下來。', '任務分進工作區，今天想做的事一眼看見。'], ['時間，留給重要的事。', '把任務拖進行事曆，為工作與休息留一格。'], ['想法，也有地方放。', '白板直接寫，記事本慢慢整理，線索不再散落。']],
    moreTitle: '一起安排，也留住想法。', moreIntro: '自己的步調，和彼此的時間，都能好好放下。', more: [['共享日曆', '用邀請連結與夥伴互看行事曆，把對方開放的行程疊加顯示，安排事情時多一點默契。'], ['約交集時間', '選擇已開放共享的夥伴與時間範圍，系統會比對雙方行程、找出共同空檔，直接建立站內會議邀請。'], ['記事本', '把靈感寫成筆記，用文字格式、檢查清單與圖片整理內容。從零散念頭到完整計畫，留下可以接著寫的地方。']],
    boardTitle: '想法先放下，\n順序慢慢來。', boardBody: '還沒想清楚也沒關係。在白板上直接寫字、放連結、加入檢查清單。需要更多空間時，打開內頁，沿用記事本的編輯工具。',
    boardTabs: ['自由整理', '打開內頁'], boardAlt: ['Huddle 白板：文字與檢查清單放在自由畫布上', 'Huddle 白板內頁：以記事本編輯器延伸內容'],
    boardNote: '白板與內頁都是目前可用的功能；示範內容不會存入你的帳號。',
    focusTitle: '做一件事，\n就好。', focusBody: '用專注計時留住眼前這段時間。計畫改了，就拖動行程；做完了，輕輕勾掉。今天的安排可以跟著你調整。', focusAction: '打開我的工作桌',
    priceTitle: '先用用看。\n找到自己的步調。', priceIntro: '目前核心功能免費開放。Pro 訂閱尚未開放購買，不會自動收費。',
    free: '免費版', freeBody: '任務、行程、專注計時、記事本與白板。同一個帳號，在不同裝置查看與同步。',
    soon: '準備中', month: '／月', year: 'NT$1,290／年', proBody: '這是已規劃的台灣價格。付費功能與額度會在正式開放前說明，目前沒有訂閱或付款按鈕。',
    downloadTitle: '在你的桌面，\n留個位置。', downloadBody: 'Huddle 的獨立視窗，陪你開始每一天。安裝後使用原本的帳號登入，與網頁版共用資料。',
    downloadNote: 'v0.1.2 測試版・需要網路・尚未完成 Apple 公證。Windows x64 測試版未簽署，安裝時可能顯示安全提示。舊版請重新下載安裝。', release: '版本紀錄與安裝說明',
    faqTitle: '你可能想知道', questions: [
      ['可以免費使用嗎？', '可以。目前核心功能免費開放，註冊帳號不會自動收費。Pro 尚未開放購買，正式推出前會公布完整功能與計費方式。'],
      ['桌面版需要網路嗎？', '需要。登入、讀取雲端內容與同步都需要網路。桌面版讓你用獨立視窗開啟 Huddle，並非完全離線版本。'],
      ['Mac 要下載哪一個版本？', 'M 系列晶片請選 Apple Silicon；Intel 處理器請選 Intel。開啟 DMG 後，將 Huddle 拖入「應用程式」。目前是尚未公證的測試版，請詳閱版本紀錄與安裝說明。'],
      ['影片裡的魔法是真實功能嗎？', '企鵝把便條紙收進螢幕是情境示意，不是拍照或自動辨識功能。整理任務、拖曳排程、調整時間、標記完成與專注計時則是產品功能。'],
      ['我的資料會怎麼處理？', '登入帳號後，任務、行程與筆記會透過雲端服務儲存和同步。蒐集用途、分享、保存與刪除說明可在頁尾的隱私說明查看。'],
    ],
    footerLine: '把今天，整理成明天的線索。', legal: ['服務條款', '隱私說明', '取消與退款', '使用協助'], all: '回到頁首',
  },
  en: {
    nav: ['Features', 'Plans', 'Download', 'Support'], login: 'Log in', start: 'Start for free',
    headline: 'Find your rhythm.\nMake things happen.', sub: 'Tasks, calendars and a whiteboard. One workspace for everything on your mind.',
    watch: 'A little penguin magic', desktop: 'Download the desktop beta', sample: 'Actual product interface · demonstration content',
    pillars: [['Get it out of your head.', 'Organize tasks in workspaces and see what matters today.'], ['Make room for what matters.', 'Drag tasks onto your calendar. Leave time for work and a break.'], ['Give ideas a place to grow.', 'Write on the whiteboard, explore in your notebook, and keep the thread.']],
    moreTitle: 'Make plans together. Keep your ideas close.', moreIntro: 'Room for your own rhythm, and the time you share with others.', more: [['Shared calendars', 'Invite someone with a link and view the calendar entries they choose to share alongside your own. Make plans with a clearer picture of each other’s day.'], ['Find a time together', 'Pick shared partners and a date range — Huddle compares your calendars, finds a common opening, and creates an in-app meeting invite.'], ['Notebooks', 'Develop your ideas with formatted text, checklists and images. Keep passing thoughts and detailed plans in a place you can return to.']],
    boardTitle: 'Put the idea down.\nFind the shape later.', boardBody: 'You don’t need a finished thought to begin. Write directly on the whiteboard, add links and checklists, then open an item to develop it with the notebook editor.',
    boardTabs: ['The whiteboard', 'Inside an item'], boardAlt: ['Huddle whiteboard showing text and a checklist on a freeform canvas', 'A whiteboard item opened in the Huddle notebook editor'],
    boardNote: 'Both views show available features. Demonstration content is not added to your account.',
    focusTitle: 'One thing.\nFor now.', focusBody: 'Set aside a little time with the focus timer. Move a time block when plans change. Check a task off when it’s done. Let today’s plan move with you.', focusAction: 'Open my workspace',
    priceTitle: 'Try it first.\nFind your own pace.', priceIntro: 'Core features are free to use today. Pro subscriptions are not available for purchase, and there are no automatic charges.',
    free: 'Free', freeBody: 'Tasks, calendars, focus timers, notebooks and the whiteboard. Use one account to view and sync your work across devices.',
    soon: 'Coming later', month: ' / month', year: 'NT$1,290 / year', proBody: 'These are planned Taiwan prices in New Taiwan dollars. Paid features and limits will be announced before launch. Subscriptions and payments are not enabled.',
    downloadTitle: 'A place\non your desktop.', downloadBody: 'Open Huddle in its own window at the start of your day. Sign in with your existing account to use the same data as the web app.',
    downloadNote: 'v0.1.2 beta · Internet required · Not yet notarized by Apple. Windows x64 beta is unsigned and may show a security warning. Download and reinstall to update an older version.', release: 'Release notes and installation guide',
    faqTitle: 'A few things to know', questions: [
      ['Can I use Huddle for free?', 'Yes. Core features are currently free, and creating an account does not start a paid subscription. Pro is not yet available; complete features and billing details will be published before launch.'],
      ['Does the desktop app need internet access?', 'Yes. Signing in, reading cloud content and syncing require an internet connection. The desktop app gives Huddle its own window; it is not a fully offline version.'],
      ['Which Mac version should I download?', 'Choose Apple Silicon for an M-series Mac, or Intel for an Intel-based Mac. Open the DMG and drag Huddle into Applications. This beta is not yet notarized; read the release notes and installation guide.'],
      ['Is the magic in the film a real feature?', 'The penguin gathering paper notes is a visual metaphor, not camera capture or automatic recognition. Task organization, drag-to-schedule, rescheduling, completion and focus timers are product features.'],
      ['How is my data handled?', 'After you sign in, tasks, calendar entries and notes are stored and synced using cloud services. The Privacy page explains data use, sharing, retention and deletion.'],
    ],
    footerLine: 'A little clarity for today. A thread for tomorrow.', legal: ['Terms of use', 'Privacy', 'Cancellation & refunds', 'Support'], all: 'Back to top',
  },
} as const

// Art-direction sample illustrations (public/art/), used only under html[data-art].
const ART_PILLARS = ['feature-tasks', 'feature-calendar', 'empty-tasks']
const ART_ROWS = ['feature-meeting', 'empty-calendar', 'empty-notes']

export function MarketingPage({ locale = 'zh' }: { locale?: 'zh' | 'en' }) {
  const t = copy[locale]
  const en = locale === 'en'
  const base = en ? '/en' : ''
  const [boardView, setBoardView] = useState(0)
  return (
    <main lang={en ? 'en' : 'zh-Hant'} id="top" className={`${styles.site} ${display.variable} ${condensed.variable} ${en ? styles.english : ''}`}>
      <a className={styles.skip} href="#features">{en ? 'Skip to features' : '跳至功能介紹'}</a>
      <header className={styles.header}>
        <Link href={`${base}/about`} className={styles.brand} aria-label="Huddle">Huddle<span className={styles.brandDot}>.</span></Link>
        <nav aria-label={en ? 'Main navigation' : '主要導覽'} className={styles.nav}>
          {['features', 'pricing', 'download'].map((id, i) => <a key={id} href={`#${id}`}>{t.nav[i]}</a>)}
          <Link href={`${base}/support`}>{t.nav[3]}</Link>
        </nav>
        <div className={styles.headerActions}><Link href={en ? '/about' : '/en/about'} hrefLang={en ? 'zh-Hant' : 'en'} className={styles.language} aria-label={en ? '切換為繁體中文' : 'Switch to English'}>{en ? '繁中' : 'EN'}</Link><Link href="/login" onClick={() => setLang(en ? 'en' : 'zh-TW')} className={styles.login}>{t.login}<ArrowRight size={16} aria-hidden="true" /></Link></div>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <Image src="/marketing/hero-desk-art.webp" alt="" fill priority sizes="100vw" className={`art-hide ${styles.heroArt}`} />
        {/* Art-direction sample (html[data-art] only; lazy + display:none = never fetched otherwise) */}
        <picture className={`art-only ${styles.artHero}`}><source media="(max-width: 760px)" srcSet="/art/hero-mobile.jpg" /><img src="/art/hero-desk.jpg" alt="" loading="lazy" /></picture>
        <div className={styles.heroCopy}>
          <h1 id="hero-title">{en ? t.headline : <>慢慢搖擺，<wbr />把事情做完。</>}</h1>
          <p>{t.sub}</p>
          <div className={styles.heroActions}><Link href="/signup" onClick={() => setLang(en ? 'en' : 'zh-TW')} className={styles.primary}>{t.start}<ArrowRight size={19} aria-hidden="true" /></Link><a href="#feature-film" className={styles.watch}><Play size={16} aria-hidden="true" />{t.watch}</a></div>
        </div>
        <figure className={styles.heroProduct}>
          <div className={styles.monitor}><Image src={`/marketing/workspace-demo${en ? '-en' : ''}.png`} width={1440} height={1000} alt={en ? 'Huddle tasks beside a daily calendar, using demonstration data' : 'Huddle 任務清單與每日行事曆並列，使用示範資料'} priority sizes="(max-width: 600px) 95vw, 74vw" /></div>
          <figcaption>{t.sample}</figcaption>
        </figure>
      </section>

      <section id="features" className={styles.pillars} aria-label={en ? 'What Huddle brings together' : 'Huddle 的三個重點'}>
        {[CheckSquare2, CalendarDays, NotebookPen].map((Icon, i) => <article key={i}><Icon size={32} strokeWidth={1.7} aria-hidden="true" className="art-hide" /><img src={`/art/${ART_PILLARS[i]}.jpg`} alt="" loading="lazy" width={112} height={112} className={`art-only art-illus ${styles.artPillar}`} /><div><h2>{t.pillars[i][0]}</h2><p>{t.pillars[i][1]}</p></div></article>)}
      </section>

      <section className={styles.moreFeatures} aria-labelledby="more-title">
        <div className={styles.sectionIntro}><h2 id="more-title">{t.moreTitle}</h2><p>{t.moreIntro}</p></div>
        <div className={styles.featureRows}>{[Users, CalendarClock, NotebookPen].map((Icon, i) => <article key={t.more[i][0]}><Icon size={30} strokeWidth={1.6} aria-hidden="true" className="art-hide" /><img src={`/art/${ART_ROWS[i]}.jpg`} alt="" loading="lazy" width={96} height={96} className={`art-only art-illus ${styles.artRow}`} /><div><h3>{t.more[i][0]}</h3></div><p>{t.more[i][1]}</p></article>)}</div>
      </section>

      <section className={styles.whiteboard} aria-labelledby="board-title">
        <div className={styles.chapterCopy}><h2 id="board-title">{t.boardTitle}</h2><p>{t.boardBody}</p><div className={styles.tabs} role="tablist" aria-label={en ? 'Whiteboard views' : '白板畫面'}>{t.boardTabs.map((label, i) => <button key={label} id={`board-tab-${i}`} type="button" role="tab" aria-selected={boardView === i} aria-controls="board-panel" tabIndex={boardView === i ? 0 : -1} onClick={() => setBoardView(i)} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const next = 1 - i; setBoardView(next); document.getElementById(`board-tab-${next}`)?.focus() } }}>{label}</button>)}</div></div>
        <figure role="tabpanel" id="board-panel" aria-labelledby={`board-tab-${boardView}`} className={styles.boardFigure}><Image src={`/marketing/${boardView === 0 ? 'whiteboard-demo' : 'whiteboard-detail-demo'}${en ? '-en' : ''}.png`} width={1440} height={1000} alt={t.boardAlt[boardView]} sizes="(max-width: 760px) 92vw, 60vw" /><figcaption>{t.boardNote}</figcaption></figure>
      </section>

      <div id="feature-film" className={styles.film}><FeatureFilm locale={locale} /></div>

      <section className={styles.focus} aria-labelledby="focus-title"><div className={styles.focusCopy}><Timer size={35} strokeWidth={1.6} aria-hidden="true" /><h2 id="focus-title">{t.focusTitle}</h2><p>{t.focusBody}</p><Link href="/login" onClick={() => setLang(en ? 'en' : 'zh-TW')} className={styles.textLink}>{t.focusAction}<ArrowRight size={20} aria-hidden="true" /></Link></div><div className={styles.focusVisual}><Image src="/huddle-mascot.png" width={420} height={420} alt={en ? 'Huddle penguin' : 'Huddle 企鵝'} sizes="(max-width: 760px) 55vw, 28vw" className="art-hide" /><img src="/art/feature-focus.jpg" alt={en ? 'Huddle penguin holding a focus timer' : 'Huddle 企鵝抱著專注計時環'} loading="lazy" width={420} height={420} className={`art-only art-illus ${styles.artFocus}`} /><span className={styles.handNote}>{en ? 'A little at a time.' : '一步一步，也很好。'}</span></div></section>

      <section id="pricing" className={styles.pricing} aria-labelledby="pricing-title"><div className={styles.sectionIntro}><h2 id="pricing-title">{t.priceTitle}</h2><p>{t.priceIntro}</p></div><div className={styles.plans}><article><h3>{t.free}</h3><p className={styles.price}>NT$0</p><p>{t.freeBody}</p><Link href="/signup" onClick={() => setLang(en ? 'en' : 'zh-TW')} className={styles.primary}>{t.start}<ArrowRight size={18} aria-hidden="true" /></Link></article><article className={styles.pro}><h3>Pro <span>{t.soon}</span></h3><p className={styles.price}>NT$149<small>{t.month}</small></p><p className={styles.annual}>{t.year}</p><p>{t.proBody}</p></article></div></section>

      <section id="download" className={styles.download} aria-labelledby="download-title"><div><h2 id="download-title">{t.downloadTitle}</h2><p>{t.downloadBody}</p></div><div className={styles.downloadOptions}><a href={download('arm64')}><span>Mac · Apple Silicon</span><Download size={22} aria-hidden="true" /></a><a href={download('x64')}><span>Mac · Intel</span><Download size={22} aria-hidden="true" /></a><a href="https://github.com/dropout-tech/waddle/releases/download/v0.1.2-beta.1/Huddle-0.1.2-win-x64.exe"><span>Windows · x64</span><Download size={22} aria-hidden="true" /></a><p>{t.downloadNote}</p><a href={release} className={styles.releaseLink}>{t.release}<ArrowRight size={17} aria-hidden="true" /></a></div></section>

      <section className={styles.faq} aria-labelledby="faq-title"><h2 id="faq-title">{t.faqTitle}</h2><div>{t.questions.map(([q, a]) => <details key={q}><summary>{q}<ChevronDown size={20} aria-hidden="true" /></summary><p>{a}</p></details>)}</div></section>
      <footer className={styles.footer}><div><Link href={`${base}/about`} className={styles.brand}>Huddle.</Link><p>{t.footerLine}</p></div><nav aria-label={en ? 'Service information' : '服務資訊'}>{['terms', 'privacy', 'refunds', 'support'].map((path, i) => <Link href={`${base}/${path}`} key={path}>{t.legal[i]}</Link>)}<a href="#top">{t.all}<ArrowDown className={styles.up} size={15} aria-hidden="true" /></a></nav></footer>
    </main>
  )
}
