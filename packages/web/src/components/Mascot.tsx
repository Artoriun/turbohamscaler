import type { ImgHTMLAttributes } from 'react';
import evolution from '../assets/turboham-evolution.gif';
import evolutionStill from '../assets/turboham-evolution-still.png';
import mark from '../assets/turboham-mark.gif';
import markStill from '../assets/turboham-mark-still.png';

/**
 * TurboHam, with a still frame for anyone who asked not to be animated.
 *
 * The site's `prefers-reduced-motion` rules set `animation: none`, which does nothing here — a
 * GIF is not a CSS animation, so it keeps playing however loudly the CSS objects. `<picture>`
 * is the only way to honour the preference for one: the browser picks the source before it
 * fetches, so a reduced-motion visitor never downloads the animation at all.
 *
 * This matters more than the usual motion-sickness case. The evolution is a white flash, and
 * flashing is the one kind of motion that can trigger a seizure. It is kept within WCAG 2.3.1
 * on two counts — three flashes per burst, and a flash area well under a quarter of the central
 * visual field — but "within the threshold" is a floor, not a guarantee, so the preference is
 * worth actually honouring.
 *
 * Sizes and alt text stay at the call site: the header mark and the hero run at different
 * sizes, and only one of them is worth describing (the header's sits beside the wordmark, so
 * describing it would make a screen reader read the brand twice).
 */
const ART = {
  mark: [mark, markStill],
  evolution: [evolution, evolutionStill],
} as const;

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  art: keyof typeof ART;
  /** Required rather than optional: an undescribed mascot is a bug, `alt=""` is a decision. */
  alt: string;
};

export default function Mascot({ art, alt, ...img }: Props) {
  const [animated, still] = ART[art];
  return (
    <picture>
      <source srcSet={still} media="(prefers-reduced-motion: reduce)" />
      {/* `alt` is named rather than left in the spread so the a11y lint can see it. */}
      <img src={animated} alt={alt} {...img} />
    </picture>
  );
}
