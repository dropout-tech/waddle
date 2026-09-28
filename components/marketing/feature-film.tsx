'use client'

import { useId, useRef, useState } from 'react'
import { Download, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import styles from './feature-film.module.css'

const FILM_720 = '/marketing/promo-film/huddle-promo-720.mp4'
const FILM_1080 = '/marketing/promo-film/huddle-promo-1080.mp4'
const POSTER = '/marketing/promo-film/huddle-promo-poster.jpg'
const NARROW_QUERY = '(max-width: 760px)'

/** Public, click-to-play media. Native controls remain the primary player UI.
 * Same file for zh and en: the end card already carries both languages. */
export function FeatureFilm({ locale = 'zh' }: { locale?: 'zh' | 'en' }) {
  const en = locale === 'en'
  const copy = en ? {
    title: ['Give your scattered ideas', 'a place in your day.'],
    intro: ['From a passing thought to a task done.', 'See how Huddle helps you make room for your day.'],
    label: 'Huddle promo film', fallback: 'Your browser cannot play this video. Use the download link below to watch it.',
    notice: 'An animated story; all visuals are illustrations.',
    caption: '44 seconds · Music and sound effects. Muted by default; turn sound on whenever you like.',
    pause: 'Pause video', resume: 'Resume', play: 'Play video', replay: 'Play from start', unmute: 'Turn sound on', mute: 'Turn sound off', download: 'Download video',
    error: 'The video is unavailable right now. Please try again later or use the download link.', summary: 'Read the story summary',
    paragraphs: [
      'The penguin is trapped inside a giant clock, running as the clock hands chase it from behind.',
      'It tumbles into an office, looks around, and realises how much is still undone, so it splits into five penguins, each scrambling to keep up.',
      'The five merge back into one and let Huddle sort things out. The penguin settles into a hammock as the bilingual line appears: "You need five penguins. Or one Huddle." There is no dialogue, and the music and sound effects carry no instructions.',
    ],
  } : {
    title: ['把散落的想法，', '留給今天的自己。'], intro: ['從一個念頭，到一件做完的事。', '用一小段時間，看看 Huddle 如何陪你整理一天。'],
    label: 'Huddle 宣傳片', fallback: '你的瀏覽器無法播放此影片，請使用下方的下載連結觀看。', notice: '動畫故事，畫面為插畫示意。', caption: '44 秒 · 含配樂與音效。預設靜音，可自行開啟聲音。',
    pause: '暫停影片', resume: '繼續播放', play: '開始播放', replay: '從頭播放', unmute: '開啟聲音', mute: '關閉聲音', download: '下載影片', error: '影片暫時無法播放。你可以稍後再試，或使用下載連結。', summary: '閱讀文字版故事摘要',
    paragraphs: [
      '企鵝被困在一個巨大的時鐘裡，指針從後面追著牠跑，越追越近。',
      '牠跌進辦公室，左右張望，發現還有好多事沒做，於是分身成五隻企鵝，各自手忙腳亂。',
      '最後五隻合而為一，事情交給 Huddle 排好；企鵝躺上吊床休息，畫面浮出雙語標語：「你需要五隻企鵝，或是一個 Huddle。」全片沒有對白，配樂與音效不帶操作指令。',
    ],
  }
  const id = useId()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [hasPlayed, setHasPlayed] = useState(false)

  async function play(restart = false) {
    const video = videoRef.current
    if (!video) return
    if (restart) video.currentTime = 0
    try {
      await video.play()
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <section lang={en ? 'en' : 'zh-TW'} className={styles.section} aria-labelledby={`${id}-title`}>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div>
            <h2 id={`${id}-title`}>{copy.title[0]}<br />{copy.title[1]}</h2>
          </div>
          <p className={styles.intro}>{copy.intro[0]}<br />{copy.intro[1]}</p>
        </div>
        <figure className={styles.figure}>
          <div className={styles.screen}>
            <video
              ref={videoRef}
              controls
              muted={muted}
              onVolumeChange={event => setMuted(event.currentTarget.muted)}
              playsInline
              preload="metadata"
              width={1920}
              height={1080}
              poster={POSTER}
              aria-label={copy.label}
              aria-describedby={`${id}-description ${id}-notice`}
              onError={() => setFailed(true)}
              onPlay={() => { setPlaying(true); setHasPlayed(true); setFailed(false) }}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            >
              <source media={NARROW_QUERY} src={FILM_720} type="video/mp4" onError={() => setFailed(true)} />
              <source src={FILM_1080} type="video/mp4" onError={() => setFailed(true)} />
              {copy.fallback}
            </video>
          </div>
          <figcaption className={styles.caption}>
            <p id={`${id}-notice`}>{copy.notice}</p>
            <p>{copy.caption}</p>
          </figcaption>
        </figure>
        <div className={styles.actions}>
          <button type="button" onClick={() => { if (playing) videoRef.current?.pause(); else void play() }}>
            <Play size={16} aria-hidden="true" />{playing ? copy.pause : hasPlayed ? copy.resume : copy.play}
          </button>
          <button type="button" className={styles.secondary} onClick={() => void play(true)}>
            <RotateCcw size={16} aria-hidden="true" />{copy.replay}
          </button>
          <button type="button" className={styles.secondary} onClick={() => {
            const video = videoRef.current
            if (video) { video.muted = !video.muted; setMuted(video.muted) }
          }}>
            {muted ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}{muted ? copy.unmute : copy.mute}
          </button>
          <a href={FILM_1080} download="huddle-promo-film.mp4"><Download size={16} aria-hidden="true" />{copy.download}</a>
        </div>
        {failed && <p className={styles.error} role="status">{copy.error}</p>}
        <details className={styles.transcript}>
          <summary>{copy.summary}</summary>
          <div id={`${id}-description`}>
            {copy.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </details>
      </div>
    </section>
  )
}
