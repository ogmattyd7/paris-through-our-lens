import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import gsap from 'gsap';
import art from './data/barricade.json';

const artUrl = (f: string) => `${import.meta.env.BASE_URL}art/${f}`;
const BEATS: [string, string, string][] = [
  ['Paris · 26 July 1830', 'Charles X has signed four ordinances: the press muzzled, the new Chamber dissolved, the vote cut down to the richest. The printers walk out first.', 'barricade-1'],
  ['27 July', 'Rip up the paving stones. Roll the barrels. Turn the carts over. Saw down the trees on the boulevards. You are on the barricade.', 'barricade-2'],
  ['28 July', 'The tricolour goes up on the towers of Notre-Dame. The fighting is around the Hôtel de Ville. From the windows, people throw tiles and furniture down on the soldiers.', 'barricade-3'],
  ['29 July', 'The Louvre and the Tuileries fall. Three days, the Trois Glorieuses, and the king is finished.', 'barricade-4'],
  ['After', 'Hundreds died on the barricades. Their names are engraved on the July Column at Bastille. Delacroix painted them that autumn.', 'systeme-violent'],
];
const credit = (id: string) => {
  const a = art.find((x) => x.id === id);
  return a ? [a.title, a.artist].filter(Boolean).join(' · ') : 'Eugène Delacroix, Liberty Leading the People, 1830';
};
const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// First-person scroll scene for the July 1830 barricades, built from paintings and prints of the fighting:
// scroll pushes you forward through the three days, the pointer looks around.
export default function Barricade() {
  const root = useRef<HTMLDivElement>(null);
  const [pried, setPried] = useState(0);

  useLayoutEffect(() => {
    if (reduced) return;
    const el = root.current!;
    const beats = el.querySelectorAll('.bq-beat');
    const shots = el.querySelectorAll('.bq-shot');
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: 0.6 } });
      shots.forEach((s, i) => {
        tl.fromTo(s, { scale: 1.06 }, { scale: 1.28, ease: 'none', duration: 1.3 }, i - 0.15);
        if (i) tl.fromTo(s, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, i - 0.15);
      });
      beats.forEach((b, i) => {
        tl.fromTo(b, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.3 }, i);
        if (i < beats.length - 1) tl.to(b, { autoAlpha: 0, y: -20, duration: 0.3 }, i + 0.7);
      });
      gsap.to('.bq-sway', { x: 6, y: -4, rotation: 0.4, duration: 2.8, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    }, el);
    return () => ctx.revert();
  }, []);

  const look = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(root.current!.querySelector('.bq-look'), { x: -dx * 40, y: -dy * 24, duration: 0.8 });
    gsap.to(root.current!.querySelector('.bq-near'), { x: -dx * 90, y: -dy * 40, duration: 0.8 });
  };
  const pry = () => {
    setPried((n) => n + 1);
    if (reduced) return;
    const el = root.current!;
    gsap.fromTo(el.querySelector('.bq-sway'), { y: 10 }, { y: 0, duration: 0.6, ease: 'elastic.out(1, 0.25)' });
    gsap.fromTo(el.querySelector('.bq-dust'), { autoAlpha: 0.85, scale: 0.6 }, { autoAlpha: 0, scale: 1.6, duration: 1.4, ease: 'power2.out' });
  };

  return (
    <div ref={root} className="barricade">
      <div className="bq-stage" onPointerMove={look}>
        <div className="bq-sway">
          <div className="bq-look" aria-hidden>
            {BEATS.map(([d, , id], i) => (
              <figure key={d} className="bq-shot" style={i ? { opacity: 0 } : undefined}>
                <img src={artUrl(`${id}-1600.webp`)} srcSet={`${artUrl(`${id}-900.webp`)} 900w, ${artUrl(`${id}-1600.webp`)} 1600w`} sizes="100vw" alt="" loading="lazy" decoding="async" />
                <figcaption>{credit(id)}</figcaption>
              </figure>
            ))}
          </div>
          <div className="bq-near" aria-hidden>
            <div className="bq-smoke" />
            <div className="bq-smoke b" />
            <div className="bq-flashes">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ left: `${10 + i * 9}%`, top: `${38 + (i % 3) * 8}%`, animationDelay: `${(i * 0.53) % 3.1}s` }} />)}</div>
            <div className="bq-dust" />
          </div>
        </div>
        <div className="bq-grade" aria-hidden />
        <div className="bq-text">{BEATS.map(([d, t]) => <p key={d} className="bq-beat"><b>{d}</b>{t}</p>)}</div>
        <button className="bq-pry" onClick={pry}>Pry up a paving stone{pried ? ` · ${pried}` : ''}</button>
      </div>
    </div>
  );
}
