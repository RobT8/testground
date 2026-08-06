package com.nightalert.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * The noise-maker, with two modes:
 *
 *  • ALARM  — a looping tone on the ALARM stream at forced-maximum volume (sounds
 *             even on silent / Do Not Disturb), plus vibration. Relentless and
 *             self-healing: call ensureAlarming repeatedly and it restarts the
 *             sound if it ever stops and re-maxes the volume.
 *  • REMIND — a much quieter gentle double-beep every ~12s, used while she's
 *             "checking now": enough to remind her to finish confirming, without
 *             the full siren.
 *
 * The sound only truly ends on [stop] (confirm, or a carer's cancel).
 */
object AlarmPlayer {
    const val OFF = 0
    const val ALARM = 1
    const val REMIND = 2

    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var reminderThread: Thread? = null
    private var previousAlarmVolume = -1
    @Volatile private var vibrating = false

    @Volatile var mode = OFF
        private set

    /** Kept for existing callers: true whenever any sound mode is active. */
    val isPlaying: Boolean get() = mode != OFF

    // ---- LOUD alarm ----------------------------------------------------------
    @Synchronized
    fun ensureAlarming(context: Context): Boolean {
        val app = context.applicationContext
        acquireWake(app)

        // Leaving reminder mode? stop the quiet beeps.
        if (mode == REMIND) stopReminder()
        mode = ALARM

        // Force alarm volume to maximum every call — defeats a sleepy volume-down.
        val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        saveVolume(audio)
        try {
            audio.setStreamVolume(
                AudioManager.STREAM_ALARM,
                audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0,
            )
        } catch (_: Exception) {}

        if (!vibrating) { startVibration(app); vibrating = true }

        val alive = try { player != null && player?.isPlaying == true } catch (_: Exception) { false }
        if (alive) return false

        try { player?.release() } catch (_: Exception) {}
        player = null

        val uri = RingtoneManager.getActualDefaultRingtoneUri(app, RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getActualDefaultRingtoneUri(app, RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        try {
            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setDataSource(app, uri)
                isLooping = true
                setOnErrorListener { _, _, _ ->
                    try { player?.release() } catch (_: Exception) {}
                    player = null; true
                }
                setOnPreparedListener { it.start() }
                prepareAsync()
            }
        } catch (_: Exception) { player = null }
        return true
    }

    /** Convenience for one-off use (e.g. the "Test the alarm" button). */
    fun start(context: Context) { ensureAlarming(context) }

    // ---- QUIET reminder ------------------------------------------------------
    @Synchronized
    fun ensureReminding(context: Context) {
        val app = context.applicationContext
        if (mode == REMIND) return
        acquireWake(app)

        // Drop the loud playback + vibration, keep a soft reminder going.
        try { player?.stop() } catch (_: Exception) {}
        try { player?.release() } catch (_: Exception) {}
        player = null
        if (vibrating) { try { vibrator?.cancel() } catch (_: Exception) {}; vibrating = false }

        // Moderate the alarm volume so the reminder is quiet but audible.
        val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        saveVolume(audio)
        try {
            val max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            audio.setStreamVolume(AudioManager.STREAM_ALARM, (max * 0.4).toInt().coerceAtLeast(1), 0)
        } catch (_: Exception) {}

        mode = REMIND
        startReminder()
    }

    private fun startReminder() {
        reminderThread = Thread {
            var tg: ToneGenerator? = null
            try { tg = ToneGenerator(AudioManager.STREAM_ALARM, 70) } catch (_: Exception) {}
            try {
                while (mode == REMIND) {
                    try { tg?.startTone(ToneGenerator.TONE_PROP_BEEP2, 250) } catch (_: Exception) {}
                    Thread.sleep(12_000)
                }
            } catch (_: InterruptedException) {
            } finally {
                try { tg?.release() } catch (_: Exception) {}
            }
        }.also { it.isDaemon = true; it.start() }
    }

    private fun stopReminder() {
        reminderThread?.interrupt()
        reminderThread = null
    }

    // ---- Stop everything -----------------------------------------------------
    @Synchronized
    fun stop(context: Context) {
        mode = OFF
        stopReminder()
        try { player?.stop() } catch (_: Exception) {}
        try { player?.release() } catch (_: Exception) {}
        player = null

        if (vibrating) { try { vibrator?.cancel() } catch (_: Exception) {}; vibrating = false }
        vibrator = null

        if (previousAlarmVolume >= 0) {
            try {
                val audio = context.applicationContext
                    .getSystemService(Context.AUDIO_SERVICE) as AudioManager
                audio.setStreamVolume(AudioManager.STREAM_ALARM, previousAlarmVolume, 0)
            } catch (_: Exception) {}
            previousAlarmVolume = -1
        }

        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
    }

    // ---- helpers -------------------------------------------------------------
    private fun saveVolume(audio: AudioManager) {
        if (previousAlarmVolume < 0) {
            previousAlarmVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM)
        }
    }

    private fun acquireWake(app: Context) {
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "NightAlert:alarm"
            ).apply { setReferenceCounted(false) }
        }
        try { wakeLock?.acquire(15 * 60 * 1000L) } catch (_: Exception) {}
    }

    private fun startVibration(context: Context) {
        vibrator = vibratorOf(context)
        val pattern = longArrayOf(0, 800, 400, 800, 400, 800)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (_: Exception) {}
    }

    private fun vibratorOf(context: Context): Vibrator {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }
}
