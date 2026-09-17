/**
 * announce — says a scan result out loud, so the staffer at the bus door hears
 * who boarded without a ticket without looking down at the phone.
 *
 * Only unbooked riders are announced. The mark is already recorded by the time
 * this runs; the voice is a cue to the staffer, never a decision.
 *
 * Uses the browser's own speech (Web Speech API): no library, no network.
 * iPhones only allow speech that starts from a tap, so the Scan button calls
 * primeSpeech() first; later announcements from camera reads then work.
 */

/** What is said for an unbooked rider. */
export function withoutTicketPhrase(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim();
  if (!clean || clean === 'Learner') return 'Learner without ticket';
  return `${clean}, without ticket`;
}

function speech(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** Indian English when the phone has it, which reads Indian names better. */
function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  return (
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null
  );
}

/** Call from a tap handler. Unlocks speech on iPhone; harmless elsewhere. */
export function primeSpeech(): void {
  const synth = speech();
  if (!synth) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  } catch {
    /* speech is a nicety; never break the scan screen */
  }
}

const MUTE_KEY = 'tms.boarding.voiceMuted';

/**
 * The staffer's mute choice, kept on this phone. Storage can be blocked
 * (private tab), so a failed read means "not muted" and a failed write only
 * lasts for this page.
 */
let mutedFallback = false;

export function isVoiceMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return mutedFallback;
  }
}

export function setVoiceMuted(muted: boolean): void {
  mutedFallback = muted;
  try {
    if (muted) window.localStorage.setItem(MUTE_KEY, '1');
    else window.localStorage.removeItem(MUTE_KEY);
  } catch {
    /* kept in memory for this page */
  }
  // Muting stops a sentence already being said.
  if (muted) {
    try {
      speech()?.cancel();
    } catch {
      /* ignore */
    }
  }
}

/** Say `text` now, cutting off anything still being said for an earlier scan. */
export function speak(text: string): void {
  const synth = speech();
  if (!synth || isVoiceMuted()) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(synth);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = 'en-IN';
    }
    u.rate = 1;
    u.volume = 1;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}
