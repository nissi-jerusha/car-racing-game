import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Flag,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { RaceEngine } from './game/RaceEngine';
import type { GameSnapshot } from './game/RaceEngine';
import { RaceAudio } from './game/audio';

type Phase = 'menu' | 'playing' | 'paused' | 'over';
type ScoreEntry = { id: string; score: number; distance: number; date: string };
type FinishedRun = GameSnapshot & { id: string };

const SCORE_KEY = 'car-race-high-scores-v1';
const INITIAL_HUD: GameSnapshot = {
  score: 0,
  distance: 0,
  speed: 148,
  lives: 3,
  boost: 100,
  boosting: false,
  overtakes: 0,
  nearMisses: 0,
};

function readScores(): ScoreEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SCORE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is ScoreEntry => Boolean(entry && typeof entry.id === 'string' && typeof entry.score === 'number' && Number.isFinite(entry.score)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function formatScore(score: number) {
  return Math.max(0, Math.floor(score)).toString().padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function Logo() {
  return (
    <div className="brand" aria-label="Car Race, an arcade original">
      <div className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 38 38" fill="none">
          <path d="M4 8H21L16 13H2L4 8Z" fill="currentColor" />
          <path d="M2 16H16L11 21H0L2 16Z" fill="currentColor" />
          <path d="M19 8H36L23 21H12L19 14H26L29 11H16L19 8Z" fill="currentColor" />
          <path d="M10 24H25L20 29H5L10 24Z" fill="currentColor" />
        </svg>
      </div>
      <div className="brand-copy">
        <span>CAR<span>RACE</span><b>.</b></span>
        <small>AN ARCADE ORIGINAL</small>
      </div>
    </div>
  );
}

function CheckeredFlag({ className = '' }: { className?: string }) {
  return <span className={`checkered-flag ${className}`} aria-hidden="true" />;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const machineRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RaceEngine | null>(null);
  const audioRef = useRef<RaceAudio | null>(null);
  const phaseRef = useRef<Phase>('menu');
  const helpRef = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [hud, setHud] = useState<GameSnapshot>(INITIAL_HUD);
  const [scores, setScores] = useState<ScoreEntry[]>(readScores);
  const [lastRun, setLastRun] = useState<FinishedRun | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  if (!audioRef.current) audioRef.current = new RaceAudio();

  const changePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new RaceEngine(canvasRef.current, {
      onUpdate: setHud,
      onEffect: (effect) => audioRef.current?.play(effect),
      onGameOver: (result) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const entry: ScoreEntry = { id, score: result.score, distance: result.distance, date: new Date().toISOString() };
        setLastRun({ ...result, id });
        setScores((previous) => {
          const next = [...previous, entry].sort((a, b) => b.score - a.score).slice(0, 5);
          try {
            localStorage.setItem(SCORE_KEY, JSON.stringify(next));
          } catch {
            // A run still works if storage is unavailable or full.
          }
          return next;
        });
        changePhase('over');
      },
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
      audioRef.current?.destroy();
    };
  }, [changePhase]);

  const startGame = useCallback(() => {
    if (!engineRef.current) return;
    helpRef.current = false;
    setShowHelp(false);
    setLastRun(null);
    audioRef.current?.unlock();
    engineRef.current.start();
    changePhase('playing');
  }, [changePhase]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'playing') {
      engineRef.current?.pause();
      changePhase('paused');
    } else if (phaseRef.current === 'paused' && !helpRef.current) {
      audioRef.current?.unlock();
      engineRef.current?.resume();
      changePhase('playing');
    }
  }, [changePhase]);

  const openHelp = useCallback(() => {
    if (phaseRef.current === 'playing') togglePause();
    helpRef.current = true;
    setShowHelp(true);
  }, [togglePause]);

  const closeHelp = useCallback(() => {
    helpRef.current = false;
    setShowHelp(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (helpRef.current) {
        if (key === 'escape') closeHelp();
        return;
      }
      const target = event.target as HTMLElement | null;
      const isButton = target?.tagName === 'BUTTON';
      if (phaseRef.current === 'playing') {
        if (key === 'arrowleft' || key === 'a') {
          event.preventDefault();
          engineRef.current?.steer(-1);
        } else if (key === 'arrowright' || key === 'd') {
          event.preventDefault();
          engineRef.current?.steer(1);
        } else if ((key === ' ' && !isButton) || key === 'arrowup' || key === 'w') {
          event.preventDefault();
          engineRef.current?.setBoost(true);
        } else if (key === 'arrowdown' || key === 's') {
          event.preventDefault();
          engineRef.current?.setBrake(true);
        } else if ((key === 'p' || key === 'escape') && !event.repeat) {
          event.preventDefault();
          togglePause();
        }
      } else if (phaseRef.current === 'paused' && (key === 'p' || key === 'escape') && !event.repeat) {
        event.preventDefault();
        togglePause();
      } else if ((phaseRef.current === 'menu' || phaseRef.current === 'over') && !event.repeat && ((key === 'enter' && !isButton) || (phaseRef.current === 'over' && key === 'r'))) {
        event.preventDefault();
        startGame();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === ' ' || key === 'arrowup' || key === 'w') engineRef.current?.setBoost(false);
      if (key === 'arrowdown' || key === 's') engineRef.current?.setBrake(false);
    };
    const onVisibility = () => {
      if (document.hidden && phaseRef.current === 'playing') togglePause();
    };
    const onBlur = () => {
      if (phaseRef.current === 'playing') togglePause();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [closeHelp, startGame, togglePause]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await machineRef.current?.requestFullscreen();
    } catch {
      // Fullscreen is optional and may be blocked by the browser.
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    audioRef.current?.setEnabled(next);
  };

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'playing') return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCanvasPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointerStart.current || phaseRef.current !== 'playing') return;
    const deltaX = event.clientX - pointerStart.current.x;
    const deltaY = event.clientY - pointerStart.current.y;
    if (Math.abs(deltaX) > 24 && Math.abs(deltaX) > Math.abs(deltaY)) {
      engineRef.current?.steer(deltaX < 0 ? -1 : 1);
    } else if (Math.abs(deltaY) < 30) {
      const rect = event.currentTarget.getBoundingClientRect();
      engineRef.current?.steer(event.clientX < rect.left + rect.width / 2 ? -1 : 1);
    }
    pointerStart.current = null;
  };

  const boostPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    engineRef.current?.setBoost(true);
  };

  const bestScore = scores[0]?.score ?? 0;
  const isNewBest = Boolean(lastRun && scores[0]?.id === lastRun.id);

  return (
    <div className="app-shell">
      <header className="site-header">
        <Logo />
        <div className="header-edition"><span /> THE NIGHT DRIVE EDITION <b>/</b> 001</div>
        <div className="header-actions">
          <button className="header-help" onClick={openHelp} type="button" aria-label="HOW TO PLAY"><CircleHelp size={16} /> <span>HOW TO PLAY</span></button>
          <span className="header-separator" />
          <button className="header-icon" onClick={toggleSound} type="button" aria-label={soundOn ? 'Mute sound' : 'Turn sound on'} title={soundOn ? 'Mute sound' : 'Turn sound on'}>
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button className="header-icon fullscreen-button" onClick={toggleFullscreen} type="button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="section-line">
          <div className="section-path"><span className="live-dot" /> <strong>ARCADE MODE</strong><span className="path-slash">/</span> ENDLESS RACE</div>
          <div className="section-right">NO FINISH LINE. NO LIMITS. <span>01 / 01</span></div>
        </div>

        <div className="machine" ref={machineRef}>
          <div className="game-column">
            <section className={`game-stage phase-${phase}`} aria-label="Car Race game">
              <canvas
                ref={canvasRef}
                className="game-canvas"
                aria-label="Racing game. Use left and right arrows to steer, and hold space to boost."
                onPointerDown={onCanvasPointerDown}
                onPointerUp={onCanvasPointerUp}
                onPointerCancel={() => { pointerStart.current = null; }}
              />

              {phase === 'menu' && (
                <div className="start-screen">
                  <div className="start-art" />
                  <div className="start-shade" />
                  <div className="screen-topline"><span><span className="tiny-cross">+</span> THE NIGHT SHIFT</span><span>ENDLESS RUN <b>//</b> 001</span></div>
                  <div className="start-content">
                    <div className="eyebrow"><span /> THE ENDLESS ARCADE RACER</div>
                    <h1><span>CAR</span><span>RACE<i>.</i></span></h1>
                    <div className="start-tagline">THE NIGHT IS YOURS<span>.</span></div>
                    <p>Weave through traffic, hit the boost, and own the open road.</p>
                    <button className="primary-button start-button" type="button" onClick={startGame}>
                      <span className="play-icon"><Play size={15} fill="currentColor" /></span>
                      <span>START YOUR ENGINE</span>
                      <ArrowRight className="button-arrow" size={18} />
                    </button>
                    <div className="enter-hint">PRESS <kbd>ENTER</kbd> TO START</div>
                  </div>
                  <div className="screen-bottomline"><span><CheckeredFlag /> BUILT FOR THE CHASE</span><span>TAKE THE LONG WAY HOME <ArrowUpRight size={12} /></span></div>
                </div>
              )}

              {(phase === 'playing' || phase === 'paused') && (
                <div className="game-hud" aria-live="off">
                  <div className="hud-top">
                    <div className="hud-score"><span>SCORE</span><strong>{formatScore(hud.score)}</strong></div>
                    <div className="hud-health"><span>CAR INTEGRITY</span><div>{[0, 1, 2].map((index) => <i key={index} className={index < hud.lives ? 'filled' : ''} />)}<small>{hud.lives}/3</small></div></div>
                    <div className="hud-speed"><span>SPEED</span><strong>{hud.speed}<small> KM/H</small></strong></div>
                    <button className="pause-button" type="button" onClick={togglePause} aria-label={phase === 'paused' ? 'Resume game' : 'Pause game'}><Pause size={16} fill="currentColor" /></button>
                  </div>
                  <div className="hud-bottom">
                    <div className={`hud-boost ${hud.boosting ? 'is-boosting' : ''}`}>
                      <div><span><Zap size={13} fill="currentColor" /> NITRO</span><small>{hud.boosting ? 'BOOSTING' : 'READY'}</small></div>
                      <div className="boost-track"><i style={{ width: `${hud.boost}%` }} /></div>
                    </div>
                    <div className="hud-distance"><span>DISTANCE</span><strong>{(hud.distance / 1000).toFixed(2)} <small>KM</small></strong></div>
                  </div>
                </div>
              )}

              {phase === 'paused' && (
                <div className="state-overlay">
                  <div className="state-kicker"><span /> PIT STOP</div>
                  <h2>PAUSED<span>.</span></h2>
                  <p>The road can wait. Take your time.</p>
                  <button className="primary-button state-primary" type="button" onClick={togglePause}><Play size={15} fill="currentColor" /> RESUME RACE <ArrowRight size={17} /></button>
                  <button className="text-button" type="button" onClick={startGame}><RotateCcw size={14} /> RESTART RUN</button>
                  <div className="state-key">PRESS P TO RESUME</div>
                </div>
              )}

              {phase === 'over' && lastRun && (
                <div className="state-overlay game-over-overlay">
                  <div className="state-kicker"><span /> {isNewBest ? 'NEW PERSONAL BEST' : 'END OF THE ROAD'}</div>
                  <h2>RUN OVER<span>.</span></h2>
                  <p>{isNewBest ? 'Now that is a ride worth remembering.' : 'Good run. The road is calling again.'}</p>
                  <div className="result-line">
                    <div><span>YOUR SCORE</span><strong>{formatScore(lastRun.score)}</strong></div>
                    <div><span>DISTANCE</span><strong>{(lastRun.distance / 1000).toFixed(2)} <small>KM</small></strong></div>
                    <div><span>CLOSE CALLS</span><strong>{lastRun.nearMisses}</strong></div>
                  </div>
                  <button className="primary-button state-primary" type="button" onClick={startGame}><RotateCcw size={16} /> RACE AGAIN <ArrowRight size={17} /></button>
                  <button className="text-button" type="button" onClick={() => changePhase('menu')}>BACK TO MENU</button>
                  <div className="state-key">PRESS ENTER OR R TO RESTART</div>
                </div>
              )}
            </section>

            {(phase === 'playing' || phase === 'paused') && (
              <div className="touch-controls" aria-label="Touch controls">
                <div className="touch-steering">
                  <button type="button" aria-label="Steer left" disabled={phase !== 'playing'} onPointerDown={(event) => { event.preventDefault(); engineRef.current?.steer(-1); }} onClick={(event) => { if (event.detail === 0) engineRef.current?.steer(-1); }}><ChevronLeft size={27} /></button>
                  <button type="button" aria-label="Steer right" disabled={phase !== 'playing'} onPointerDown={(event) => { event.preventDefault(); engineRef.current?.steer(1); }} onClick={(event) => { if (event.detail === 0) engineRef.current?.steer(1); }}><ChevronRight size={27} /></button>
                </div>
                <span className="touch-hint">TAP TO STEER</span>
                <button className="touch-boost" type="button" aria-label="Hold to boost" disabled={phase !== 'playing'} onPointerDown={boostPointerDown} onPointerUp={() => engineRef.current?.setBoost(false)} onPointerCancel={() => engineRef.current?.setBoost(false)} onLostPointerCapture={() => engineRef.current?.setBoost(false)}>
                  <Zap size={21} fill="currentColor" /><span><small>HOLD FOR</small> BOOST</span>
                </button>
              </div>
            )}

            <div className="control-bar">
              <span className="controls-heading">THE CONTROLS <span>/</span></span>
              <div className="control-item"><span className="keys"><kbd><ArrowLeft size={12} /></kbd><kbd><ArrowRight size={12} /></kbd></span><span>STEER</span></div>
              <div className="control-item"><span className="keys"><kbd className="wide-key">SPACE</kbd></span><span>BOOST</span></div>
              <div className="control-item"><span className="keys"><kbd>P</kbd></span><span>PAUSE</span></div>
              <div className="control-end"><span>GOOD LUCK OUT THERE</span><CheckeredFlag /></div>
              <div className="touch-control-caption"><strong>TOUCH CONTROLS</strong><span>SWIPE OR TAP TO STEER</span><CheckeredFlag /></div>
            </div>
          </div>

          <aside className="garage-panel" aria-label="Local high scores">
            <div className="garage-top"><span>YOUR GARAGE</span><span>001 <b>/</b> 005</span></div>
            <div className="personal-best">
              <div className="panel-overline"><span>PERSONAL BEST</span><Trophy size={15} /></div>
              <div className="best-number">{formatScore(bestScore)}</div>
              <div className="best-caption"><strong>PTS</strong><span>YOUR BEST RUN, SAVED HERE</span></div>
            </div>

            <div className="leaderboard">
              <div className="leaderboard-heading">
                <div><h2>HIGH SCORES<span>.</span></h2><p>TOP RUNS ON THIS DEVICE</p></div>
                <span className="top-five">TOP 05</span>
              </div>
              <div className="score-header"><span>RANK / DRIVER</span><span>SCORE</span></div>
              <ol className="score-list">
                {Array.from({ length: 5 }, (_, index) => {
                  const entry = scores[index];
                  return <li key={entry?.id ?? `empty-${index}`} className={entry && index === 0 ? 'first-place' : ''}>
                    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                    <span className="driver">{entry ? 'YOU' : '---'}</span>
                    <span className="row-score">{entry ? formatScore(entry.score) : '---,---'}</span>
                  </li>;
                })}
              </ol>
              {!scores.length && <div className="empty-score">No runs yet. Make your mark.</div>}
            </div>

            <div className="garage-tip">
              <div className="tip-label"><span><Zap size={12} fill="currentColor" /> DRIVER'S TIP</span><ArrowUpRight size={14} /></div>
              <p>Close calls earn<br /><strong>extra points.</strong></p>
              <div className="tip-foot"><span>KEEP IT CLOSE</span><span> / / / </span></div>
            </div>
          </aside>
          {fullscreen && <button className="fullscreen-exit" onClick={toggleFullscreen} type="button" aria-label="Exit fullscreen" title="Exit fullscreen"><Minimize2 size={16} /></button>}
        </div>

        <footer className="site-footer"><span><CheckeredFlag /> AN ARCADE ORIGINAL</span><span>MADE FOR THE LONG WAY HOME.</span><span>CAR RACE <b> / </b> 001</span></footer>
      </main>

      {showHelp && (
        <div className="modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) closeHelp(); }}>
          <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <div className="modal-top"><span>THE DRIVER'S MANUAL <b>/</b> 001</span><button type="button" onClick={closeHelp} aria-label="Close instructions" autoFocus><X size={19} /></button></div>
            <div className="modal-kicker"><span /> BEFORE YOU HIT THE ROAD</div>
            <h2 id="help-title">HOW TO PLAY<span>.</span></h2>
            <p className="modal-intro">The rules are simple. The road is not.</p>
            <div className="manual-list">
              <div><span className="manual-number">01</span><div><strong>KEEP MOVING</strong><p>Use the arrow keys or A / D to steer. On touch, tap the controls or swipe across the road.</p></div><span className="manual-key"><ArrowLeft size={14} /><ArrowRight size={14} /></span></div>
              <div><span className="manual-number">02</span><div><strong>FLOOR IT</strong><p>Hold space, W or up to boost for double points. Hold S or down to brake.</p></div><span className="manual-key"><Zap size={15} /></span></div>
              <div><span className="manual-number">03</span><div><strong>MAKE IT COUNT</strong><p>Pass traffic and score close calls. Three hits end your run, so keep your eyes up.</p></div><span className="manual-key"><Flag size={15} /></span></div>
            </div>
            <button className="primary-button modal-button" type="button" onClick={closeHelp}><Check size={16} /> GOT IT <ArrowRight size={17} /></button>
            <div className="modal-footer"><span>GOOD LUCK OUT THERE.</span><span>CAR RACE / 001</span></div>
          </section>
        </div>
      )}
    </div>
  );
}