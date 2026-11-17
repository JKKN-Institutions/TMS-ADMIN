import type { Transition, Variants } from 'framer-motion';

/*
 * Timing for the sign-in screen, kept in one place so it can be tuned without
 * hunting through the markup. Motion (motion.dev) ships in this project under
 * its earlier package name, framer-motion.
 *
 * `staggerChildren` is the v11 spelling; `delayChildren: stagger()` needs v12+.
 */

/** Text and blocks: settle without overshoot. */
export const SPRING_SOFT: Transition = { type: 'spring', visualDuration: 0.5, bounce: 0 };
/** The sign-in card: a touch of lift. */
export const SPRING_CARD: Transition = { type: 'spring', visualDuration: 0.6, bounce: 0.12 };
/** The bus icon tile on the card. */
export const SPRING_POP: Transition = { type: 'spring', visualDuration: 0.45, bounce: 0.35 };
/** Hover and press feedback. */
export const SPRING_PRESS: Transition = { type: 'spring', visualDuration: 0.22, bounce: 0.2 };
/** The bus arriving: long, with a small overshoot as it catches up with the road. */
export const SPRING_DRIVE: Transition = { type: 'spring', visualDuration: 1.1, bounce: 0.18 };

/** Left panel: children arrive one after another. */
export const panelStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/** The three feature cards. */
export const listStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: SPRING_SOFT },
};

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.7 },
  show: { opacity: 1, scale: 1, transition: SPRING_POP },
};

/** The sign-in card lifts in, then its contents follow. */
export const card: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.985 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { ...SPRING_CARD, delay: 0.15, delayChildren: 0.3, staggerChildren: 0.05 },
  },
};

/** The bus drives in from the right. `custom` is how far away it starts, in px. */
export const driveIn: Variants = {
  hidden: (distance: number) => ({ opacity: 0, x: distance }),
  show: {
    opacity: 1,
    x: 0,
    transition: { x: SPRING_DRIVE, opacity: { duration: 0.3, ease: 'easeOut' } },
  },
};
