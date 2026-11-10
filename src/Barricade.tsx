import { useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import gsap from 'gsap';

const BEATS = [
  ['Paris · 26 July 1830', 'Charles X has signed four ordinances: the press muzzled, the new Chamber dissolved, the vote cut down to the richest. The printers walk out first.'],
  ['27 July', 'Rip up the paving stones. Roll the barrels. Turn the carts over. Saw down the trees on the boulevards. You are on the barricade.'],
  ['28 July', 'The tricolour goes up on the towers of Notre-Dame. The fighting is around the Hôtel de Ville. From the windows, people throw tiles and furniture down on the soldiers.'],
  ['29 July', 'The Louvre and the Tuileries fall. Three days, the Trois Glorieuses, and the king is finished.'],
  ['After', 'Hundreds died on the barricades. Their names are engraved on the July Column at Bastille. Delacroix painted them that autumn.'],
];
const STONES = Array.from({ length: 48 }, (_, i) => {
  const row = Math.floor(i / 8), col = i % 8;
  return { x: 14 + col * 48 + (row % 2) * 22 + ((i * 37) % 11) - 5, y: 136 - row * 17 - ((i * 13) % 5), w: 38 + ((i * 7) % 9), r: ((i * 29) % 14) - 7 };
});
const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// First-person scroll scene for the July 1830 barricades: scroll walks you up to the barricade, the pointer looks around.
export default function Barricade() {
  const root = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState(0);

  useLayoutEffect(() => {
    const el = root.current!;
    const beats = el.querySelectorAll('.bq-beat');
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: reduced ? false : 0.6 } });
      tl.fromTo('.bq-world', { scale: 1 }, { scale: 1.45, ease: 'none', duration: beats.length }, 0);
      beats.forEach((b, i) => {
        tl.fromTo(b, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.3 }, i);
        if (i < beats.length - 1) tl.to(b, { autoAlpha: 0, y: -20, duration: 0.3 }, i + 0.7);
      });
    }, el);
    return () => ctx.revert();
  }, []);

  const look = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    gsap.to(root.current!.querySelector('.bq-look'), { rotateY: ((e.clientX - r.left) / r.width - 0.5) * 10, rotateX: -((e.clientY - r.top) / r.height - 0.5) * 6, duration: 0.6 });
  };
  const pry = () => {
    setExtra((n) => n + 1);
    if (!reduced) gsap.fromTo(root.current!.querySelector('.bq-look'), { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
  };

  return (
    <div ref={root} className="barricade">
      <div className="bq-stage" onPointerMove={look}>
        <div className="bq-look">
          <div className="bq-world" aria-hidden>
            <div className="bq-sky" />
            <div className="bq-wall l" />
            <div className="bq-wall r" />
            <div className="bq-street" />
            <div className="bq-smoke" />
            <div className="bq-flashes">{BEATS.concat(BEATS).map((_, i) => <i key={i} style={{ left: `${8 + i * 9}%`, top: `${26 + (i % 3) * 9}%`, animationDelay: `${(i * 0.37) % 2.6}s` }} />)}</div>
            <svg className="bq-pile" viewBox="0 0 400 160" preserveAspectRatio="xMidYMax meet">
              <line x1="206" y1="62" x2="206" y2="0" stroke="#1a120c" strokeWidth="3" />
              <g className="bq-flag"><rect x="208" y="4" width="22" height="34" fill="#21468b" /><rect x="230" y="4" width="22" height="34" fill="#f2ede4" /><rect x="252" y="4" width="22" height="34" fill="#ae1c28" /></g>
              <g fill="#2b221b" stroke="#120c07" strokeWidth="1.5">
                {STONES.map((s, i) => <rect key={i} x={s.x} y={s.y} width={s.w} height="18" rx="3" transform={`rotate(${s.r} ${s.x + s.w / 2} ${s.y + 9})`} />)}
                {Array.from({ length: extra }, (_, i) => <rect key={`e${i}`} className="bq-new" x={40 + ((i * 53) % 300)} y={48 - Math.floor(i / 6) * 14} width="40" height="16" rx="3" />)}
              </g>
              <g stroke="#120c07" strokeWidth="5" fill="none"><circle cx="74" cy="104" r="40" />{[0, 30, 60, 90, 120, 150].map((a) => <line key={a} x1="74" y1="104" x2={74 + 40 * Math.cos((a * Math.PI) / 180)} y2={104 + 40 * Math.sin((a * Math.PI) / 180)} />)}</g>
              <rect x="300" y="78" width="52" height="66" rx="14" fill="#3d2a1a" stroke="#120c07" strokeWidth="4" />
            </svg>
          </div>
        </div>
        <div className="bq-text">{BEATS.map(([d, t]) => <p key={d} className="bq-beat"><b>{d}</b>{t}</p>)}</div>
        <button className="bq-pry" onClick={pry}>Pry up a paving stone{extra ? ` · ${extra}` : ''}</button>
      </div>
    </div>
  );
}
