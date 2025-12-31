
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Bird, Pipe, GameSettings } from './types';
import { getBirdWisdom } from './services/geminiService';
import { sounds } from './services/soundService';

const SETTINGS: GameSettings = {
  gravity: 0.25,
  jumpStrength: -5.5,
  pipeSpeed: 3.2,
  pipeWidth: 65,
  pipeGap: 165,
  birdX: 60,
  birdSize: 34,
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const STORAGE_KEY_TOP = 'geminiBirdTopScores_v1';
const STORAGE_KEY_HIGH = 'geminiBirdHighScore';

type RGB = [number, number, number];
const SKY_THEMES: { top: RGB; bottom: RGB }[] = [
  { top: [78, 192, 202], bottom: [152, 228, 235] },
  { top: [255, 126, 95], bottom: [254, 180, 123] },
  { top: [75, 108, 183], bottom: [24, 40, 72] },
  { top: [20, 30, 48], bottom: [36, 59, 85] },
  { top: [15, 12, 41], bottom: [48, 43, 99] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpColor = (c1: RGB, c2: RGB, t: number): string => {
  const r = Math.round(lerp(c1[0], c2[0], t));
  const g = Math.round(lerp(c1[1], c2[1], t));
  const b = Math.round(lerp(c1[2], c2[2], t));
  return `rgb(${r},${g},${b})`;
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const gameStateRef = useRef<GameState>(GameState.START);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem(STORAGE_KEY_HIGH) || '0', 10);
  });
  const [topScores, setTopScores] = useState<number[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TOP);
    return saved ? JSON.parse(saved) : [];
  });
  const [wisdom, setWisdom] = useState<string>("");
  const [loadingWisdom, setLoadingWisdom] = useState(false);
  
  const [showAd, setShowAd] = useState(false);
  const [adTimer, setAdTimer] = useState(5);
  const [canRevive, setCanRevive] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef({
    bird: { y: 250, velocity: 0, rotation: 0 } as Bird,
    pipes: [] as Pipe[],
    particles: [] as Particle[],
    frameCount: 0,
    score: 0,
    parallaxX: 0,
    groundX: 0,
    shake: 0,
    wingPhase: 0,
    blinkTimer: 0,
  });

  const requestRef = useRef<number>(0);

  // Sync ref with state for the game loop
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const initGame = useCallback(() => {
    gameRef.current = {
      ...gameRef.current,
      bird: { y: 300, velocity: 0, rotation: 0 },
      pipes: [],
      particles: [],
      frameCount: 0,
      score: 0,
      shake: 0,
      wingPhase: 0,
      blinkTimer: 0,
    };
    setScore(0);
    setWisdom("");
    setCanRevive(true);
  }, []);

  const createParticles = (x: number, y: number, color: string, count = 5) => {
    for (let i = 0; i < count; i++) {
      gameRef.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 1.0,
        color,
      });
    }
  };

  const handleJump = useCallback((e?: React.MouseEvent | React.TouchEvent | KeyboardEvent) => {
    if (e) {
      if ('preventDefault' in e) e.preventDefault();
      if ('stopPropagation' in e) e.stopPropagation();
    }
    
    if (showAd) return;
    
    if (gameStateRef.current === GameState.PLAYING) {
      gameRef.current.bird.velocity = SETTINGS.jumpStrength;
      sounds.playFlap();
      createParticles(SETTINGS.birdX, gameRef.current.bird.y, '#ffffff', 3);
    } else if (gameStateRef.current === GameState.START) {
      setGameState(GameState.PLAYING);
      initGame();
      sounds.playFlap();
    }
  }, [initGame, showAd]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') handleJump(e);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleJump]);

  const endGame = async () => {
    if (gameStateRef.current === GameState.GAME_OVER) return;
    setGameState(GameState.GAME_OVER);
    sounds.playCrash();
    
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }

    gameRef.current.shake = 10;
    createParticles(SETTINGS.birdX, gameRef.current.bird.y, '#f7d302', 15);
    
    const currentScore = gameRef.current.score;
    
    // Update state and storage
    const updated = [...topScores, currentScore]
      .sort((a, b) => b - a)
      .slice(0, 5);
    setTopScores(updated);
    localStorage.setItem(STORAGE_KEY_TOP, JSON.stringify(updated));

    if (currentScore > highScore) {
      setHighScore(currentScore);
      localStorage.setItem(STORAGE_KEY_HIGH, currentScore.toString());
    }
    
    setLoadingWisdom(true);
    const message = await getBirdWisdom(currentScore);
    setWisdom(message);
    setLoadingWisdom(false);
  };

  const update = useCallback(() => {
    const currentStatus = gameStateRef.current;
    if (showAd) return;

    const { bird, pipes, particles } = gameRef.current;

    const blinkThreshold = currentStatus === GameState.GAME_OVER ? 120 : 250;
    gameRef.current.blinkTimer++;
    if (gameRef.current.blinkTimer > blinkThreshold) {
      gameRef.current.blinkTimer = 0;
    }

    let flapSpeed;
    if (currentStatus === GameState.START) {
      flapSpeed = 0.12;
    } else if (currentStatus === GameState.GAME_OVER) {
      flapSpeed = 0.05;
    } else {
      const vel = bird.velocity;
      flapSpeed = vel < 0 ? lerp(0.35, 0.55, Math.abs(vel) / 6) : lerp(0.2, 0.7, Math.min(1, vel / 10));
    }
    gameRef.current.wingPhase += flapSpeed;

    if (currentStatus === GameState.GAME_OVER) return;

    if (currentStatus === GameState.START) {
      bird.y = 300 + Math.sin(gameRef.current.frameCount * 0.05) * 15;
      gameRef.current.frameCount++;
      gameRef.current.parallaxX = (gameRef.current.parallaxX + 0.2) % 800;
      return;
    }

    // Physics
    bird.velocity += SETTINGS.gravity;
    bird.y += bird.velocity;
    bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 8, bird.velocity * 0.12));

    gameRef.current.parallaxX = (gameRef.current.parallaxX + 0.5) % 800;
    gameRef.current.groundX = (gameRef.current.groundX + SETTINGS.pipeSpeed) % 400;

    if (gameRef.current.shake > 0) gameRef.current.shake -= 0.5;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      if (p.life <= 0) particles.splice(i, 1);
    }

    const canvasHeight = canvasRef.current?.height || 600;
    const groundLevel = canvasHeight - 40;
    if (bird.y + SETTINGS.birdSize / 2 > groundLevel || bird.y - SETTINGS.birdSize / 2 < 0) {
      endGame(); return;
    }

    gameRef.current.frameCount++;
    if (gameRef.current.frameCount % 90 === 0) {
      const minHeight = 60;
      const maxHeight = groundLevel - SETTINGS.pipeGap - 60;
      const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
      pipes.push({ id: Date.now(), x: (canvasRef.current?.width || 400), topHeight, passed: false });
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const pipe = pipes[i];
      pipe.x -= SETTINGS.pipeSpeed;

      if (!pipe.passed && pipe.x + SETTINGS.pipeWidth < SETTINGS.birdX) {
        pipe.passed = true;
        gameRef.current.score++;
        setScore(gameRef.current.score); // Sync for UI
        sounds.playScore();
      }

      const birdBox = {
        left: SETTINGS.birdX - SETTINGS.birdSize / 2 + 8,
        right: SETTINGS.birdX + SETTINGS.birdSize / 2 - 8,
        top: bird.y - SETTINGS.birdSize / 2 + 8,
        bottom: bird.y + SETTINGS.birdSize / 2 - 8,
      };

      const topPipeBox = { left: pipe.x, right: pipe.x + SETTINGS.pipeWidth, top: 0, bottom: pipe.topHeight };
      const bottomPipeBox = { left: pipe.x, right: pipe.x + SETTINGS.pipeWidth, top: pipe.topHeight + SETTINGS.pipeGap, bottom: groundLevel };

      const collides = (b1: any, b2: any) => (
        b1.left < b2.right && b1.right > b2.left && b1.top < b2.bottom && b1.bottom > b2.top
      );

      if (collides(birdBox, topPipeBox) || collides(birdBox, bottomPipeBox)) {
        endGame(); return;
      }
      if (pipe.x + SETTINGS.pipeWidth < -100) pipes.splice(i, 1);
    }
  }, [showAd, topScores, highScore]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    if (gameRef.current.shake > 0) {
      ctx.translate((Math.random() - 0.5) * gameRef.current.shake, (Math.random() - 0.5) * gameRef.current.shake);
    }

    const scoreVal = gameRef.current.score;
    const themeIndex = Math.min(Math.floor(scoreVal / 10), SKY_THEMES.length - 2);
    const nextThemeIndex = themeIndex + 1;
    const transition = (scoreVal % 10) / 10;

    const currentTop = lerpColor(SKY_THEMES[themeIndex].top, SKY_THEMES[nextThemeIndex].top, transition);
    const currentBottom = lerpColor(SKY_THEMES[themeIndex].bottom, SKY_THEMES[nextThemeIndex].bottom, transition);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    skyGrad.addColorStop(0, currentTop); 
    skyGrad.addColorStop(1, currentBottom);
    ctx.fillStyle = skyGrad; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Parallax
    const buildingOpacity = lerp(1.0, 0.4, Math.min(scoreVal / 40, 0.8));
    ctx.globalAlpha = buildingOpacity;
    ctx.fillStyle = '#6ab8c0';
    for (let i = 0; i < 3; i++) {
      const x = (i * 400) - (gameRef.current.parallaxX % 400);
      ctx.fillRect(x + 20, canvas.height - 180, 60, 140);
      ctx.fillRect(x + 100, canvas.height - 220, 80, 180);
      ctx.fillRect(x + 240, canvas.height - 150, 50, 110);
    }
    ctx.globalAlpha = 1.0;

    // Pipes
    gameRef.current.pipes.forEach(pipe => {
      const groundY = canvas.height - 40;
      const bottomY = pipe.topHeight + SETTINGS.pipeGap;
      const pipeGrad = ctx.createLinearGradient(pipe.x, 0, pipe.x + SETTINGS.pipeWidth, 0);
      pipeGrad.addColorStop(0, '#1a3300'); 
      pipeGrad.addColorStop(0.2, '#3a5f11');
      pipeGrad.addColorStop(0.5, '#c8f08f'); 
      pipeGrad.addColorStop(0.8, '#3a5f11');
      pipeGrad.addColorStop(1, '#1a3300');

      ctx.strokeStyle = '#0a1505'; ctx.lineWidth = 4; ctx.fillStyle = pipeGrad;
      ctx.fillRect(pipe.x, 0, SETTINGS.pipeWidth, pipe.topHeight);
      ctx.strokeRect(pipe.x, -10, SETTINGS.pipeWidth, pipe.topHeight + 10);
      ctx.fillRect(pipe.x, bottomY, SETTINGS.pipeWidth, groundY - bottomY);
      ctx.strokeRect(pipe.x, bottomY, SETTINGS.pipeWidth, groundY - bottomY);
      
      const capGrad = ctx.createLinearGradient(pipe.x - 5, 0, pipe.x + SETTINGS.pipeWidth + 5, 0);
      capGrad.addColorStop(0, '#102200'); capGrad.addColorStop(0.5, '#eaffc2'); capGrad.addColorStop(1, '#102200');
      ctx.fillStyle = capGrad;
      ctx.fillRect(pipe.x - 5, pipe.topHeight - 35, SETTINGS.pipeWidth + 10, 35);
      ctx.strokeRect(pipe.x - 5, pipe.topHeight - 35, SETTINGS.pipeWidth + 10, 35);
      ctx.fillRect(pipe.x - 5, bottomY, SETTINGS.pipeWidth + 10, 35);
      ctx.strokeRect(pipe.x - 5, bottomY, SETTINGS.pipeWidth + 10, 35);
    });

    // Ground
    ctx.fillStyle = '#ded895'; ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    ctx.strokeStyle = '#543847'; ctx.lineWidth = 4; ctx.strokeRect(-2, canvas.height - 40, canvas.width + 4, 42);

    // Particles
    gameRef.current.particles.forEach(p => {
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4);
    });
    ctx.globalAlpha = 1.0;

    // Bird
    const { bird, wingPhase, blinkTimer } = gameRef.current;
    if (gameStateRef.current !== GameState.GAME_OVER || gameRef.current.shake > 0) {
      ctx.save(); 
      ctx.translate(SETTINGS.birdX, bird.y); 
      ctx.rotate(bird.rotation);

      ctx.fillStyle = '#f7d302'; 
      ctx.beginPath(); 
      ctx.ellipse(0, 0, SETTINGS.birdSize / 2, SETTINGS.birdSize / 2.5, 0, 0, Math.PI * 2);
      ctx.fill(); 
      ctx.strokeStyle = '#543847'; 
      ctx.lineWidth = 3; 
      ctx.stroke();
      
      const isRising = bird.velocity < 0;
      const velFactor = Math.abs(bird.velocity) / 6;
      const amplitudeFactor = isRising ? lerp(0.8, 1.2, velFactor) : lerp(0.4, 0.1, Math.min(1, bird.velocity / 8));
      const rotationBias = isRising ? -0.2 : 0.4;
      const baseSwing = Math.sin(wingPhase) * 10 * amplitudeFactor;
      const apexFactor = Math.abs(bird.velocity) < 0.5 ? 0.2 : 1;
      const flapY = baseSwing * apexFactor;
      const wingWidth = 12 + (Math.cos(wingPhase) * 2 * amplitudeFactor);
      const wingHeight = 8 + (flapY > 0 ? flapY * 0.4 : Math.abs(flapY) * 1.0);
      const wingRotation = (Math.cos(wingPhase) * 0.3 * amplitudeFactor) + rotationBias;

      ctx.strokeStyle = '#543847'; ctx.lineWidth = 2.5;

      ctx.save();
      ctx.translate(-4, -2);
      ctx.fillStyle = '#e0c000';
      ctx.beginPath();
      ctx.ellipse(-4, flapY * 0.3, wingWidth * 0.8, wingHeight * 0.8, -0.2 + wingRotation, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.ellipse(-8, flapY / 2, wingWidth, wingHeight, wingRotation, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const blinkWindow = gameStateRef.current === GameState.GAME_OVER ? 10 : 8;
      const isBlinking = blinkTimer < blinkWindow || (gameRef.current.shake > 5 && (gameRef.current.frameCount % 10 < 5));
      const eyeScaleY = isBlinking ? 0.05 : 1.0;
      
      ctx.save();
      ctx.translate(6, -4);
      ctx.scale(1, eyeScaleY);
      ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      
      if (!isBlinking) {
        ctx.fillStyle = 'black'; ctx.beginPath(); ctx.arc(2, 0, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(1.2, -1.2, 0.9, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = '#543847'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = '#f75602'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(22, 4); ctx.lineTo(12, 8); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Score Overlay
    if (gameStateRef.current === GameState.PLAYING) {
      ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 6; ctx.font = '40px "Press Start 2P"'; ctx.textAlign = 'center';
      ctx.strokeText(gameRef.current.score.toString(), canvas.width / 2, 100); ctx.fillText(gameRef.current.score.toString(), canvas.width / 2, 100);
    }
  }, []);

  const loop = useCallback(() => {
    update(); draw(); requestRef.current = requestAnimationFrame(loop);
  }, [update, draw]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [loop]);

  const handleWatchAd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAd(true);
    setAdTimer(5);
    setCanRevive(false);
    const timer = setInterval(() => {
      setAdTimer((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleRevive = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAd(false);
    setGameState(GameState.PLAYING);
    gameRef.current.pipes = gameRef.current.pipes.filter(p => p.x > SETTINGS.birdX + 200 || p.x < SETTINGS.birdX - 100);
    gameRef.current.bird.velocity = -3;
    gameRef.current.bird.y = 300;
    setWisdom("");
    sounds.playFlap();
  };

  return (
    <div 
      className="relative w-full h-screen flex items-center justify-center bg-zinc-950 overflow-hidden touch-none" 
      onMouseDown={(e) => handleJump(e)}
      onTouchStart={(e) => handleJump(e)}
    >
      <div className="relative bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] border-4 border-zinc-800 rounded-xl overflow-hidden flex flex-col items-center justify-center max-w-full max-h-full">
        <canvas ref={canvasRef} width={400} height={600} className="bg-[#4ec0ca] cursor-pointer touch-none" />

        {showAd && (
          <div className="absolute inset-0 bg-zinc-950 z-[100] flex flex-col items-center justify-center p-8 text-white">
            <div className="text-zinc-500 text-[10px] absolute top-6 left-6 flex items-center gap-2">
              <span className="bg-zinc-800 px-2 py-1 rounded border border-zinc-700">[AD]</span>
              <span>GEMINI_ADS_REWARD</span>
            </div>
            <div className="w-full aspect-video bg-zinc-900 rounded-2xl flex flex-col items-center justify-center mb-8 border-2 border-zinc-800 shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-blue-500/5 animate-pulse"></div>
              <div className="text-zinc-700 text-6xl font-black opacity-20 group-hover:opacity-30 transition-opacity uppercase">REWARD</div>
            </div>
            <h3 className="text-2xl font-black mb-2 tracking-tighter uppercase">Second Flight?</h3>
            {adTimer > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="text-6xl font-black text-blue-500 tabular-nums">{adTimer}</div>
                <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
                   <div className="h-full bg-blue-500 transition-all duration-1000 linear" style={{ width: `${(adTimer / 5) * 100}%` }} />
                </div>
              </div>
            ) : (
              <button onClick={handleRevive} className="bg-blue-600 hover:bg-blue-500 px-12 py-5 rounded-2xl font-black text-lg border-b-8 border-blue-800 active:border-b-2 active:translate-y-1.5 transition-all shadow-2xl">
                REVIVE NOW
              </button>
            )}
            <p className="text-[8px] text-zinc-600 mt-6 font-mono tracking-widest uppercase">pub-8615789090438802</p>
          </div>
        )}

        {gameState === GameState.START && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white p-6 text-center select-none pointer-events-none backdrop-blur-[2px]">
            <h1 className="text-4xl font-bold mb-8 drop-shadow-[0_4px_0_rgba(0,0,0,1)] animate-pulse tracking-tighter">FLAPPY GEMINI</h1>
            <div className="bg-yellow-400 p-6 border-4 border-white text-black rounded-lg shadow-xl scale-110">
              <p className="text-sm font-bold uppercase">TAP TO START</p>
            </div>
          </div>
        )}

        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-white p-6 text-center select-none overflow-y-auto animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center mb-2">
              <span className="text-[9px] text-zinc-500 tracking-[0.3em] uppercase mb-1">TOTAL SCORE</span>
              <span className="text-7xl font-black text-white tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">{score}</span>
            </div>

            <h2 className="text-2xl font-black mb-6 text-red-600 drop-shadow-[0_4px_0_rgba(0,0,0,1)] italic tracking-tighter uppercase scale-x-110">CRASHED!</h2>
            
            <div className="w-full max-w-[280px] mb-6">
              {canRevive ? (
                <button onMouseDown={handleWatchAd} className="group relative w-full bg-white text-black px-6 py-4 rounded-2xl border-b-4 border-zinc-400 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-between font-black shadow-xl overflow-hidden">
                  <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 transition-colors"></div>
                  <div className="flex items-center gap-3 relative z-10">
                    <span className="bg-blue-600 text-white text-[9px] px-2 py-1 rounded-md font-bold shadow-inner">[AD]</span>
                    <span className="text-[11px] uppercase tracking-tighter">REVIVE FLIGHT</span>
                  </div>
                  <span className="text-xl relative z-10">❤️</span>
                </button>
              ) : (
                <div className="bg-zinc-800/40 p-4 rounded-2xl border border-zinc-700/50 text-zinc-600 text-[9px] italic flex items-center justify-center gap-2">
                   <span className="opacity-50">⚡</span> REVIVE CONSUMED
                </div>
              )}
            </div>

            <div className="w-full max-w-[280px] bg-zinc-900/90 border-2 border-zinc-800 rounded-3xl p-5 mb-6 shadow-2xl">
              <p className="text-[9px] text-zinc-500 tracking-[0.2em] uppercase mb-4 text-left font-bold border-b border-zinc-800 pb-2 flex items-center gap-2">
                 <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse"></span> HIGHSCORES
              </p>
              
              <div className="space-y-2">
                {topScores.map((s, i) => (
                    <div key={i} className={`flex justify-between items-center p-2 rounded-lg border border-white/5 ${i === 0 ? 'bg-yellow-400/5 border-yellow-400/20' : 'bg-white/5'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold ${i === 0 ? 'text-yellow-400' : 'text-zinc-500'}`}>#{i + 1}</span>
                        <span className="text-[11px] font-black uppercase text-zinc-300">Bird</span>
                      </div>
                      <span className={`font-black text-sm ${i === 0 ? 'text-yellow-400' : 'text-white'}`}>{s}</span>
                    </div>
                ))}
              </div>

              {wisdom && (
                <div className="mt-4 pt-3 border-t border-zinc-800 text-left">
                  <p className="text-[9px] font-medium leading-relaxed text-zinc-400 italic">
                    {loadingWisdom ? "Synthesizing bird wisdom..." : `"${wisdom}"`}
                  </p>
                </div>
              )}
            </div>

            <button 
              className="group relative bg-green-500 hover:bg-green-400 active:bg-green-600 w-full max-w-[280px] py-5 rounded-2xl border-b-8 border-green-800 active:border-b-0 active:translate-y-2 transition-all text-sm font-black text-black shadow-xl overflow-hidden"
              onMouseDown={(e) => { e.stopPropagation(); initGame(); setGameState(GameState.PLAYING); }}
            >
              <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 skew-x-12"></div>
              PLAY AGAIN
            </button>
          </div>
        )}
      </div>
      
      <div className="absolute bottom-6 right-6 text-white/5 text-[8px] pointer-events-none uppercase tracking-widest font-mono">
        Native Engine v3.1 | KOTLIN_INTEROP
      </div>
    </div>
  );
};

export default App;
