import { useEffect, useRef, useState } from 'react';
import Navbar from '../../components/Navbar/Navbar';
import Button from '../../components/Button/Button';
import SceneCanvas from '../../components/SceneCanvas/SceneCanvas';
import './Home.css';

const pillars = [
  { number: '01', title: 'DEVICE DNA' },
  { number: '02', title: 'AI DIAGNOSIS' },
  { number: '03', title: 'STORAGE INTELLIGENCE' },
  { number: '04', title: 'SAFE SELF-HEALING' },
  { number: '05', title: 'PREDICTIVE HEALTH' },
];

export default function Home() {
  const [activeScene, setActiveScene] = useState('hero');
  const [activePillar, setActivePillar] = useState(-1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pointer = useRef({ x: 0, y: 0 });
  const activeSceneRef = useRef('hero');

  useEffect(() => {
    activeSceneRef.current = activeScene;
  }, [activeScene]);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handleMotionChange = (event) => setReducedMotion(event.matches);
    mediaQuery.addEventListener?.('change', handleMotionChange);
    return () => mediaQuery.removeEventListener?.('change', handleMotionChange);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      pointer.current.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.current.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    document.addEventListener('pointermove', handlePointerMove);
    return () => document.removeEventListener('pointermove', handlePointerMove);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const center = window.scrollY + window.innerHeight * 0.52;
      let closest = activeSceneRef.current;
      let distance = Infinity;
      document.querySelectorAll('[data-scene]').forEach((section) => {
        const middle = section.offsetTop + section.offsetHeight / 2;
        const next = Math.abs(center - middle);
        if (next < distance) {
          distance = next;
          closest = section.dataset.scene;
        }
      });
      setActiveScene(closest);
      document.querySelector('.nav')?.classList.toggle('quiet', window.scrollY > window.innerHeight * 0.55);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const chapters = document.querySelectorAll('.chapter');
    if (window.gsap && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      window.gsap.utils.toArray(chapters).forEach((chapter) => {
        window.ScrollTrigger.create({
          trigger: chapter,
          start: 'top 55%',
          end: 'bottom 45%',
          toggleClass: { targets: chapter, className: 'active' },
        });
      });
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.target.classList.toggle('active', entry.isIntersecting)),
      { threshold: 0.35 }
    );
    chapters.forEach((chapter) => observer.observe(chapter));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-root">
      <Navbar />
      <SceneCanvas
        activeScene={activeScene}
        activePillar={activePillar}
        pointerRef={pointer}
        reducedMotion={reducedMotion}
      />
      <div className="film-grain" aria-hidden="true" />
      <div className="cursor-field" aria-hidden="true" />
      <main>
        <section className="chapter hero active" id="hero" data-scene="hero">
          <div className="story story-left">
            <p className="kicker">SANKET</p>
            <p className="product-line">AI-POWERED DIGITAL DOCTOR FOR COMPUTERS</p>
            <h1>YOUR COMPUTER.<br />HAS A HEALTH SIGNATURE.</h1>
            <p className="lede">SANKET learns what healthy means for your machine.</p>
            <Button href="#project">EXPLORE DEVICE DNA</Button>
          </div>
          <p className="scroll-note">SCROLL TO EXPLORE</p>
        </section>
        <section className="chapter" id="project" data-scene="build">
          <div className="story story-left">
            <p className="kicker">BUILD THE DEVICE DNA</p>
            <h2>EVERY COMPUTER<br />IS DIFFERENT.</h2>
            <p className="lede">SANKET learns what healthy means for yours.</p>
            <p className="state">DEVICE DNA INITIALIZED</p>
          </div>
          <div className="micro-list">
            <span>HARDWARE</span>
            <span>SOFTWARE</span>
            <span>PERFORMANCE</span>
            <span>NETWORK</span>
            <span>BEHAVIOR</span>
          </div>
        </section>
        <section className="chapter" data-scene="healthy">
          <div className="story story-right">
            <p className="kicker">BASELINE HEALTHY</p>
            <h2>CALM IS<br />A DATA STATE.</h2>
            <p className="lede">CPU 42%. Memory 51%. Storage 68%. Network 97%.</p>
          </div>
          <div className="metric-strip" aria-label="Healthy baseline metrics">
            <span>CPU <b>42%</b></span>
            <span>MEMORY <b>51%</b></span>
            <span>STORAGE <b>68%</b></span>
            <span>NETWORK <b>97%</b></span>
          </div>
        </section>
        <section className="chapter" data-scene="notice">
          <div className="story story-left">
            <p className="kicker">SANKET NOTICES</p>
            <h2>THEN SOMETHING<br />CHANGED.</h2>
            <p className="change">MEMORY <span>51%</span> <i /> <strong>91%</strong></p>
            <p className="state amber">ANOMALY DETECTED</p>
          </div>
        </section>
        <section className="chapter" id="works" data-scene="why">
          <div className="story story-left wide">
            <p className="kicker">FIND THE WHY</p>
            <h2>WE DON'T JUST<br />FIND THE PROBLEM.</h2>
            <p className="massive">WE FIND THE WHY.</p>
          </div>
          <div className="evidence-stack">
            <span>RAM USAGE <b>91%</b></span>
            <span>APPLICATION X <b>13.8 GB</b></span>
            <span>RECENT CHANGE <b>+1 EXTENSION</b></span>
            <strong>ROOT CAUSE LIKELY IDENTIFIED</strong>
          </div>
        </section>
        <section className="chapter" id="technology" data-scene="storage">
          <div className="story story-right">
            <p className="kicker">STORAGE INTELLIGENCE</p>
            <h2>YOUR DISK<br />HAS STRUCTURE.</h2>
            <p className="lede">512 GB total. 467 GB used. Downloads reveal 16.2 GB potentially recoverable.</p>
            <Button href="#heal">REVIEW STORAGE</Button>
          </div>
          <div className="storage-facts">
            <span>DOWNLOADS <b>38 GB</b></span>
            <span>LARGE FILES <b>19 GB</b></span>
            <span>DUPLICATES <b>7 GB</b></span>
            <span>OLD INSTALLERS <b>5 GB</b></span>
            <strong>16.2 GB RECOVERABLE</strong>
          </div>
        </section>
        <section className="chapter" id="heal" data-scene="heal">
          <div className="story story-left">
            <p className="kicker">SAFE SELF-HEALING</p>
            <h2>FIX IT.<br />SAFELY.</h2>
            <p className="lede">AI recommends. The Safety Engine validates. You approve.</p>
          </div>
          <div className="repair-line">
            <span>DIAGNOSE</span>
            <span>SAFETY CHECK</span>
            <span>APPROVE</span>
            <span>REPAIR</span>
            <span>VERIFY</span>
          </div>
        </section>
        <section className="chapter" data-scene="restore">
          <div className="story story-center">
            <p className="kicker">THE CURE VERIFIED</p>
            <h2>SYSTEM<br />RESTORED.</h2>
            <div className="health-count">
              <span>63</span>
              <span>74</span>
              <span>86</span>
              <strong>91</strong>
            </div>
          </div>
        </section>
        <section className="chapter" data-scene="predict">
          <div className="story story-left">
            <p className="kicker">PREDICTIVE HEALTH</p>
            <h2>DON'T WAIT<br />FOR FAILURE.</h2>
            <p className="lede">SANKET learns patterns before they become problems.</p>
          </div>
          <div className="timeline">
            <span>320 GB</span>
            <span>340 GB</span>
            <span>370 GB</span>
            <span>410 GB</span>
            <span>450 GB</span>
            <strong>CRITICAL STORAGE LEVEL LIKELY SOON</strong>
          </div>
        </section>
        <section className="chapter pillars-section" data-scene="pillars">
          <div className="story story-center pillars-heading">
            <p className="kicker">THE FIVE PILLARS</p>
            <h2>ONE COMPUTATIONAL ORGANISM.</h2>
          </div>
          <div className="pillar-core-link" aria-hidden="true" />
          <div className="pillars" aria-label="The five pillars of SANKET">
            {pillars.map((pillar) => (
              <article
                className="pillar"
                key={pillar.number}
                onPointerEnter={() => setActivePillar(Number(pillar.number) - 1)}
                onPointerLeave={() => setActivePillar(-1)}
              >
                <span className="pillar-number">{pillar.number}</span>
                <h3 className="pillar-title">{pillar.title}</h3>
              </article>
            ))}
          </div>
        </section>
        <section className="chapter final" id="demo" data-scene="final">
          <div className="story story-center">
            <p className="kicker">YOUR COMPUTER. UNDERSTOOD.</p>
            <h2>SANKET</h2>
            <p className="lede">AI-POWERED DIGITAL DOCTOR<br />FOR COMPUTERS</p>
            <p className="trinity">DETECT. UNDERSTAND. HEAL.</p>
            <Button href="#hero">EXPLORE SANKET</Button>
          </div>
        </section>
      </main>
    </div>
  );
}
