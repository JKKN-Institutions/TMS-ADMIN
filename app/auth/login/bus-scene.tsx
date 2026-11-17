'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';
import { m, useReducedMotion, type Transition } from 'framer-motion';
import transportBus from '@/public/images/transport.png';
import { driveIn } from './login-motion';
import styles from './login.module.css';

/*
 * The JKKN college bus, always driving.
 *
 * The bus is a photograph, so it can only move as one piece. It reads as
 * driving because the world moves past it: road dashes run underneath, the
 * body rides its suspension, dust trails the rear wheel.
 *
 * Every never-ending loop here animates the full `transform` string (or
 * opacity). In framer-motion 11 those are the values that run on the
 * compositor; the `x` / `y` / `rotate` shorthands are recomputed in JavaScript
 * every frame. Keep it that way, with no `repeatDelay` and no
 * `repeatType: 'mirror'` (both switch the compositor path off), and keep one
 * job per element — hence the nested wrappers.
 *
 * Must render inside <LazyMotion> (see page.tsx).
 */

type Size = 'compact' | 'large';

/** Distances in px. `compact` is the phone / tablet bus, `large` the desktop one. */
const TUNING = {
  compact: { enter: -160, dash: 44, ride: [-1.2, -0.6], surge: [-5, 3], dust: 14 },
  large: { enter: 0, dash: 88, ride: [-2, -1], surge: [-8, 5], dust: 26 },
} as const;

/** Seconds for the road to travel one dash. Lower is a faster bus. */
const DASH_SECONDS = 0.36;
/** One full ride cycle (two soft bounces). The ground shadow breathes in step. */
const RIDE_SECONDS = 1.6;
/** Desktop: one trip across the panel, including a short wait off-screen. */
const CROSS_SECONDS = 8;

/** Wind streaks: where they run (% of their lane) and how they are staggered. */
const STREAKS: Record<Size, { top: string; duration: number; delay: number }[]> = {
  compact: [
    { top: '6%', duration: 1.9, delay: 0.9 },
    { top: '26%', duration: 2.5, delay: 1.8 },
  ],
  large: [
    { top: '5%', duration: 2.0, delay: 0.9 },
    { top: '31%', duration: 2.6, delay: 1.7 },
    { top: '60%', duration: 2.2, delay: 2.4 },
  ],
};

/*
 * Rim centres and sizes, in % of the photo (512 x 287), measured off the PNG.
 * `squash` flattens a circle into the ellipse the rim makes at this angle.
 */
const WHEELS = [
  { id: 'front', left: '63%', top: '84.7%', width: '3.6%', height: '16.5%', squash: 0.39 },
  { id: 'rear', left: '81.1%', top: '77.3%', width: '2.1%', height: '12.3%', squash: 0.3 },
] as const;

const forever = (duration: number, rest: Transition = {}): Transition => ({
  duration,
  ease: 'linear',
  repeat: Infinity,
  repeatType: 'loop',
  ...rest,
});

export function BusScene({ size, className = '' }: { size: Size; className?: string }) {
  // With "reduce motion" on, the same elements render but nothing is started:
  // the bus stands on a still road and the streaks, dust and wheel blur stay
  // at their CSS default of invisible.
  const still = useReducedMotion() === true;
  const large = size === 'large';
  const t = TUNING[size];

  return (
    <div className={`${styles.scene} ${large ? styles.sceneLarge : ''} ${className}`}>
      {/* The stage is exactly the photo's shape, so every layer below can be
          placed in % of the bus. */}
      <div className={large ? styles.stageLarge : styles.stageCompact}>
        {/* Road. Phone: the bus cruises in place heading right, so the dashes run
            left. Desktop: the bus itself crosses the panel, so the road is still. */}
        <div
          aria-hidden="true"
          className={`${styles.road} ${large ? styles.roadLarge : styles.roadCompact}`}
          style={{ '--dash': `${t.dash}px` } as CSSProperties}
        >
          <m.div
            className={styles.roadDashes}
            animate={
              still || large ? undefined : { transform: ['translateX(0px)', `translateX(${-t.dash}px)`] }
            }
            transition={forever(DASH_SECONDS)}
          />
        </div>

        {/* Wind streaks, behind the bus. */}
        <div
          aria-hidden="true"
          className={`${styles.streaks} ${large ? styles.streaksLarge : styles.streaksCompact}`}
        >
          {STREAKS[size].map(({ top, duration, delay }) => (
            <m.span
              key={top}
              className={styles.streak}
              style={{ top }}
              animate={
                still || large
                  ? undefined
                  : { transform: ['translateX(100%)', 'translateX(-15%)'], opacity: [0, 1, 1, 0] }
              }
              // Per-value: `times` must match each value's own keyframe count.
              transition={{
                transform: forever(duration, { delay }),
                opacity: forever(duration, { delay, times: [0, 0.15, 0.8, 1] }),
              }}
            />
          ))}
        </div>

        {/* 1. Phone: arrives from the left, once. Desktop: just fades in. */}
        <m.div variants={driveIn} custom={t.enter} className="relative">
          {/* Desktop: drives across the whole green panel, left edge to right
              edge, then waits off-screen a moment and comes again. cqw is the
              scene width, so 110cqw is always fully out of the panel. */}
          <m.div
            animate={
              still || !large
                ? undefined
                : {
                    transform: [
                      'translateX(-110cqw)',
                      'translateX(110cqw)',
                      'translateX(110cqw)',
                    ],
                  }
            }
            transition={forever(CROSS_SECONDS, { times: [0, 0.88, 1] })}
          >
          {/* The photo faces left; mirrored so the bus heads right. Everything
              inside (dust, wheel spin, drift) mirrors with it. */}
          <div style={{ transform: 'scaleX(-1)' }}>
          {/* 2. Eases a little ahead and back, so the cruise never looks mechanical. */}
          <m.div
            animate={
              still
                ? undefined
                : {
                    transform: [
                      'translateX(0px)',
                      `translateX(${t.surge[0]}px)`,
                      'translateX(0px)',
                      `translateX(${t.surge[1]}px)`,
                      'translateX(0px)',
                    ],
                  }
            }
            transition={forever(9, { ease: 'easeInOut', times: [0, 0.3, 0.55, 0.8, 1] })}
          >
            <m.span
              aria-hidden="true"
              className={`absolute inset-x-[8%] bottom-[2%] h-[14%] rounded-[50%] bg-green-950/45 ${
                large ? 'blur-lg' : 'blur-md'
              }`}
              animate={
                still
                  ? undefined
                  : {
                      transform: [
                        'scaleX(1)',
                        'scaleX(0.96)',
                        'scaleX(1)',
                        'scaleX(0.98)',
                        'scaleX(1)',
                      ],
                    }
              }
              transition={forever(RIDE_SECONDS, { ease: 'easeInOut' })}
            />

            {/* 3. Rides its suspension. */}
            <m.div
              className={styles.ride}
              animate={
                still
                  ? undefined
                  : {
                      transform: [
                        'translateY(0px) rotate(0deg)',
                        `translateY(${t.ride[0]}px) rotate(-0.3deg)`,
                        'translateY(0px) rotate(0deg)',
                        `translateY(${t.ride[1]}px) rotate(0.2deg)`,
                        'translateY(0px) rotate(0deg)',
                      ],
                    }
              }
              transition={forever(RIDE_SECONDS, { ease: 'easeInOut' })}
            >
              <Image
                src={transportBus}
                alt="JKKN college bus"
                sizes={
                  large
                    ? '(min-width: 1024px) 45vw, 1px'
                    : '(max-width: 639px) 52vw, (max-width: 1023px) 40vw, 1px'
                }
                // The phone bus is the largest thing on a phone screen; the
                // desktop one is display:none there, so it stays lazy.
                loading={large ? 'lazy' : 'eager'}
                className={`relative block h-auto w-full ${
                  large
                    ? 'drop-shadow-[0_16px_20px_rgba(5,46,22,0.45)]'
                    : 'drop-shadow-[0_10px_14px_rgba(5,46,22,0.45)]'
                }`}
              />

              {/* A photo's wheels cannot turn, so each rim gets a soft blur
                  disc with a glint going round it. Fades in as the bus gets
                  going. */}
              {WHEELS.map((w) => (
                <m.span
                  key={w.id}
                  aria-hidden="true"
                  className={styles.wheel}
                  style={{ left: w.left, top: w.top, width: w.width, height: w.height }}
                  animate={still ? undefined : { opacity: 1 }}
                  transition={{ delay: 0.7, duration: 0.6 }}
                >
                  <span
                    className={styles.wheelRim}
                    style={{ transform: `translateX(-50%) scaleX(${w.squash})` }}
                  >
                    <m.span
                      className={styles.wheelGlint}
                      animate={
                        still ? undefined : { transform: ['rotate(0deg)', 'rotate(-360deg)'] }
                      }
                      transition={forever(0.5)}
                    />
                  </span>
                </m.span>
              ))}
            </m.div>

            {/* Dust behind the rear wheel. */}
            {[0, 0.55].map((offset) => (
              <m.span
                key={offset}
                aria-hidden="true"
                className={styles.dust}
                animate={
                  still
                    ? undefined
                    : {
                        transform: [
                          'translate(0px, 0px) scale(0.4)',
                          `translate(${t.dust}px, ${-t.dust * 0.3}px) scale(1.6)`,
                        ],
                        opacity: [0, 0.38, 0],
                      }
                }
                transition={forever(1.1, { ease: 'easeOut', delay: 1 + offset })}
              />
            ))}
          </m.div>
          </div>
          </m.div>
        </m.div>
      </div>
    </div>
  );
}
