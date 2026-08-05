package com.nightalert.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * The noise-maker. Plays a looping tone on the ALARM audio stream (sounds even
 * on silent / Do Not Disturb) at forced-maximum volume, plus vibration + wake lock.
 *
 * It is designed to be RELENTLESS: `ensureAlarming` is idempotent and self-healing,
 * so calling it repeatedly (the watcher does, every few seconds) will restart the
 * sound if it ever stops and re-max the volume if it was turned down — the alarm
 * only truly ends when [stop] is called (on confirm, or a carer's cancel).
 */
object AlarmPlayer {
    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var previousAlarmVolume = -1
    @Volatile private var vibrating = false
    @Volatile var isPlaying = false
        private set

    /**
     * Make sure the alarm is sounding loudly, right now. Safe to call repeatedly.
     * @return true if it had to (re)start the sound this call (it wasn't already
     *         playing) — the watcher uses this to re-surface the full-screen UI.
     */
    @Synchronized
    fun ensureAlarming(context: Context): Boolean {
        val app = context.applicationContext
        isPlaying = true

        // Hold/refresh a wake lock so the CPU keeps running while ringing.
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (wakeLock == null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "NightAlert:alarm"
            ).apply { setReferenceCounted(false) }
        }
        try { wakeLock?.acquire(15 * 60 * 1000L) } catch (_: Exception) {}

        // Force alarm volume to maximum every call — defeats a sleepy volume-down.
        val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (previousAlarmVolume < 0) {
            previousAlarmVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM)
        }
        try {
            val max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            audio.setStreamVolume(AudioManager.STREAM_ALARM, max, 0)
        } catch (_: Exception) {}

        // Keep vibrating.
        if (!vibrating) { startVibration(app); vibrating = true }

        // If the player is alive and actually playing, nothing more to do.
        val alive = try { player != null && player?.isPlaying == true } catch (_: Exception) { false }
        if (alive) return false

        // Otherwise (re)create it.
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
                // On any playback error, drop the player so the next ensure recreates it.
                setOnErrorListener { _, _, _ ->
                    try { player?.release() } catch (_: Exception) {}
                    player = null
                    true
                }
                setOnPreparedListener { it.start() }
                prepareAsync()
            }
        } catch (_: Exception) {
            player = null
        }
        return true
    }

    /** Convenience for one-off use (e.g. the "Test the alarm" button). */
    fun start(context: Context) { ensureAlarming(context) }

    @Synchronized
    fun stop(context: Context) {
        isPlaying = false
        try { player?.stop() } catch (_: Exception) {}
        try { player?.release() } catch (_: Exception) {}
        player = null

        if (vibrating) {
            try { vibrator?.cancel() } catch (_: Exception) {}
            vibrating = false
        }
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
