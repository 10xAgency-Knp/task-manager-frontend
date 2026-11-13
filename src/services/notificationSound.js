/**
 * Notification Alarm Sound & Voice Alert Service
 *
 * Synthesizes crisp multi-tone notification chimes using Web Audio API (no external MP3 files required)
 * and supports optional browser SpeechSynthesis voice announcements when new notifications arrive.
 */

const SOUND_MODE_STORAGE_KEY = "crm10x_notif_sound_mode";
const LAST_ACTIVE_MODE_STORAGE_KEY = "crm10x_notif_sound_last_active";
const VALID_MODES = ["chime", "voice", "off"];

let sharedAudioContext = null;
let unlockListenersAttached = false;
let lastAlarmTimestamp = 0;

const alarmDebugState = {
  count: 0,
  lastAt: 0,
  lastMode: "chime",
  lastTitle: "",
  audioUnlocked: false,
};

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage restriction errors in private windows
  }
}

/**
 * Returns the active notification alarm mode: "chime" | "voice" | "off".
 * Defaults to "chime".
 */
export function getNotificationSoundMode() {
  const saved = readStorage(SOUND_MODE_STORAGE_KEY, "chime");
  return VALID_MODES.includes(saved) ? saved : "chime";
}

/**
 * Updates the notification alarm mode and persists it to localStorage.
 */
export function setNotificationSoundMode(mode) {
  const normalized = VALID_MODES.includes(mode) ? mode : "chime";
  writeStorage(SOUND_MODE_STORAGE_KEY, normalized);
  if (normalized !== "off") {
    writeStorage(LAST_ACTIVE_MODE_STORAGE_KEY, normalized);
  }
  return normalized;
}

/**
 * Toggles between muted ("off") and the user's last active alarm mode ("chime" or "voice").
 */
export function toggleNotificationSound() {
  const current = getNotificationSoundMode();
  if (current === "off") {
    const lastActive = readStorage(LAST_ACTIVE_MODE_STORAGE_KEY, "chime");
    return setNotificationSoundMode(lastActive === "voice" ? "voice" : "chime");
  }
  return setNotificationSoundMode("off");
}

/**
 * Returns true if notification alarm sound or voice alert is enabled.
 */
export function isNotificationSoundEnabled() {
  return getNotificationSoundMode() !== "off";
}

function ensureAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioCtx();
  }
  return sharedAudioContext;
}

/**
 * Unlocks/resumes the browser AudioContext on the first user gesture so later background
 * notification polling can play audio smoothly under browser autoplay policies.
 */
export function unlockNotificationAudio() {
  const ctx = ensureAudioContext();
  if (!ctx) return Promise.resolve(false);

  if (ctx.state === "running") {
    alarmDebugState.audioUnlocked = true;
    return Promise.resolve(true);
  }

  return ctx
    .resume()
    .then(() => {
      alarmDebugState.audioUnlocked = ctx.state === "running";
      if (typeof window !== "undefined") {
        window.__CRM_LAST_ALARM__ = { ...alarmDebugState };
      }
      return alarmDebugState.audioUnlocked;
    })
    .catch(() => false);
}

/**
 * Attaches passive user-interaction listeners once to unlock Web Audio on first click/key/tap.
 */
export function initNotificationAudioUnlock() {
  if (typeof document === "undefined" || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const handleFirstGesture = () => {
    unlockNotificationAudio().then((unlocked) => {
      if (unlocked) {
        document.removeEventListener("pointerdown", handleFirstGesture, true);
        document.removeEventListener("keydown", handleFirstGesture, true);
        document.removeEventListener("touchstart", handleFirstGesture, true);
      }
    });
  };

  document.addEventListener("pointerdown", handleFirstGesture, { capture: true, passive: true });
  document.addEventListener("keydown", handleFirstGesture, { capture: true, passive: true });
  document.addEventListener("touchstart", handleFirstGesture, { capture: true, passive: true });
}

function scheduleChimeTones(ctx) {
  const now = ctx.currentTime + 0.02;
  // Crisp two-step CRM notification alarm chime (A5 -> C#6 -> E6, repeated cleanly)
  const notes = [
    { freq: 880.0, start: 0.0, duration: 0.14, peak: 0.18 },
    { freq: 1108.73, start: 0.11, duration: 0.14, peak: 0.19 },
    { freq: 1318.51, start: 0.22, duration: 0.24, peak: 0.2 },
    { freq: 880.0, start: 0.52, duration: 0.12, peak: 0.15 },
    { freq: 1318.51, start: 0.63, duration: 0.28, peak: 0.19 },
  ];

  notes.forEach(({ freq, start, duration, peak }) => {
    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + start);

    harmonic.type = "sine";
    harmonic.frequency.setValueAtTime(freq * 2, now + start);

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.setValueAtTime(0.18, now + start);

    gainNode.gain.setValueAtTime(0.0001, now + start);
    gainNode.gain.exponentialRampToValueAtTime(peak, now + start + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

    osc.connect(gainNode);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now + start);
    harmonic.start(now + start);
    osc.stop(now + start + duration + 0.02);
    harmonic.stop(now + start + duration + 0.02);
  });
}

function speakNotificationAnnouncement(notificationItem) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const rawTitle = String(notificationItem?.title || "You have a new notification").trim();
    const spokenText = rawTitle.length > 90 ? rawTitle.slice(0, 90) : rawTitle;
    const utterance = new SpeechSynthesisUtterance(`New notification. ${spokenText}`);
    utterance.rate = 1.04;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore SpeechSynthesis errors in browsers/environments without TTS voices
  }
}

/**
 * Plays the notification alarm chime (and optional voice announcement) for a newly arrived notification.
 *
 * @param {Object|null} notificationItem
 * @param {{ force?: boolean }} options
 * @returns {Promise<{ played: boolean, mode: string }>}
 */
export async function playNotificationAlarm(notificationItem = null, options = {}) {
  const configuredMode = getNotificationSoundMode();
  const force = Boolean(options.force);

  if (configuredMode === "off" && !force) {
    return { played: false, mode: "off" };
  }

  const nowMs = Date.now();
  if (!force && nowMs - lastAlarmTimestamp < 400) {
    return { played: false, mode: configuredMode };
  }
  lastAlarmTimestamp = nowMs;

  const effectiveMode = configuredMode === "off" && force ? "chime" : configuredMode;
  let audioPlayed = false;

  try {
    const ctx = ensureAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }
      if (ctx.state === "running") {
        scheduleChimeTones(ctx);
        alarmDebugState.audioUnlocked = true;
        audioPlayed = true;
      }
    }
  } catch {
    // Web Audio failed or unavailable; fallback cleanly
  }

  if (effectiveMode === "voice") {
    speakNotificationAnnouncement(notificationItem);
    audioPlayed = true;
  }

  alarmDebugState.count += 1;
  alarmDebugState.lastAt = nowMs;
  alarmDebugState.lastMode = effectiveMode;
  alarmDebugState.lastTitle = String(notificationItem?.title || "");

  if (typeof window !== "undefined") {
    window.__CRM_LAST_ALARM__ = { ...alarmDebugState };
    try {
      window.dispatchEvent(
        new CustomEvent("crm-notif-alarm", { detail: { ...alarmDebugState } })
      );
    } catch {
      // Ignore event dispatch failure
    }
  }

  return { played: audioPlayed, mode: effectiveMode };
}

export function getLastAlarmDebugState() {
  return { ...alarmDebugState };
}
