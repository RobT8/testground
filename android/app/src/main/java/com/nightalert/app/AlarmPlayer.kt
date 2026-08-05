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
 * The actual noise-maker. Plays a looping tone on the ALARM audio stream, which
 * sounds even when the phone is on silent / Do Not Disturb, and forces the alarm
 * volume to maximum. Also vibrates and holds a wake lock.
 */
object AlarmPlayer {
    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var previousAlarmVolume = -1
    @Volatile var isPlaying = false
        private set

    @Synchronized
    fun start(context: Context) {
        if (isPlaying) return
        isPlaying = true

        val app = context.applicationContext

        // Keep the CPU awake while ringing.
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            "NightAlert:alarm"
        ).also { it.setReferenceCounted(false); it.acquire(10 * 60 * 1000L) }

        // Force alarm volume to max (remember the old value to restore later).
        val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        previousAlarmVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM)
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        try { audio.setStreamVolume(AudioManager.STREAM_ALARM, max, 0) } catch (_: Exception) {}

        // Prefer the system alarm sound; fall back to the default ringtone.
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
                setOnPreparedListener { it.start() }
                prepareAsync()
            }
        } catch (e: Exception) {
            // If the ringtone can't load, at least keep vibrating.
            player = null
        }

        // Vibrate in a repeating pattern.
        vibrator = vibratorOf(app)
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

    @Synchronized
    fun stop(context: Context) {
        isPlaying = false
        try { player?.stop() } catch (_: Exception) {}
        try { player?.release() } catch (_: Exception) {}
        player = null

        try { vibrator?.cancel() } catch (_: Exception) {}
        vibrator = null

        // Restore the previous alarm volume.
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
