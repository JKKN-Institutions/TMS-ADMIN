/**
 * announce — says a scan result out loud, so the staffer at the bus door hears
 * who boarded without a booking without looking down at the phone.
 *
 * Only unbooked riders are announced. The voice is a cue to the staffer, never
 * a decision: the server still records the scan and has the last word.
 *
 * Uses the browser's own speech (Web Speech API): no library, no network.
 * iPhones only allow speech that starts from a tap, so the Scan button calls
 * primeSpeech() first; later announcements from camera reads then work.
 */

/**
 * Names are stored in capitals ("AJAY P"), and phone voices spell an
 * all-capitals word out letter by letter, as if it were an abbreviation.
 * Written as "Ajay P" the name is read as a name; a one-letter initial is
 * still said as a letter, which is right.
 */
export function spokenName(name: string | null | undefined): string {
  return (name ?? '')
    .replace(/[.\s]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length === 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/** What is said for an unbooked rider. */
export function withoutBookingPhrase(name: string | null | undefined): string {
  const spoken = spokenName(name);
  if (!spoken || spoken === 'Learner') return 'Learner, without booking';
  return `${spoken}, without booking`;
}

/** "Sri Prasath P, booked on bus 24": the learner booked a different bus today. */
export function bookedOnBusPhrase(name: string | null | undefined, routeNumber: string | null | undefined): string {
  return `${spokenName(name) || 'Learner'}, booked on ${busWords(routeNumber)}`;
}

/** "Ajay P, belongs to bus 24": the learner is from another bus and did not book this one. */
export function belongsToBusPhrase(name: string | null | undefined, routeNumber: string | null | undefined): string {
  return `${spokenName(name) || 'Learner'}, belongs to ${busWords(routeNumber)}`;
}

/**
 * What to say for a scan, or null for silence (a booked learner on the right
 * bus). One rule for the phone's saved list, the server's reply and an offline
 * save, so they can never disagree about what the staffer hears.
 *
 *   another bus booked    -> "X, booked on bus N"
 *   from another bus      -> "X, belongs to bus N"
 *   not booked            -> "X, without booking"
 */
export function scanAnnouncement(input: {
  name: string | null | undefined;
  /** Booked on THIS bus (the saved list) or on any bus (the server). */
  booked: boolean;
  otherBus?: { kind: 'booked' | 'boarded' | 'from'; routeNumber: string | null } | null;
  /** Someone had already marked this learner present; nothing was written. */
  alreadyMarked?: boolean;
  /** Kept on the phone because there was no signal. */
  offlineSaved?: boolean;
}): string {
  const who = spokenName(input.name) || 'Learner';
  // Said first because it is what the staffer must act on: the learner is
  // through either way, but this one means "someone else already had them".
  if (input.alreadyMarked) return `${who}, already marked`;
  if (input.offlineSaved) return `${who}, saved on phone`;
  const other = input.otherBus ?? null;
  if (other?.kind === 'booked') return bookedOnBusPhrase(input.name, other.routeNumber);
  if (other?.kind === 'from') return belongsToBusPhrase(input.name, other.routeNumber);
  if (!input.booked) return withoutBookingPhrase(input.name);
  return `${who}, present`;
}

/**
 * The second, shorter sentence: what the SERVER knows and the phone did not.
 * Null when it adds nothing, so an ordinary paid booked learner hears one
 * sentence and the queue keeps moving.
 */
export function scanExtras(input: {
  /** As decided by lib/boarding/fee-badge.ts, the tested rule for the panel. */
  feeTone?: 'paid' | 'overdue' | 'due' | 'none' | 'unknown' | null;
  overCapacity?: boolean;
}): string | null {
  const parts: string[] = [];
  if (input.feeTone === 'overdue' || input.feeTone === 'due') parts.push('Fees not paid');
  if (input.overCapacity) parts.push('Bus full');
  return parts.length ? parts.join('. ') : null;
}

/**
 * A refused scan, said in the fewest words that tell the staffer what to do.
 * `reason` is the server's machine-readable code; the text falls back to a
 * generic "not saved" so a new refusal is never announced as success.
 */
export function refusalAnnouncement(reason: string | null | undefined): string {
  switch (reason) {
    case 'card_unknown': return 'Card not recognised';
    case 'card_retired': return 'Card retired';
    case 'not_learner_card': return 'Not a learner card';
    case 'not_a_card': return 'Not a learner card';
    case 'no_route': return 'No bus for this learner';
    case 'not_your_bus': return 'Not your bus';
    case 'window_closed': return 'Scanning closed';
    case 'scan_off': return 'Scanning is off';
    case 'forbidden': return 'Not allowed';
    case 'learner_not_found': return 'Learner not found';
    // Refused on the phone itself.
    case 'typed_card': return 'Point the camera at the card';
    case 'photo_unreadable': return 'Card not read, try again';
    case 'needs_signal': return 'Needs signal';
    default: return 'Not saved, try again';
  }
}

/** The server's wrong-bus reply, in the saved list's terms. */
export function otherBusFromReply(
  wrongBus: { kind: 'booked_other_bus' | 'foreign_learner'; routeNumber: string | null } | null | undefined,
): { kind: 'booked' | 'from'; routeNumber: string | null } | null {
  if (!wrongBus) return null;
  return { kind: wrongBus.kind === 'booked_other_bus' ? 'booked' : 'from', routeNumber: wrongBus.routeNumber };
}

/**
 * "bus 24". A leading zero is dropped so "06" is said "bus 6", not "bus zero
 * six"; an unknown number becomes "another bus".
 */
function busWords(routeNumber: string | null | undefined): string {
  const n = (routeNumber ?? '').trim();
  if (!n) return 'another bus';
  return `bus ${/^\d+$/.test(n) ? String(Number(n)) : n}`;
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
    // Asking for the voices starts loading them, so the first real
    // announcement does not wait for the list.
    synth.getVoices();
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
    // Cancel only when something is actually playing: on Android Chrome a
    // cancel() right before speak() can hold up or drop the new sentence.
    if (synth.speaking || synth.pending) synth.cancel();
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
