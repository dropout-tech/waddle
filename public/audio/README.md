# Focus Timer Audio Files

The focus timer expects these files. Until they're present, the picker shows the options but nothing plays (engine fails silently — no error toast, no crash).

```
public/audio/
├── music/
│   ├── relax.mp3       (mood: 放鬆 / relaxing)
│   ├── energetic.mp3   (mood: 激昂 / energetic)
│   └── nature.mp3      (mood: 大自然 / nature)
└── ambient/
    ├── rain.mp3        (overlay: 雨聲)
    ├── fire.mp3        (overlay: 火焰)
    ├── waves.mp3       (overlay: 海浪)
    └── cafe.mp3        (overlay: 咖啡廳)
```

## Requirements

- **Format**: MP3, ideally 128–192 kbps (file size matters since these autoplay)
- **Length**: ≥3 min for music, ≥30 sec for ambient. All tracks loop seamlessly, so prefer recordings that are already loop-friendly (no abrupt fade-outs).
- **License**: CC0 / Public Domain / Pixabay Content License — anything you can ship in a commercial product without attribution. Avoid Creative Commons BY/SA unless you're prepared to add an attribution screen.

## Recommended sources (all free, license-clean)

### 1. Pixabay Music — https://pixabay.com/music/
The easiest source. License = "Free for use, no attribution required". Searches I'd start with:

| Slot              | Search query                          | Look for                                    |
|-------------------|---------------------------------------|---------------------------------------------|
| `relax.mp3`       | "lofi study" / "ambient piano"        | Slow, no drums, no vocals, no jarring drops |
| `energetic.mp3`   | "deep house focus" / "motivational"   | Steady BPM 110–130, no lyrics, no big drops |
| `nature.mp3`      | "forest piano" / "ambient nature"     | Piano + forest birds blend                  |
| `rain.mp3`        | "rain loop" / "heavy rain ambient"    | Pure rain, no thunder spikes                |
| `fire.mp3`        | "fireplace crackle" / "campfire loop" | Steady crackle, no voices                   |
| `waves.mp3`       | "ocean waves loop"                    | Calm waves, no seagulls                     |
| `cafe.mp3`        | "coffee shop ambience" / "cafe chatter" | Murmur + cup clinks, no music underneath  |

Steps: search → preview → click ↓ Download → rename to the target filename → drop into the folder above. Pixabay requires a free login to download, but the audio is genuinely free.

### 2. Mixkit — https://mixkit.co/free-stock-music/
Direct downloads, no login. Smaller catalogue. Good for `energetic.mp3` (electronic) and ambient.

### 3. Freesound (CC0 filter) — https://freesound.org/search/?f=license:%22Creative+Commons+0%22
Best for `rain.mp3`, `fire.mp3`, `waves.mp3`, `cafe.mp3`. Filter by "Creative Commons 0" only.

## Naming + dropping in

Once downloaded, just rename and drop into the folders above. No build step, no manifest update — the app reads the paths declared in [`lib/timer-bgm.ts`](../../lib/timer-bgm.ts).

If you want to add a 4th music mood or another ambient overlay, edit `BGM_MUSIC` / `BGM_AMBIENT` in `lib/timer-bgm.ts` and add the matching file here.
