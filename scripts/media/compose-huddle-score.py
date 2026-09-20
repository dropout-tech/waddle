#!/usr/bin/env python3
"""Original 18-second Huddle score: 160 BPM, 12 bars, 4/4.
New notes, harmony, drums and synthesis; no source audio or external dependencies.
"""
from array import array
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import wave

RATE, DURATION, BPM = 44100, 18.0, 160
BEAT, TAU = 60 / BPM, 2 * math.pi
COUNT = round(RATE * DURATION)
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'public/marketing/feature-film/huddle-score.wav'
left, right = array('d', [0.0]) * COUNT, array('d', [0.0]) * COUNT
rng = random.Random(20260920160)

def hz(note):
    return 440 * 2 ** ((note - 69) / 12)

def add(seconds, duration, render, gain=1, pan=0):
    first = max(0, round(seconds * RATE))
    length = min(round(duration * RATE), COUNT - first)
    a, b = math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)
    for j in range(max(0, length)):
        value = render(j / RATE) * gain
        left[first + j] += value * a
        right[first + j] += value * b

def envelope(t, length, attack=.009, release=.07):
    return min(1, t / attack) * min(1, max(0, length - t) / release)

def lead(beat, note, duration=.8, gain=.12, pan=0):
    # Rounded brass-like harmonic voice, not a sampled instrument.
    length, f = duration * BEAT, hz(note)
    def tone(t):
        brightness = math.exp(-t * 3)
        voice = math.sin(TAU * f * t) + brightness * (.30 * math.sin(TAU * 2*f*t) + .12 * math.sin(TAU * 3*f*t))
        return voice * envelope(t, length, .014, .07) * (.8 + .2 * math.exp(-t * 5))
    add(beat * BEAT, length, tone, gain, pan)

def bell(seconds, note, gain=.065, pan=0, length=.7):
    f = hz(note)
    def tone(t):
        return envelope(t, length, .004, .08) * (math.sin(TAU*f*t)*math.exp(-t*5) + .23*math.sin(TAU*f*2*t)*math.exp(-t*11))
    add(seconds, length, tone, gain, pan)

def bass(beat, note, gain=.14, duration=.43):
    length, f = duration * BEAT, hz(note)
    def tone(t):
        return envelope(t, length, .006, .035) * (math.sin(TAU*f*t) + .25*math.sin(TAU*f*2*t))
    add(beat * BEAT, length, tone, gain)

def chord(beat, notes, length=1.35, gain=.034):
    for i, note in enumerate(notes):
        f = hz(note)
        def tone(t, frequency=f):
            return envelope(t, length, .06, .2) * (math.sin(TAU*frequency*t) + .10*math.sin(TAU*frequency*2*t))
        add(beat*BEAT, length, tone, gain, (i-1.5)*.25)

def kick(beat, gain=.23):
    # Integrated exponential pitch sweep, with no discontinuous click.
    def tone(t):
        phase = TAU*(48*t + 60*(1-math.exp(-t*32))/32)
        return math.sin(phase)*math.exp(-t*15)*(1-math.exp(-t*500))*min(1,max(0,.3-t)/.03)
    add(beat*BEAT, .3, tone, gain)

def snare(beat, gain=.105):
    previous = 0.0
    def tone(t):
        nonlocal previous
        noise = rng.uniform(-1,1)
        previous += .32*(noise-previous)
        return envelope(t,.19,.002,.03)*(previous*.85 + .2*math.sin(TAU*185*t))*math.exp(-t*18)
    add(beat*BEAT,.19,tone,gain,.07)

def hat(beat, gain=.022, pan=0):
    previous = 0.0
    def tone(t):
        nonlocal previous
        noise = rng.uniform(-1,1)
        high = noise-previous
        previous = noise
        return high*math.exp(-t*60)*envelope(t,.09,.002,.018)
    add(beat*BEAT,.09,tone,gain,pan)

# D major: an assertive I–V–vi–IV opening, lift through ii–V, then resolve.
progression = [
 (38,[62,66,69,74]), (45,[61,64,69,73]), (47,[62,66,71,74]),
 (43,[62,67,71,74]), (38,[62,66,69,76]), (45,[61,64,69,76]),
 (40,[62,64,67,71]), (45,[61,64,69,73]), (43,[62,67,71,74]),
 (45,[61,64,69,76]), (38,[62,66,69,74]), (38,[62,66,69,76]),
]
for bar,(root,notes) in enumerate(progression):
    beat = bar*4
    chord(beat, notes, 1.55 if bar>=10 else 1.35, .039 if bar>=6 else .031)
    if bar < 10:
        for offset in [0,1,2,3]: kick(beat+offset,.19 if offset%2 else .24)
        for offset in [1,3]: snare(beat+offset,.11)
        for step in range(8):
            hat(beat+step*.5,.020 if step%2 else .012, .3 if step%2 else -.3)
            bass(beat+step*.5,root+(12 if step in [3,7] else 7 if step==5 else 0), .125 if step%2 else .155)
        for index in range(4): bell((beat+index+.5)*BEAT,notes[index],.043,(-1 if index%2 else 1)*.32,.5)
    else:
        # Final three seconds open into a broad resolving harmony.
        kick(beat,.19 if bar==10 else .13)
        bass(beat,root,.14,2.5)
        if bar==10: snare(beat+2,.065)

# New short ascending melody: confident quarter notes answered by syncopation.
melody = [
 (0,74,1),(1,78,.5),(1.5,81,.5),(2,81,1),(3,78,.8),
 (4,76,.8),(5,73,.8),(6,76,.5),(6.5,78,.5),(7,81,.8),
 (8,78,1),(9,81,.5),(9.5,83,.5),(10,86,1),(11,83,.8),
 (12,83,1),(13,81,.75),(14,79,.75),(15,78,.8),
 (22,78,.5),(22.5,81,.5),(23,86,.8),
 (24,83,.8),(25,81,.5),(25.5,79,.5),(26,78,1),(27,76,.8),
 (28,76,.5),(28.5,78,.5),(29,81,1),(30,85,.8),(31,81,.8),
 (32,79,.8),(33,83,.8),(34,86,1),(35,83,.8),
 (36,81,.5),(36.5,85,.5),(37,88,1),(38,85,.8),(39,81,.8),
 (40,86,2),(42,81,1),(43,78,1),(44,74,3.4),
]
for index,(beat,note,length) in enumerate(melody):
    lead(beat,note,length,.105 if 12<=beat<22 else .14,math.sin(index*.7)*.12)

# 4.5–8.25 seconds: a fresh rising D-major sparkling flourish.
magic_notes = [62,66,69,74,76,78,81,83,86,88,86,83,81,78,81,86]
for index,note in enumerate(magic_notes):
    bell(4.5+index*.225,note,.076 if note<85 else .049,-.45+.06*index,.85)

# Exact visual landing times after the film's 0.75 timescale.
for seconds,note in [(9.8*.75,74),(13.8*.75,78),(17.2*.75,81),(19.3*.75,78),(22.8*.75,86)]:
    bell(seconds,note,.086,-.08,.55)
    bell(seconds+.055,note+7,.037,.15,.42)
# Final tonic bloom at 15 and 16.5 s: musical closure without a hard cut.
for seconds,gain in [(15,.067),(16.5,.074)]:
    for offset,note in [(0,62),(.07,66),(.14,69),(.21,74)]: bell(seconds+offset,note,gain,(note-68)/22,1.25)

# Short stereo room taps; dry copies avoid feedback and excessive drum wash.
dry_l,dry_r = array('d',left),array('d',right)
for delay,gain in [(.061,.065),(.119,.035)]:
    shift = round(delay*RATE)
    for i in range(shift,COUNT):
        left[i] += dry_r[i-shift]*gain
        right[i] += dry_l[i-shift]*gain
mean_l,mean_r = sum(left)/COUNT,sum(right)/COUNT
for i in range(COUNT):
    t=i/RATE
    fade=min(1,t/.015)*math.sin(min(1,max(0,DURATION-t)/.55)*math.pi/2)**2
    left[i]=(left[i]-mean_l)*fade
    right[i]=(right[i]-mean_r)*fade
peak=max(max(map(abs,left)),max(map(abs,right)))
scale=10**(-1.8/20)/peak
pcm=array('h')
for l,r in zip(left,right):
    pcm.append(round(l*scale*32767));pcm.append(round(r*scale*32767))
if struct.pack('=h',1)!=struct.pack('<h',1): pcm.byteswap()
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(OUTPUT),'wb') as out:
    out.setnchannels(2);out.setsampwidth(2);out.setframerate(RATE);out.writeframes(pcm.tobytes())
print(json.dumps({'path':str(OUTPUT),'duration_seconds':DURATION,'bpm':BPM,'bars':12,'sample_rate':RATE,'channels':2,'peak_target_dbfs':-1.8,'sha256':hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),'source':'original procedural synthesis; no samples or third-party audio'}))
