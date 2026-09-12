'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Focus,
  ListChecks,
  Monitor,
  MousePointer2,
  NotebookPen,
  Sparkles,
} from 'lucide-react'

const RELEASES_URL = 'https://github.com/dropout-tech/waddle/releases/latest'

const flow = [
  {
    time: '早上 09:10',
    title: '把腦中的事情，輕輕放下來',
    body: '快速記下任務、分進自己的工作區，再挑出今天真正想完成的事。',
    icon: ListChecks,
  },
  {
    time: '下午 14:00',
    title: '讓行程表告訴你，現在只做一件事',
    body: '把任務拖進時間軸，啟動專注計時，會議、休息與工作都有剛好的位置。',
    icon: Focus,
  },
  {
    time: '晚上 18:20',
    title: '一天結束以前，留一點給未來的自己',
    body: '在記事本寫下線索，從回顧看見時間去了哪裡，明天就不必重新摸索。',
    icon: BookOpenText,
  },
]

const questions = [
  ['Huddle 可以免費使用嗎？', '目前可免費建立帳號並使用核心工作空間。桌面版與網頁版共用同一個 Huddle 帳號。'],
  ['桌面版和網頁版有什麼不同？', '資料與功能相同；桌面版能留在 Dock 或工作列，像每天固定打開的手帳，不必先找到瀏覽器分頁。桌面版仍需要網路連線來登入與同步。'],
  ['資料會在不同裝置同步嗎？', '登入同一個帳號後，任務、行程與筆記會同步，讓你在電腦規劃、在其他裝置快速查看。'],
  ['現在支援哪些電腦？', '目前提供 macOS（Apple Silicon 與 Intel）測試版；請依 Mac 的晶片選擇安裝檔。Windows 版的建置流程已準備完成，正式安裝檔將在後續版本提供。'],
  ['下載後要怎麼安裝？', '打開 DMG，將 Huddle 拖進「應用程式」資料夾，再從應用程式開啟。測試版尚未完成 Apple 公證，第一次開啟可能需要在 Finder 對 Huddle 按右鍵並選擇「打開」。'],
  ['Huddle 怎麼處理我的資料？', 'Huddle 使用帳號登入來同步任務、行程與筆記；桌面安裝包本身不會把你的內容另存成公開檔案。正式發布前仍會補上獨立的隱私權說明頁。'],
]

function ProductPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-[780px]" role="img" aria-label="Huddle 工作面板示意：左側整理任務，中間安排今日行程，右側回顧專注足跡。">
      <div className="absolute -inset-8 -z-10 rounded-[42px] bg-[oklch(0.88_0.06_15/0.32)] blur-3xl" />
      <div className="overflow-hidden rounded-2xl bg-[oklch(0.995_0.003_85)] shadow-[0_28px_80px_-32px_oklch(0.28_0.025_55/0.28)] ring-1 ring-[oklch(0.84_0.025_65)]">
        <div className="flex h-10 items-center gap-2 border-b border-[oklch(0.91_0.014_85)] bg-[oklch(0.97_0.01_85)] px-4">
          <span className="size-2.5 rounded-full bg-[oklch(0.76_0.13_30)]" />
          <span className="size-2.5 rounded-full bg-[oklch(0.82_0.11_85)]" />
          <span className="size-2.5 rounded-full bg-[oklch(0.73_0.09_145)]" />
          <span className="ml-3 text-[10px] font-medium text-[oklch(0.48_0.02_55)]">Huddle · 今天</span>
        </div>
        <div className="grid min-h-[330px] grid-cols-[0.82fr_1.45fr] sm:min-h-[420px] md:grid-cols-[0.72fr_1.35fr_0.74fr]">
          <div className="border-r border-[oklch(0.91_0.014_85)] bg-[oklch(0.985_0.006_85)] p-3.5 sm:p-5">
            <div className="mb-5 flex items-center gap-2">
              <Image src="/huddle-mascot.png" width={32} height={32} alt="" className="size-7 object-contain" />
              <span className="text-xs font-semibold text-[oklch(0.31_0.025_55)] sm:text-sm">今天想做的事</span>
            </div>
            <div className="space-y-2.5">
              {['整理提案方向', '回覆合作夥伴', '完成首頁文案', '讀完第三章'].map((item, index) => (
                <div key={item} className="flex items-start gap-2.5 border-b border-[oklch(0.93_0.01_85)] pb-2.5">
                  <span className={`mt-0.5 size-3.5 shrink-0 rounded-full border ${index === 0 ? 'border-[oklch(0.68_0.14_35)] bg-[oklch(0.68_0.14_35)]' : 'border-[oklch(0.77_0.025_65)]'}`}>
                    {index === 0 && <Check className="size-3 text-white" strokeWidth={2.5} />}
                  </span>
                  <span className={`text-[10px] leading-4 sm:text-xs ${index === 0 ? 'text-[oklch(0.58_0.018_55)] line-through' : 'text-[oklch(0.34_0.025_55)]'}`}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative bg-[oklch(0.975_0.008_85)] px-3 py-4 sm:px-5">
            <div className="mb-4 flex items-baseline justify-between">
              <div>
                <p className="text-[9px] text-[oklch(0.57_0.02_55)] sm:text-[10px]">9 月 12 日 · 星期六</p>
                <p className="mt-1 text-sm font-semibold text-[oklch(0.3_0.025_55)] sm:text-base">今天慢慢來</p>
              </div>
              <span className="rounded-full bg-[oklch(0.92_0.03_145)] px-2 py-1 text-[9px] font-medium text-[oklch(0.38_0.06_145)]">日</span>
            </div>
            <div className="relative ml-6 border-l border-[oklch(0.88_0.018_85)] pl-3">
              {['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'].map((time) => (
                <div key={time} className="relative h-11 border-t border-[oklch(0.91_0.012_85)]">
                  <span className="absolute -left-11 -top-1.5 text-[8px] tabular-nums text-[oklch(0.6_0.018_55)]">{time}</span>
                </div>
              ))}
              <div className="absolute left-2 right-1 top-4 rounded-lg bg-[oklch(0.9_0.055_35)] px-2 py-2 text-[9px] font-medium text-[oklch(0.38_0.08_35)] shadow-sm sm:text-[10px]">整理提案 · 50 分鐘</div>
              <div className="absolute left-2 right-1 top-[104px] rounded-lg bg-[oklch(0.9_0.04_145)] px-2 py-2 text-[9px] font-medium text-[oklch(0.35_0.06_145)] shadow-sm sm:text-[10px]">午餐，出去走走</div>
              <div className="absolute left-2 right-1 top-[190px] rounded-lg bg-[oklch(0.91_0.045_15)] px-2 py-2 text-[9px] font-medium text-[oklch(0.38_0.08_15)] shadow-sm sm:text-[10px]">首頁文案 · 專注</div>
            </div>
          </div>
          <div className="hidden border-l border-[oklch(0.91_0.014_85)] bg-[oklch(0.988_0.005_85)] p-5 md:block">
            <p className="text-xs font-semibold text-[oklch(0.31_0.025_55)]">今天的足跡</p>
            <div className="mt-6 text-center">
              <span className="font-mono text-3xl font-medium tabular-nums text-[oklch(0.59_0.12_35)]">2:35</span>
              <p className="mt-1 text-[10px] text-[oklch(0.55_0.02_55)]">專注時間</p>
            </div>
            <div className="mt-6 space-y-3 text-[10px] text-[oklch(0.48_0.02_55)]">
              <div className="flex justify-between"><span>完成</span><span className="font-medium text-[oklch(0.32_0.025_55)]">3 件</span></div>
              <div className="flex justify-between"><span>記下</span><span className="font-medium text-[oklch(0.32_0.025_55)]">2 則</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[oklch(0.92_0.012_85)]"><div className="h-full w-2/3 rounded-full bg-[oklch(0.68_0.14_35)]" /></div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 right-4 flex items-center gap-3 rounded-2xl bg-[oklch(0.28_0.025_55)] px-4 py-3 text-[oklch(0.975_0.008_85)] shadow-[0_16px_36px_-18px_oklch(0.28_0.025_55/0.6)] sm:right-10">
        <span className="grid size-8 place-items-center rounded-full bg-[oklch(0.68_0.14_35)]"><Clock3 className="size-4" /></span>
        <span><strong className="block font-mono text-sm font-medium tabular-nums">24:18</strong><small className="block text-[9px] text-[oklch(0.82_0.012_85)]">正在專注</small></span>
      </div>
    </figure>
  )
}

export function MarketingPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[oklch(0.975_0.008_85)] text-[oklch(0.28_0.025_55)] selection:bg-[oklch(0.88_0.06_15)]">
      <nav className="sticky top-0 z-40 border-b border-[oklch(0.9_0.015_85/0.72)] bg-[oklch(0.975_0.008_85/0.92)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.68_0.14_35)]">
            <Image src="/huddle-mascot.png" width={36} height={36} alt="Huddle" className="size-9 object-contain" priority />
            <span className="text-lg font-semibold tracking-[-0.02em]">Huddle</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-[oklch(0.44_0.02_55)] md:flex">
            <a href="#day" className="transition-colors hover:text-[oklch(0.28_0.025_55)]">一天怎麼用</a>
            <a href="#features" className="transition-colors hover:text-[oklch(0.28_0.025_55)]">功能</a>
            <a href="#download" className="transition-colors hover:text-[oklch(0.28_0.025_55)]">下載</a>
          </div>
          <Link href="/login" className="inline-flex h-10 items-center rounded-full bg-[oklch(0.28_0.025_55)] px-5 text-sm font-medium text-[oklch(0.975_0.008_85)] transition-transform duration-200 ease-quart hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.68_0.14_35)] focus-visible:ring-offset-2">
            登入使用
          </Link>
        </div>
      </nav>

      <section className="relative px-5 pb-28 pt-16 sm:px-8 sm:pt-24 lg:pb-36 lg:pt-28">
        <div className="pointer-events-none absolute left-[8%] top-20 size-72 rounded-full bg-[oklch(0.92_0.03_145/0.58)] blur-3xl" />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-balance text-[clamp(2.8rem,7vw,5.8rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
              讓每一天，有地方安放。
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-balance text-lg leading-8 text-[oklch(0.46_0.02_55)] sm:text-xl">
              Huddle 把任務、行程、專注與筆記收在同一張桌面。少一點來回切換，多一點真正做完事情的從容。
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[oklch(0.5_0.14_35)] px-7 font-medium text-[oklch(0.995_0.003_85)] shadow-[0_12px_30px_-16px_oklch(0.4_0.12_35/0.7)] transition-transform duration-200 ease-quart hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.5_0.14_35)] focus-visible:ring-offset-2 sm:w-auto">
                <Download className="size-4.5" /> 下載 Mac 版
              </a>
              <Link href="/signup" className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-full border border-[oklch(0.82_0.022_70)] bg-[oklch(0.995_0.003_85)] px-7 font-medium transition-colors hover:bg-[oklch(0.95_0.018_85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.68_0.14_35)] sm:w-auto">
                先用網頁版 <ArrowRight className="size-4" />
              </Link>
            </div>
            <p className="mt-4 text-xs text-[oklch(0.55_0.018_55)]">macOS 測試版 · 支援 Apple Silicon 與 Intel · 網頁版免下載</p>
          </div>
          <div className="mt-16 sm:mt-20"><ProductPreview /></div>
        </div>
      </section>

      <section id="day" className="scroll-mt-24 border-y border-[oklch(0.9_0.015_85)] bg-[oklch(0.995_0.003_85)] px-5 py-24 sm:px-8 lg:py-32">
        <div className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 className="text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">不是管理人生。<br />是陪你過完今天。</h2>
            <p className="mt-6 max-w-md text-base leading-7 text-[oklch(0.48_0.02_55)]">生產力工具常讓人多一份壓力。Huddle 從一天的真實節奏出發，安靜地待在旁邊，需要時才出現。</p>
          </div>
          <div className="relative space-y-14 before:absolute before:bottom-8 before:left-[21px] before:top-7 before:w-px before:bg-[oklch(0.86_0.025_75)]">
            {flow.map(({ time, title, body, icon: Icon }) => (
              <article key={time} className="relative grid grid-cols-[44px_1fr] gap-5">
                <div className="relative z-10 grid size-11 place-items-center rounded-full bg-[oklch(0.92_0.03_145)] text-[oklch(0.38_0.06_145)] ring-8 ring-[oklch(0.995_0.003_85)]"><Icon className="size-5" /></div>
                <div className="pt-0.5">
                  <p className="text-sm font-medium text-[oklch(0.59_0.11_35)]">{time}</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{title}</h3>
                  <p className="mt-3 max-w-xl leading-7 text-[oklch(0.48_0.02_55)]">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 px-5 py-24 sm:px-8 lg:py-32">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <h2 className="text-balance text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">你需要的，都在伸手可及的地方。</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[oklch(0.48_0.02_55)]">每個功能都為同一件事服務：從「想做」走到「做完」，中間不用搬運自己。</p>
          </div>
          <div className="mt-16 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [ListChecks, '任務與工作區', '把不同身份與專案分開整理，急迫程度、到期日與分類都清楚，但不催促。'],
              [CalendarDays, '時間區塊行程', '拖放任務到今天的時間軸，把抽象的清單變成真正做得到的安排。'],
              [Clock3, '專注計時', '番茄鐘、正計時與環境聲留在畫面一角，陪你守住這一小段時間。'],
              [NotebookPen, '記事本與白板', '靈感、會議筆記與臨時想法先接住，準備好時再一鍵變成任務。'],
              [Sparkles, '回顧與成長足跡', '從完成紀錄與時間分布看見自己的節奏，讓下一次安排更貼近真實。'],
              [MousePointer2, '鍵盤與拖放操作', '用快捷鍵快速找到任務，也能直接拖曳排程；滑鼠、鍵盤都順手。'],
            ].map(([Icon, title, body]) => {
              const FeatureIcon = Icon as typeof ListChecks
              return (
                <article key={title as string} className="border-t border-[oklch(0.84_0.022_75)] pt-6">
                  <FeatureIcon className="size-6 text-[oklch(0.59_0.12_35)]" strokeWidth={1.7} />
                  <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em]">{title as string}</h3>
                  <p className="mt-3 leading-7 text-[oklch(0.48_0.02_55)]">{body as string}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section id="download" className="scroll-mt-24 px-5 pb-24 sm:px-8 lg:pb-32">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-[oklch(0.28_0.025_55)] px-6 py-14 text-[oklch(0.975_0.008_85)] shadow-[0_28px_70px_-38px_oklch(0.28_0.025_55/0.65)] sm:px-12 sm:py-16 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-16">
          <div className="relative z-10">
            <h2 className="max-w-2xl text-balance text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">把 Huddle 留在你的桌面。</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[oklch(0.82_0.012_85)]">一點就開、獨立視窗、保留登入狀態。每天開始工作時，它就像桌上的那本手帳一樣在那裡。</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[oklch(0.78_0.12_35)] px-7 font-medium text-[oklch(0.22_0.025_55)] transition-transform duration-200 ease-quart hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.96_0.01_85)]"><Download className="size-4.5" />下載 macOS 版</a>
              <span className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-[oklch(0.5_0.02_55)] px-7 text-sm text-[oklch(0.72_0.012_85)]"><Monitor className="size-4" />Windows 版準備中</span>
            </div>
          </div>
          <div className="relative mt-12 flex min-h-48 items-center justify-center lg:mt-0">
            <div className="absolute size-56 rounded-full bg-[oklch(0.68_0.14_35/0.18)] blur-3xl" />
            <Image src="/huddle-mascot.png" width={260} height={260} alt="Huddle 企鵝" className="relative w-52 object-contain drop-shadow-[0_18px_18px_oklch(0.1_0.02_55/0.2)] sm:w-60" />
          </div>
        </div>
      </section>

      <section className="border-t border-[oklch(0.9_0.015_85)] bg-[oklch(0.995_0.003_85)] px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-4xl font-semibold tracking-[-0.035em]">常見問題</h2>
          <div className="mt-12 divide-y divide-[oklch(0.88_0.018_85)] border-y border-[oklch(0.88_0.018_85)]">
            {questions.map(([question, answer]) => (
              <details key={question} className="group py-1">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.68_0.14_35)] [&::-webkit-details-marker]:hidden">
                  {question}<ChevronDown className="size-4 shrink-0 transition-transform duration-200 ease-quart group-open:rotate-180" />
                </summary>
                <p className="max-w-2xl pb-6 pr-10 leading-7 text-[oklch(0.48_0.02_55)]">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 text-center text-sm text-[oklch(0.52_0.02_55)] sm:flex-row sm:text-left">
          <div className="flex items-center gap-2"><Image src="/huddle-mascot.png" width={28} height={28} alt="" className="size-7 object-contain" /><span>Huddle · 慢慢搖擺，把事情做完。</span></div>
          <div className="flex items-center gap-5"><Link href="/login" className="hover:text-[oklch(0.28_0.025_55)]">登入</Link><Link href="/signup" className="hover:text-[oklch(0.28_0.025_55)]">建立帳號</Link><a href={RELEASES_URL} target="_blank" rel="noreferrer" className="hover:text-[oklch(0.28_0.025_55)]">版本紀錄</a></div>
        </div>
      </footer>
    </main>
  )
}
