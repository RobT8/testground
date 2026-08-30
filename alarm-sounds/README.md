# Alarm sound options

These are the candidate wake-up sounds for the patient (sleeper) alarm. They are
kept here for reference — **only the file copied to
`android/app/src/main/res/raw/buzzer.wav` is actually bundled into the app.**
Nothing in this folder is compiled into the APK.

Each WAV is a single loop cycle (44.1 kHz, mono, 16-bit) that starts from silence
and ends in silence, so it repeats seamlessly at forced-max alarm volume until
Mum taps "I'm awake."

| File | Character |
|------|-----------|
| `option-A-soft-chime.wav` | Soft, mellow chime |
| `option-B-gentle-marimba.wav` | Gentle marimba |
| `option-C-firm-chime.wav` | Firm rising chime (was live before F) |
| `option-D-urgent-chime.wav` | Urgent, brighter chime |
| `option-E-doorbell.wav` | Two-tone "ding-dong" doorbell |
| **`option-F-glass-arpeggio.wav`** | **Bright ascending harp/glass arpeggio — CURRENTLY LIVE** |
| `option-G-electronic-pulse.wav` | Modern electronic double-beep |
| `option-H-alarm-clock.wav` | Classic wind-up alarm-clock trill |
| `option-I-xylophone.wav` | Short cheerful xylophone melody |
| `option-J-sonar-ping.wav` | Deep, slow sonar-style ping |

## Currently live
**Option F — glass arpeggio.**

## How to switch to a different one
1. Copy the chosen file over the bundled alarm:
   ```
   cp alarm-sounds/option-H-alarm-clock.wav android/app/src/main/res/raw/buzzer.wav
   ```
2. Commit and push to the build branch — the GitHub Actions workflow rebuilds the
   APK and publishes it to the `apk-latest` release automatically.
3. Reinstall on Mum's phone from the release download link (installs over the top).

## Regenerating / making new options
`make_sounds.py` synthesises options E–J with numpy (`python3 make_sounds.py`).
Tweak the note lists, decay, and `sqr` (square-wave grit) to make a sound harsher
or softer, then add it to the table above.
