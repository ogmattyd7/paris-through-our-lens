import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import chapters from './data/chapters.json';
import type { InkMap, Waypoint } from './map/InkMap';
import { cumulative, pointAt, type LngLat } from './map/geo';
import { photos, pending, photoUrl, formatCoords, legBetween, arrondissementLabel } from './photos';
import type { PendingPhoto } from './types';
import { setMood, setSound } from './ambience';

gsap.registerPlugin(ScrollTrigger);

type Art = { caption: string; mid?: string; image?: string; color?: string; credit?: string; license?: string; source?: string };
type Chapter = { era: string; tone: 'past' | 'modern' | 'future'; place?: string; when: string; scene: string[]; text: string[]; approach: string; note: string; art: Art };
type Leg = NonNullable<ReturnType<typeof legBetween>>;
type AnyPhoto = PendingPhoto & { lat?: number | null; lng?: number | null };
type Stop = { k: number; photo: AnyPhoto; ch: Chapter; d: number; at: LngLat; located: boolean; outside: boolean; leg?: Leg; s: number; e: number };

const CH = chapters.chapters as unknown as Record<string, Chapter>;
const byId = new Map<string, AnyPhoto>([...photos, ...pending].map((p) => [p.id, p]));
const artUrl = (f?: string) => (f ? `${import.meta.env.BASE_URL}art/${f}` : '');
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII'];
const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`);

// One continuous snail-shaped walk: Point zéro → every located photo, in arrondissement order.
const route: LngLat[] = [];
const bounds = new Map<string, { leg: Leg; i0: number; i1: number }>();
let prevId = chapters.start.id;
for (const id of chapters.order) {
  if (byId.get(id)?.lat == null) continue;
  const leg = legBetween(prevId, id);
  prevId = id;
  if (!leg) continue;
  const c = leg.coordinates as LngLat[];
  const i0 = Math.max(0, route.length - 1);
  route.push(...(route.length ? c.slice(1) : c));
  bounds.set(id, { leg, i0, i1: route.length - 1 });
}
const cum = cumulative(route);
const total = cum[cum.length - 1] ?? 0;

// Unlocated photos are met along the way, spread evenly on the leg towards the next located stop.
const stops: Stop[] = [];
let queue: number[] = [];
chapters.order.forEach((id, k) => {
  const photo = byId.get(id)!;
  const ch = CH[id];
  const st: Stop = { k, photo, ch, d: total, at: route[route.length - 1], located: photo.lat != null, outside: !!ch.place?.startsWith('Beyond the walls'), s: 0, e: 0 };
  stops.push(st);
  if (st.outside) return;
  const b = bounds.get(id);
  if (!b) { queue.push(k); return; }
  const s = cum[b.i0], e = cum[b.i1];
  queue.forEach((q, i) => Object.assign(stops[q], { d: s + ((e - s) * (i + 1)) / (queue.length + 1), leg: b.leg, s, e }));
  queue = [];
  Object.assign(st, { d: e, leg: b.leg, s, e });
});
stops.forEach((st) => { st.at = st.located ? [st.photo.lng!, st.photo.lat!] : pointAt(route, cum, st.d).here; });
const waypoints: Waypoint[] = stops.filter((s) => !s.outside).map((s) => ({ lng: s.at[0], lat: s.at[1], n: s.k + 1, located: s.located }));
const firstOutside = stops.findIndex((s) => s.outside);

function placeOf(st: Stop) {
  const { photo: p, ch } = st;
  if (st.located) return ch.place ?? [p.place, arrondissementLabel(p.arrondissement)].filter(Boolean).join(', ');
  if (st.outside) return ch.place ?? 'Outside Paris';
  return `${ch.place ?? 'A wall'} — met along the way`;
}

export default function App() {
  const mapEl = useRef<HTMLDivElement>(null);
  const ink = useRef<InkMap | null>(null);
  // Replays the latest camera/pins on a map that finishes loading after the visitor has scrolled.
  const syncMap = useRef<(m: InkMap) => void>((m) => m.overview());
  const root = useRef<HTMLDivElement>(null);
  const [sound, setSoundOn] = useState(false);
  const toggleSound = () => setSoundOn((on) => { setSound(!on); return !on; });

  useEffect(() => {
    let alive = true;
    // WebGL map setup is the heaviest work on the page: start it once the hero has painted and the
    // main thread is idle, or right away on the visitor's first scroll/touch. It already fades in.
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'scroll'] as const;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    let started = false;
    const start = () => {
      if (started || !alive) return;
      started = true;
      events.forEach((e) => removeEventListener(e, start));
      loadMap();
    };
    events.forEach((e) => addEventListener(e, start, { passive: true, once: true }));
    const onLoad = () => idle(start, { timeout: 1500 });
    if (document.readyState === 'complete') onLoad(); else addEventListener('load', onLoad, { once: true });
    const loadMap = () => import('./map/InkMap')
      .then(({ InkMap }) => InkMap.create(mapEl.current!, route, waypoints))
      .then((m) => {
        if (!alive) return;
        ink.current = m;
        syncMap.current(m);
        root.current?.classList.add('map-ready');
        ScrollTrigger.refresh();
      })
      .catch((e) => console.error(e));
    return () => {
      alive = false;
      events.forEach((e) => removeEventListener(e, start));
      removeEventListener('load', onLoad);
    };
  }, []);

  useLayoutEffect(() => {
    const $ = (s: string) => root.current!.querySelector(s) as HTMLElement;
    const hud = { n: $('.hud-n'), era: $('.hud-era'), place: $('.hud-place'), km: $('.hud-km'), dots: [...root.current!.querySelectorAll('.hud-dots i')] };
    const bar = $('.progress');
    const ticks = [...bar.querySelectorAll('u')] as HTMLElement[];
    const placeTicks = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      root.current!.querySelectorAll<HTMLElement>('.ch').forEach((c, i) => {
        if (ticks[i]) ticks[i].style.left = `${Math.min(100, (100 * (c.getBoundingClientRect().top + scrollY - innerHeight * 0.5)) / max)}%`;
      });
    };
    ScrollTrigger.addEventListener('refresh', placeTicks);
    let hudK = -2;
    let visited = -1;
    let view: (m: InkMap) => unknown = (m) => m.overview();
    const visit = (k: number) => { visited = k; ink.current?.visit(k); };
    const show = (fn: (m: InkMap) => unknown) => { view = fn; return ink.current ? fn(ink.current) : undefined; };
    syncMap.current = (m) => { view(m); m.visit(visited); };
    const setHud = (k: number) => {
      if (k === hudK) return;
      hudK = k;
      const st = stops[k];
      hud.n.textContent = st ? ROMAN[k + 1] : '0';
      hud.era.textContent = st ? st.ch.era : 'Point Zero';
      hud.place.textContent = st ? placeOf(st) : 'In front of Notre-Dame, where every road in France begins';
      hud.dots.forEach((d, i) => { d.classList.toggle('on', i < k); d.classList.toggle('now', i === k); });
      ticks.forEach((t, i) => t.classList.toggle('on', i <= k));
      visit(k - 1);
    };
    setHud(-1);

    const lenis = reduced ? null : new Lenis({ lerp: 0.075 });
    const raf = (t: number) => lenis?.raf(t * 1000);
    if (lenis) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
    }
    const ctx = gsap.context(() => {
      placeTicks();
      ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (t) => bar.style.setProperty('--p', t.progress.toFixed(4)) });
      ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom 60%', onEnterBack: () => { setHud(-1); show((m) => m.overview()); hud.km.textContent = ''; } });
      gsap.utils.toArray<HTMLElement>('.approach').forEach((el) => {
        const k = Number(el.dataset.k);
        const st = stops[k];
        const from = k && !stops[k - 1].outside ? stops[k - 1].d : k ? total : 0;
        const street = el.querySelector('.walk-street')!, quart = el.querySelector('.walk-q')!, left = el.querySelector('.walk-left')!;
        ScrollTrigger.create({
          trigger: el, start: 'top 85%', end: 'bottom 35%',
          onToggle: (t) => {
            if (!t.isActive) return;
            setHud(k);
            setMood('street');
            if (st.outside) { show((m) => m.overview(true)); visit(stops.length); }
          },
          onUpdate: (t) => {
            if (st.outside) return;
            const p = t.progress;
            const d = from + (st.d - from) * (p * p * (3 - 2 * p));
            const dest = { img: photoUrl(st.photo.thumb), at: st.at };
            const q = (show((m) => m.walk(d, p, dest)) as string | undefined) ?? '';
            const f = st.leg ? (d - st.s) / Math.max(1, st.e - st.s) : 0;
            const name = [...(st.leg?.streets ?? [])].reverse().find(([at]) => at <= f + 0.01)?.[1] ?? '';
            if (street.textContent !== name) street.textContent = name;
            const qt = q ? `${q} quarter` : '';
            if (quart.textContent !== qt) quart.textContent = qt;
            left.textContent = p >= 0.97 ? 'You are here.' : `${km(st.d - d)} to go`;
            hud.km.textContent = `${km(d)} walked`;
          },
        });
      });
      gsap.utils.toArray<HTMLElement>('.ch').forEach((ch) => {
        const k = Number(ch.dataset.k);
        ScrollTrigger.create({ trigger: ch, start: 'top center', end: 'bottom center', onToggle: (t) => { if (t.isActive) { setHud(k); visit(k); setMood(stops[k].ch.tone); } } });
      });
      ScrollTrigger.create({ trigger: '.outro', start: 'top 70%', onEnter: () => show((m) => m.overview(true)) });
      if (reduced) return;
      gsap.from('.hero-line', { yPercent: 110, opacity: 0, duration: 1.8, stagger: 0.12, ease: 'expo.out', delay: 0.2 });
    }, root);
    // Decorative tweens are built per section just before it scrolls into view, so page load
    // doesn't pay for ~150 tweens (and their layout reads) up front.
    const animateSection = (sec: HTMLElement) => ctx.add(() => {
      sec.querySelectorAll<HTMLElement>('.ch').forEach((ch) => {
        gsap.fromTo(ch.querySelector('.ch-bg img'), { scale: 1.22, yPercent: -4 }, { scale: 1.02, yPercent: 4, ease: 'none', scrollTrigger: { trigger: ch, start: 'top bottom', end: 'bottom top', scrub: true } });
        gsap.fromTo(ch.querySelectorAll('.ch-scene .w'), { opacity: 0.3, filter: 'blur(1.5px)' }, { opacity: 1, filter: 'blur(0px)', stagger: 0.05, ease: 'none', scrollTrigger: { trigger: ch.querySelector('.ch-scene'), start: 'top 75%', end: 'bottom 75%', scrub: true } });
        gsap.fromTo(ch.querySelector('.ch-veil'), { opacity: 0.35 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: ch, start: 'top top', end: '+=100%', scrub: true } });
        gsap.from(ch.querySelectorAll('.ch-head > *'), { y: 80, opacity: 0, duration: 1.6, stagger: 0.14, ease: 'expo.out', scrollTrigger: { trigger: ch, start: 'top 60%' } });
        gsap.fromTo(ch.querySelector('.ch-plate'), { clipPath: 'inset(100% 0% 0% 0%)', y: 120, rotate: 0 },
          { clipPath: 'inset(0% 0% 0% 0%)', y: 0, rotate: -1.2, duration: 1.8, ease: 'expo.inOut', scrollTrigger: { trigger: ch.querySelector('.ch-body'), start: 'top 80%' } });
      });
      sec.querySelectorAll<HTMLElement>('.reveal').forEach((el) =>
        gsap.from(el, { y: 40, opacity: 0, duration: 1.4, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));
      sec.querySelectorAll<HTMLElement>('.approach-card').forEach((el) =>
        gsap.from(el, { y: 60, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: el.parentElement, start: 'top 75%' } }));
    });
    const io = reduced ? null : new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io!.unobserve(e.target);
      animateSection(e.target as HTMLElement);
    }), { rootMargin: '150% 0px' });
    root.current!.querySelectorAll('.stop, .outro').forEach((el) => io?.observe(el));
    return () => {
      io?.disconnect();
      ctx.revert();
      ScrollTrigger.removeEventListener('refresh', placeTicks);
      if (lenis) { gsap.ticker.remove(raf); lenis.destroy(); }
    };
  }, []);

  return (
    <div ref={root} className="promenade">
      <div className="grain" aria-hidden />
      <header className="topbar">
        <span className="brand">Paris, on foot</span>
        <div className="progress" aria-hidden><i /><b />{stops.map((s) => <u key={s.k} />)}</div>
        <span>{stops.length} images · {km(total)} · <button className="sound" onClick={toggleSound} aria-pressed={sound}>{sound ? 'sound ●' : 'sound ○'}</button></span>
      </header>

      <div className="journey">
        <aside className="arch-wrap" aria-hidden inert>
          <div className="arch">
            <div ref={mapEl} className="map-layer" />
            <div className="hud">
              <span className="hud-n" />
              <div>
                <strong className="hud-era" />
                <em className="hud-place" />
              </div>
              <div className="hud-dots">{stops.map((s) => <i key={s.k} className={s.located ? 'loc' : s.outside ? 'out' : ''} />)}</div>
              <small className="hud-km" />
            </div>
          </div>
        </aside>

        <main className="story">
          <section className="hero">
            <div className="hero-inner">
              <p className="kicker hero-line">Class project · a snail-shaped walk</p>
              <h1><span className="hero-line">Paris,</span><span className="hero-line"><em>on foot</em></span></h1>
              <p className="hero-lede hero-line">
                Paris curls like a shell: from the 1st to the 20th, the arrondissements spiral around the Île de la Cité.
                We start at Point Zero, in front of Notre-Dame, and unwind the spiral on foot. Twenty-two pictures gathered along the way,
                and with every step, history rises to the surface.
              </p>
              <p className="hero-scroll hero-line">Scroll to walk ↓</p>
            </div>
          </section>

          {stops.map((st) => {
            const { photo: p, ch, k } = st;
            return (
              <div key={p.id} className="stop">
                {k === firstOutside && (
                  <section className="coda">
                    <p className="reveal kicker">Beyond the walls</p>
                    <h2 className="reveal">The shell opens</h2>
                    <p className="reveal">Three pictures that don't seem to have been taken in Paris. We leave the spiral: walls elsewhere in France answer the walls of the capital.</p>
                  </section>
                )}
                <section className="approach" data-k={k}>
                  <div className="approach-card">
                    <p className="kicker">Walking · towards stop {ROMAN[k + 1]}</p>
                    <h3>{p.title}</h3>
                    <p className="walk-dist">{st.outside ? 'Outside Paris' : <span className="walk-left">on the way</span>}</p>
                    <p className="walk-street" />
                    <p className="walk-q" />
                    <p className="walk-text">{ch.approach}</p>
                  </div>
                </section>
                <section id={p.id} className={`ch tone-${ch.tone}`} data-k={k}>
                  <div className="ch-bg">
                    <img src={artUrl(ch.art.image)} srcSet={ch.art.mid ? `${artUrl(ch.art.mid)} 900w, ${artUrl(ch.art.image)} 1920w` : undefined} sizes="60vw" alt="" loading={k > 1 ? 'lazy' : 'eager'} style={{ background: ch.art.color }} />
                    <i className="ch-veil" />
                  </div>
                  <div className="ch-inner">
                    <header className="ch-head">
                      <p className="kicker">{ROMAN[k + 1]} · {placeOf(st)}</p>
                      <div className="ch-era">{ch.era}</div>
                      <h2 className="ch-title">{p.title}</h2>
                    </header>
                    <div className="ch-body">
                      <figure className="ch-plate">
                        <img src={photoUrl(p.mid)} srcSet={`${photoUrl(p.mid)} 800w, ${photoUrl(p.file)} 1600w`} sizes="(max-width: 800px) 90vw, 40vw" alt={p.title} width={p.width} height={p.height} loading="lazy" style={{ background: p.color }} />
                        <figcaption>{st.located ? formatCoords(p.lat!, p.lng!) : st.outside ? 'Outside Paris' : 'Met along the way · exact spot still to be found'}</figcaption>
                      </figure>
                      <div className="ch-text">
                        <p className="kicker today">In the picture</p>
                        {ch.text.map((t, j) => <p key={j} className="reveal">{t}</p>)}
                      </div>
                    </div>
                    <div className="ch-scene">
                      <p className="kicker ch-when">{ch.when}</p>
                      {ch.scene.map((t, j) => <p key={j}>{t.split(' ').map((w, i) => <span key={i} className="w">{w} </span>)}</p>)}
                    </div>
                    <footer className="ch-note">
                      <p className="reveal">{ch.note}</p>
                      <small className="reveal">
                        Background: {ch.art.caption}. {ch.art.credit && `${ch.art.credit} · `}{ch.art.license}
                        {ch.art.source && <> · <a href={ch.art.source} target="_blank" rel="noreferrer">Wikimedia Commons</a></>}
                      </small>
                    </footer>
                  </div>
                </section>
              </div>
            );
          })}

          <section className="outro">
            <p className="reveal kicker">End of the walk</p>
            <h2 className="reveal">We walk home.</h2>
            <p className="reveal">
              {km(total)} of spiral, {photos.length} places found on the map, {pending.length} pictures still without an exact address. If you know where they were taken,
              tell us: the shell will grow.
            </p>
            <button className="reveal back" onClick={() => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })}>Back to Point Zero ↑</button>
          </section>
        </main>
      </div>
    </div>
  );
}
