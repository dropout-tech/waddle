'use client'

import { useId, useRef, useState } from 'react'
import { Download, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import styles from './feature-film.module.css'


/** Public, click-to-play media. Native controls remain the primary player UI. */
export function FeatureFilm({ locale = 'zh' }: { locale?: 'zh' | 'en' }) {
  const en = locale === 'en'
  const film = `/marketing/feature-film/huddle-feature-film${en ? '-en' : ''}.mp4`
  const poster = `/marketing/feature-film/poster${en ? '-en' : ''}.jpg`
  const copy = en ? {
    title: ['Give your scattered ideas', 'a place in your day.'],
    intro: ['From a passing thought to a task done.', 'See how Huddle helps you make room for your day.'],
    label: 'Huddle feature film', fallback: 'Your browser cannot play this video. Use the download link below to watch it.',
    notice: 'Illustrated scenario, not a photo recognition feature.',
    caption: '18 seconds · Original music and English captions. Muted by default; turn sound on whenever you like.',
    pause: 'Pause video', resume: 'Resume', play: 'Play video', replay: 'Play from start', unmute: 'Turn sound on', mute: 'Turn sound off', download: 'Download video',
    error: 'The video is unavailable right now. Please try again later or use the download link.', summary: 'Read the story and feature summary',
    paragraphs: [
      'Sticky notes surround a calendar. The Huddle penguin waves its magic, bringing them into a task list. This illustrates organizing ideas; it does not represent photographing or automatically recognizing notes.',
      'Drag a task into a time slot, then move it when plans change. Check off one task and start a focus timer to make room for what comes next.',
      'Features shown: task organization, drag-and-drop scheduling, rescheduling, task completion, and a focus timer. The film shows an illustrated English interface with English captions. There is no dialogue; the music carries no instructions.',
    ],
  } : {
    title: ['把散落的想法，', '留給今天的自己。'], intro: ['從一個念頭，到一件做完的事。', '用一小段時間，看看 Huddle 如何陪你整理一天。'],
    label: 'Huddle 功能情境短片', fallback: '你的瀏覽器無法播放此影片，請使用下方的下載連結觀看。', notice: '情境示意，非拍照辨識功能。', caption: '18 秒 · 含原創配樂與繁體中文字幕。預設靜音，可自行開啟聲音。',
    pause: '暫停影片', resume: '繼續播放', play: '開始播放', replay: '從頭播放', unmute: '開啟聲音', mute: '關閉聲音', download: '下載影片', error: '影片暫時無法播放。你可以稍後再試，或使用下載連結。', summary: '閱讀文字版與功能摘要',
    paragraphs: [
      '行事曆旁散落著幾張便條。Huddle 企鵝揮動魔法，讓它們飛進側邊的任務清單。這段轉場是整理想法的情境示意，不代表拍照或自動辨識便條。',
      '接著，把任務拖進行事曆的時間格，再依照今天的步調調整安排。最後完成一件任務，啟動專注，留一段時間給眼前的事。',
      '功能摘要：整理任務、拖曳排程、調整時間、標記完成與專注計時。片中沒有對白，配樂不承載操作指令；功能內容也以畫面文字與字幕呈現。',
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
              key={locale}
              ref={videoRef}
              controls
              muted={muted}
              onVolumeChange={event => setMuted(event.currentTarget.muted)}
              playsInline
              preload="metadata"
              width={1920}
              height={1480}
              poster={poster}
              aria-label={copy.label}
              aria-describedby={`${id}-description ${id}-notice`}
              onError={() => setFailed(true)}
              onPlay={() => { setPlaying(true); setHasPlayed(true); setFailed(false) }}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            >
              <source src={film} type="video/mp4" onError={() => setFailed(true)} />
              <track kind="captions" src="/marketing/feature-film/captions.vtt" srcLang="zh-TW" label="繁體中文" default={!en} />
              <track kind="captions" src="/marketing/feature-film/captions.en.vtt" srcLang="en" label="English" default={en} />
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
          <a href={film} download={`huddle-feature-film${en ? '-en' : ''}.mp4`}><Download size={16} aria-hidden="true" />{copy.download}</a>
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
