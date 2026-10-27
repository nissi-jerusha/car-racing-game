export type GameSnapshot = {
  score: number;
  distance: number;
  speed: number;
  lives: number;
  boost: number;
  boosting: boolean;
  overtakes: number;
  nearMisses: number;
};

export type GameEffect = 'start' | 'steer' | 'boost' | 'pass' | 'near' | 'hit' | 'over';

type EngineCallbacks = {
  onUpdate: (snapshot: GameSnapshot) => void;
  onGameOver: (snapshot: GameSnapshot) => void;
  onEffect: (effect: GameEffect) => void;
};

type TrafficCar = {
  lane: number;
  y: number;
  color: string;
  speed: number;
  passed: boolean;
  variant: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type RoadMetrics = {
  left: number;
  right: number;
  width: number;
  lane: number;
  carWidth: number;
  carHeight: number;
  playerY: number;
};

const TRAFFIC_COLORS = ['#d5d9d5', '#768b99', '#d76556', '#5f9a9c', '#b2a59b'];
const PLAYER_Y = 0.79;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class RaceEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;
  private observer: ResizeObserver | null = null;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private frame = 0;
  private lastFrame = 0;
  private running = false;
  private elapsed = 0;
  private score = 0;
  private distance = 0;
  private speed = 148;
  private lives = 3;
  private boost = 100;
  private boostHeld = false;
  private boostLocked = false;
  private boosting = false;
  private braking = false;
  private lane = 1;
  private playerPosition = 1;
  private lean = 0;
  private roadOffset = 0;
  private spawnTimer = 0.5;
  private traffic: TrafficCar[] = [];
  private particles: Particle[] = [];
  private invulnerable = 0;
  private shake = 0;
  private flash = 0;
  private crashTimer = 0;
  private overtakes = 0;
  private nearMisses = 0;
  private hudTimer = 0;
  private particleTimer = 0;
  private toast = '';
  private toastTimer = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas is not supported in this browser.');
    this.canvas = canvas;
    this.ctx = context;
    this.callbacks = callbacks;

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start() {
    cancelAnimationFrame(this.frame);
    this.elapsed = 0;
    this.score = 0;
    this.distance = 0;
    this.speed = 148;
    this.lives = 3;
    this.boost = 100;
    this.boostHeld = false;
    this.boostLocked = false;
    this.boosting = false;
    this.braking = false;
    this.lane = 1;
    this.playerPosition = 1;
    this.lean = 0;
    this.roadOffset = 0;
    this.spawnTimer = 0.5;
    this.traffic = [];
    this.particles = [];
    this.invulnerable = 0;
    this.shake = 0;
    this.flash = 0;
    this.crashTimer = 0;
    this.overtakes = 0;
    this.nearMisses = 0;
    this.hudTimer = 0;
    this.toast = '';
    this.toastTimer = 0;
    this.running = true;
    this.lastFrame = performance.now();
    this.callbacks.onUpdate(this.snapshot());
    this.callbacks.onEffect('start');
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    this.boostHeld = false;
    this.braking = false;
    cancelAnimationFrame(this.frame);
    this.draw();
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  steer(direction: -1 | 1) {
    if (!this.running || this.crashTimer > 0) return;
    const next = clamp(this.lane + direction, 0, 2);
    if (next !== this.lane) {
      this.lane = next;
      this.callbacks.onEffect('steer');
    }
  }

  setBoost(held: boolean) {
    this.boostHeld = held;
    if (!held) this.boostLocked = false;
  }

  setBrake(held: boolean) {
    this.braking = held;
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    window.removeEventListener('resize', this.resize);
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.width = rect.width;
    this.height = rect.height;
    // A modest pixel ratio keeps the canvas smooth on high-density phones.
    this.dpr = Math.min(window.devicePixelRatio || 1, this.width < 600 ? 1.5 : 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw();
  };

  private tick = (time: number) => {
    if (!this.running) return;
    const dt = Math.min((time - this.lastFrame) / 1000, 0.04);
    this.lastFrame = time;
    this.update(dt);
    this.draw();
    if (this.running) this.frame = requestAnimationFrame(this.tick);
  };

  private snapshot(): GameSnapshot {
    return {
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      speed: Math.round(this.speed),
      lives: this.lives,
      boost: Math.max(0, Math.round(this.boost)),
      boosting: this.boosting,
      overtakes: this.overtakes,
      nearMisses: this.nearMisses,
    };
  }

  private metrics(): RoadMetrics {
    const roadWidth = Math.min(this.width * (this.width < 600 ? 0.83 : 0.58), this.height * 0.96);
    const lane = roadWidth / 3;
    const carWidth = Math.min(lane * 0.58, this.height * 0.112);
    return {
      left: (this.width - roadWidth) / 2,
      right: (this.width + roadWidth) / 2,
      width: roadWidth,
      lane,
      carWidth,
      carHeight: carWidth * 1.82,
      playerY: this.height * PLAYER_Y,
    };
  }

  private laneX(lane: number, road: RoadMetrics) {
    return road.left + road.lane * (lane + 0.5);
  }

  private update(dt: number) {
    this.elapsed += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shake = Math.max(0, this.shake - dt * 20);
    this.flash = Math.max(0, this.flash - dt * 2.1);
    this.toastTimer = Math.max(0, this.toastTimer - dt);

    if (this.crashTimer > 0) {
      this.crashTimer -= dt;
      this.roadOffset += dt * this.height * 0.1;
      this.updateParticles(dt);
      if (this.crashTimer <= 0) {
        this.running = false;
        this.callbacks.onUpdate(this.snapshot());
        this.callbacks.onEffect('over');
        this.callbacks.onGameOver(this.snapshot());
      }
      return;
    }

    const wasBoosting = this.boosting;
    this.boosting = this.boostHeld && !this.boostLocked && this.boost > 0;
    if (this.boosting) {
      this.boost = Math.max(0, this.boost - dt * 25);
      if (this.boost <= 0) this.boostLocked = true;
    } else {
      this.boost = Math.min(100, this.boost + dt * 10);
    }
    if (this.boosting && !wasBoosting) {
      this.callbacks.onEffect('boost');
      this.shake = Math.max(this.shake, 3.5);
    }

    const speedBonus = Math.min(this.elapsed * 1.7, 90);
    this.speed = 148 + speedBonus + (this.boosting ? 70 : 0) - (this.braking ? 38 : 0);
    const movement = (0.34 + Math.min(this.elapsed * 0.002, 0.15)) * (this.boosting ? 1.38 : this.braking ? 0.76 : 1);
    this.roadOffset += dt * this.height * movement;
    this.distance += (this.speed / 3.6) * dt;
    this.score += dt * (14 + speedBonus * 0.2) * (this.boosting ? 2 : 1);

    const previousPosition = this.playerPosition;
    this.playerPosition += (this.lane - this.playerPosition) * (1 - Math.exp(-15 * dt));
    const targetLean = clamp((this.playerPosition - previousPosition) * 4, -0.18, 0.18);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 12);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTraffic();
      this.spawnTimer = Math.max(0.72, 1.25 - this.elapsed * 0.006) + Math.random() * 0.2;
    }

    const road = this.metrics();
    const playerX = this.laneX(this.playerPosition, road);
    for (const car of this.traffic) {
      car.y += movement * car.speed * dt;
      const x = this.laneX(car.lane, road);
      const y = car.y * this.height;
      const deltaX = Math.abs(x - playerX);
      const deltaY = Math.abs(y - road.playerY);

      if (this.invulnerable <= 0 && deltaX < road.carWidth * 0.78 && deltaY < road.carHeight * 0.75) {
        car.y = 2;
        this.hit(playerX, road.playerY);
        if (this.crashTimer > 0) break;
        continue;
      }

      if (!car.passed && y > road.playerY + road.carHeight * 0.6) {
        car.passed = true;
        this.overtakes += 1;
        const close = deltaX < road.lane * 1.28 && deltaX > road.carWidth * 0.7;
        if (close && this.invulnerable <= 0) {
          const bonus = this.boosting ? 300 : 150;
          this.score += bonus;
          this.nearMisses += 1;
          this.toast = `CLOSE CALL  +${bonus}`;
          this.toastTimer = 1.15;
          this.shake = Math.max(this.shake, 2.2);
          this.burst(x, y, 7, ['#d6ff5c', '#ffffff', '#91f0de'], 95);
          this.callbacks.onEffect('near');
        } else {
          this.score += this.boosting ? 120 : 60;
          this.callbacks.onEffect('pass');
        }
      }
    }
    this.traffic = this.traffic.filter((car) => car.y < 1.25);

    this.particleTimer -= dt;
    if (this.boosting && this.particleTimer <= 0) {
      this.particleTimer = 0.035;
      const side = Math.random() > 0.5 ? 0.22 : -0.22;
      this.particles.push({
        x: playerX + road.carWidth * side,
        y: road.playerY + road.carHeight * 0.48,
        vx: (Math.random() - 0.5) * 24,
        vy: 80 + Math.random() * 80,
        life: 0.24 + Math.random() * 0.2,
        maxLife: 0.44,
        size: 2 + Math.random() * 3,
        color: Math.random() > 0.5 ? '#d5ff54' : '#8cece2',
      });
    }
    this.updateParticles(dt);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.callbacks.onUpdate(this.snapshot());
    }
  }

  private spawnTraffic() {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const count = this.elapsed > 12 && Math.random() < 0.3 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      this.traffic.push({
        lane: lanes[i],
        y: -0.16,
        color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
        speed: 0.94 + Math.random() * 0.12,
        passed: false,
        variant: Math.random(),
      });
    }
  }

  private hit(x: number, y: number) {
    this.lives -= 1;
    this.invulnerable = 1.7;
    this.shake = 12;
    this.flash = 0.48;
    this.toast = this.lives ? 'IMPACT!  KEEP GOING' : 'WRECKED';
    this.toastTimer = 1.1;
    this.burst(x, y - this.metrics().carHeight * 0.3, 28, ['#d8ff5f', '#ffb149', '#ff5f48', '#ffffff'], 260);
    this.callbacks.onEffect('hit');
    if (typeof navigator.vibrate === 'function') navigator.vibrate([35, 20, 50]);
    if (this.lives <= 0) {
      this.boosting = false;
      this.crashTimer = 0.8;
    }
    this.callbacks.onUpdate(this.snapshot());
  }

  private burst(x: number, y: number, count: number, colors: string[], force: number) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = force * (0.3 + Math.random() * 0.7);
      const life = 0.25 + Math.random() * 0.55;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  private updateParticles(dt: number) {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.18, dt);
      particle.vy *= Math.pow(0.3, dt);
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  private draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const road = this.metrics();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#091114';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.drawRoad(road);

    for (const car of this.traffic) {
      this.drawCar(this.laneX(car.lane, road), car.y * h, road.carWidth, road.carHeight, car.color, false, 0, car.variant);
    }

    for (const particle of this.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size * 1.6);
    }
    ctx.globalAlpha = 1;

    if (this.invulnerable <= 0 || Math.floor(this.invulnerable * 10) % 2 === 0 || this.crashTimer > 0) {
      this.drawCar(this.laneX(this.playerPosition, road), road.playerY, road.carWidth, road.carHeight, '#d9f84f', true, this.lean, 0);
    }

    if (this.toastTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.toastTimer * 3);
      ctx.textAlign = 'center';
      ctx.font = `italic 800 ${Math.max(15, Math.min(22, w * 0.026))}px 'Barlow Condensed', sans-serif`;
      ctx.fillStyle = '#e5ff79';
      ctx.shadowColor = '#091114';
      ctx.shadowBlur = 8;
      ctx.fillText(this.toast, w / 2, h * 0.31 - (1.15 - this.toastTimer) * 12);
      ctx.restore();
    }
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 104, 65, ${this.flash * 0.45})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawRoad(road: RoadMetrics) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const sideGradient = ctx.createLinearGradient(0, 0, w, 0);
    sideGradient.addColorStop(0, '#091315');
    sideGradient.addColorStop(0.5, '#152024');
    sideGradient.addColorStop(1, '#091315');
    ctx.fillStyle = sideGradient;
    ctx.fillRect(-15, -15, w + 30, h + 30);

    // Roadside details scroll at a different rate to give the flat road depth.
    const sideOffset = (this.roadOffset * 0.75) % 150;
    for (let y = -150 + sideOffset; y < h + 150; y += 150) {
      ctx.fillStyle = 'rgba(146, 187, 179, 0.045)';
      ctx.fillRect(0, y, Math.max(0, road.left - 24), 1);
      ctx.fillRect(road.right + 24, y, Math.max(0, w - road.right - 24), 1);
      ctx.fillStyle = 'rgba(132, 180, 167, 0.13)';
      ctx.fillRect(road.left - 18, y + 38, 3, 28);
      ctx.fillRect(road.right + 15, y + 38, 3, 28);
      ctx.fillStyle = 'rgba(196, 255, 109, 0.25)';
      ctx.fillRect(road.left - 18, y + 38, 3, 5);
      ctx.fillRect(road.right + 15, y + 38, 3, 5);
    }

    const asphalt = ctx.createLinearGradient(road.left, 0, road.right, 0);
    asphalt.addColorStop(0, '#242e30');
    asphalt.addColorStop(0.18, '#303a3b');
    asphalt.addColorStop(0.5, '#293335');
    asphalt.addColorStop(0.82, '#303a3b');
    asphalt.addColorStop(1, '#222c2f');
    ctx.fillStyle = asphalt;
    ctx.fillRect(road.left, -15, road.width, h + 30);

    ctx.fillStyle = 'rgba(152, 184, 176, 0.045)';
    const textureOffset = this.roadOffset % 91;
    for (let i = 0; i < 44; i += 1) {
      const x = road.left + ((i * 89.7) % road.width);
      const y = ((i * 127.3 + textureOffset) % (h + 80)) - 40;
      ctx.fillRect(x, y, 1 + (i % 2), 11 + (i % 5) * 8);
    }

    ctx.fillStyle = 'rgba(4, 10, 12, 0.5)';
    ctx.fillRect(road.left, 0, 8, h);
    ctx.fillRect(road.right - 8, 0, 8, h);
    ctx.fillStyle = '#b6c3b4';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(road.left + 9, 0, 2, h);
    ctx.fillRect(road.right - 11, 0, 2, h);
    ctx.globalAlpha = 1;

    const curbOffset = this.roadOffset % 74;
    for (let y = -74 + curbOffset; y < h + 74; y += 74) {
      ctx.fillStyle = '#d8f45b';
      ctx.globalAlpha = 0.72;
      ctx.fillRect(road.left - 5, y, 5, 30);
      ctx.fillRect(road.right, y, 5, 30);
      ctx.fillStyle = '#dae1dc';
      ctx.globalAlpha = 0.28;
      ctx.fillRect(road.left - 5, y + 37, 5, 30);
      ctx.fillRect(road.right, y + 37, 5, 30);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = 'rgba(218, 230, 221, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([h * 0.095, h * 0.075]);
    ctx.lineDashOffset = -this.roadOffset;
    for (let lane = 1; lane < 3; lane += 1) {
      ctx.beginPath();
      ctx.moveTo(road.left + road.lane * lane, -h * 0.2);
      ctx.lineTo(road.left + road.lane * lane, h * 1.2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    const vignette = ctx.createLinearGradient(0, 0, 0, h);
    vignette.addColorStop(0, 'rgba(4, 10, 13, 0.35)');
    vignette.addColorStop(0.28, 'rgba(4, 10, 13, 0)');
    vignette.addColorStop(0.78, 'rgba(4, 10, 13, 0)');
    vignette.addColorStop(1, 'rgba(4, 10, 13, 0.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  private drawCar(x: number, y: number, w: number, h: number, color: string, player: boolean, lean: number, variant: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);

    if (player && this.boosting) {
      const flame = ctx.createLinearGradient(0, h * 0.38, 0, h * 1.05);
      flame.addColorStop(0, 'rgba(220, 255, 100, 0.75)');
      flame.addColorStop(0.3, 'rgba(100, 224, 210, 0.4)');
      flame.addColorStop(1, 'rgba(100, 224, 210, 0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(-w * 0.25, h * 0.35);
      ctx.lineTo(w * 0.25, h * 0.35);
      ctx.lineTo(w * 0.15, h * 1.05);
      ctx.lineTo(-w * 0.15, h * 1.05);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(w * 0.08, h * 0.08, w * 0.63, h * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0b1011';
    for (const wheelX of [-0.48, 0.35]) {
      ctx.fillRect(w * wheelX, -h * 0.29, w * 0.13, h * 0.24);
      ctx.fillRect(w * wheelX, h * 0.16, w * 0.13, h * 0.23);
    }

    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, player ? '#889f27' : '#536064');
    body.addColorStop(0.18, color);
    body.addColorStop(0.5, player ? '#efff8a' : color);
    body.addColorStop(0.83, color);
    body.addColorStop(1, player ? '#748e1d' : '#4d585b');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, -h * 0.47);
    ctx.quadraticCurveTo(0, -h * 0.53, w * 0.32, -h * 0.47);
    ctx.lineTo(w * 0.42, -h * 0.3);
    ctx.lineTo(w * 0.45, h * 0.31);
    ctx.quadraticCurveTo(w * 0.43, h * 0.48, w * 0.31, h * 0.49);
    ctx.lineTo(-w * 0.31, h * 0.49);
    ctx.quadraticCurveTo(-w * 0.43, h * 0.48, -w * 0.45, h * 0.31);
    ctx.lineTo(-w * 0.42, -h * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(8, 15, 17, 0.9)';
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, -h * 0.16);
    ctx.lineTo(-w * 0.22, -h * 0.29);
    ctx.quadraticCurveTo(0, -h * 0.34, w * 0.22, -h * 0.29);
    ctx.lineTo(w * 0.28, -h * 0.16);
    ctx.lineTo(w * 0.25, h * 0.13);
    ctx.lineTo(-w * 0.25, h * 0.13);
    ctx.closePath();
    ctx.fill();

    const glass = ctx.createLinearGradient(0, -h * 0.27, 0, h * 0.11);
    glass.addColorStop(0, '#344c51');
    glass.addColorStop(0.5, '#152629');
    glass.addColorStop(1, '#0b171a');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(-w * 0.21, -h * 0.23);
    ctx.lineTo(w * 0.21, -h * 0.23);
    ctx.lineTo(w * 0.24, -h * 0.1);
    ctx.lineTo(-w * 0.24, -h * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = player ? '#b3d238' : color;
    ctx.fillRect(-w * 0.23, -h * 0.075, w * 0.46, h * (variant > 0.55 ? 0.15 : 0.12));
    ctx.fillStyle = '#142326';
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, h * 0.08);
    ctx.lineTo(w * 0.22, h * 0.08);
    ctx.lineTo(w * 0.17, h * 0.22);
    ctx.lineTo(-w * 0.17, h * 0.22);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 231, 0.75)';
    ctx.fillRect(-w * 0.34, -h * 0.445, w * 0.17, h * 0.025);
    ctx.fillRect(w * 0.17, -h * 0.445, w * 0.17, h * 0.025);
    ctx.fillStyle = '#ff554b';
    ctx.shadowColor = '#ff4239';
    ctx.shadowBlur = player ? 10 : 5;
    ctx.fillRect(-w * 0.36, h * 0.37, w * 0.23, h * 0.035);
    ctx.fillRect(w * 0.13, h * 0.37, w * 0.23, h * 0.035);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#10191a';
    ctx.fillRect(-w * 0.29, h * 0.43, w * 0.58, h * 0.035);
    if (player) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(-w * 0.025, -h * 0.44, w * 0.05, h * 0.14);
    }
    ctx.restore();
  }
}