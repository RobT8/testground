#!/usr/bin/env python3
"""Generate alternative alarm-loop WAVs. Each file is ONE loop cycle that
starts at zero and ends in silence so MediaPlayer looping is seamless."""
import numpy as np, wave, os

SR = 44100
OUT = os.path.dirname(os.path.abspath(__file__))

def env(n, attack=0.008, decay=4.0):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)          # short linear attack
    return a * np.exp(-t * decay)

def bell(freq, dur, decay=4.0, amp=1.0, harm=(1.0, 0.6, 0.4, 0.25)):
    n = int(dur * SR)
    t = np.arange(n) / SR
    w = np.zeros(n)
    for i, h in enumerate(harm, start=1):
        w += h * np.sin(2 * np.pi * freq * i * t)
    return amp * w * env(n, decay=decay)

def tone(freq, dur, decay=4.0, amp=1.0, harm=(1.0, 0.6, 0.4, 0.25), sqr=0.0):
    b = bell(freq, dur, decay, amp, harm)
    if sqr > 0:
        n = int(dur * SR)
        t = np.arange(n) / SR
        sq = np.sign(np.sin(2 * np.pi * freq * t)) * env(n, decay=decay)
        b = (1 - sqr) * b + sqr * amp * sq
    return b

def silence(dur):
    return np.zeros(int(dur * SR))

def save(name, sig):
    sig = np.asarray(sig, dtype=np.float64)
    peak = np.max(np.abs(sig)) or 1.0
    sig = sig / peak * 0.95
    pcm = (sig * 32767).astype(np.int16)
    path = os.path.join(OUT, name)
    with wave.open(path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{name}: {len(sig)/SR:.2f}s")

# Notes (Hz)
C5, D5, E5, F5, G5, A5, B5, C6, E6, G6 = (
    523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5, 1318.5, 1568.0)

# --- E: Two-tone doorbell "ding-dong", repeated ---------------------------
def dingdong():
    seg = np.concatenate([
        bell(E6, 0.5, decay=3.2, harm=(1.0, 0.5, 0.3, 0.18)),
        bell(C6, 0.7, decay=2.6, harm=(1.0, 0.5, 0.3, 0.18)),
        silence(0.12),
    ])
    return np.concatenate([seg, seg, silence(0.55)])
save("option-E-doorbell.wav", dingdong())

# --- F: Warm ascending glass/harp arpeggio (gentle but bright) ------------
def harp():
    notes = [C5, E5, G5, C6, E6, G6]
    seg = []
    for i, f in enumerate(notes):
        seg.append(bell(f, 0.26, decay=3.8, amp=1.0 - i * 0.04,
                        harm=(1.0, 0.45, 0.22, 0.12)))
    up = np.concatenate(seg)
    return np.concatenate([up, silence(0.45), up, silence(0.6)])
save("option-F-glass-arpeggio.wav", harp())

# --- G: Pulsing electronic double-beep (insistent, modern) ----------------
def pulse():
    beep = tone(A5, 0.14, decay=6.0, harm=(1.0, 0.3), sqr=0.35)
    pair = np.concatenate([beep, silence(0.09), beep, silence(0.45)])
    return np.concatenate([pair, pair, silence(0.3)])
save("option-G-electronic-pulse.wav", pulse())

# --- H: Classic mechanical alarm-clock ring (bell trill) ------------------
def clock():
    # rapid alternation between two close bell tones = old wind-up clock
    n_pings = 18
    seg = []
    for i in range(n_pings):
        f = B5 if i % 2 == 0 else A5
        seg.append(bell(f, 0.075, decay=9.0, harm=(1.0, 0.7, 0.5, 0.35), amp=1.0))
    ring = np.concatenate(seg)
    return np.concatenate([ring, silence(0.5)])
save("option-H-alarm-clock.wav", clock())

# --- I: Gentle-but-insistent xylophone melody -----------------------------
def xylo():
    melody = [(G5, 0.16), (C6, 0.16), (E6, 0.16), (C6, 0.16),
              (G5, 0.16), (E6, 0.24)]
    seg = []
    for f, d in melody:
        seg.append(bell(f, d, decay=7.0, harm=(1.0, 0.35, 0.12), amp=1.0))
        seg.append(silence(0.02))
    tune = np.concatenate(seg)
    return np.concatenate([tune, silence(0.4), tune, silence(0.55)])
save("option-I-xylophone.wav", xylo())

# --- J: Soft "sonar" ping — single deep-ish ping with slow repeat ---------
def sonar():
    ping = bell(G5, 0.9, decay=2.2, harm=(1.0, 0.3, 0.12, 0.05))
    return np.concatenate([ping, silence(0.5), ping, silence(0.7)])
save("option-J-sonar-ping.wav", sonar())
