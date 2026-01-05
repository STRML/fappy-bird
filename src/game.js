// Core game class

import { Bird } from './bird.js';
import { PipeManager } from './pipes.js';

const GROUND_HEIGHT = 80;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;

    // Mobile detection for performance optimizations
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Game objects
    this.bird = new Bird(80, this.height / 2);
    this.pipes = new PipeManager(this.width, this.height, GROUND_HEIGHT);

    // Game state
    this.state = 'menu'; // 'menu' | 'ready' | 'playing' | 'gameover'
    this.score = 0;
    this.highScore = this.loadHighScore();
    this.frozen = true; // Bird doesn't move until first pump
    this.speed = 0.5; // Start at 50% speed
    this.speedIncrement = 0.05; // Increase 5% per pipe
    this.maxSpeed = 1.0; // Cap at 100%
    this.gap = 200; // Start with wider gap
    this.gapDecrement = 4; // Decrease 4px per pipe
    this.minGap = 160; // Cap at minimum gap
    this.gameOverTime = 0; // When game over started
    this.restartCooldown = 3000; // 3 seconds before pump can restart

    // Background elements
    this.groundOffset = 0;
    this.cloudOffset = 0;
    this.clouds = this.generateClouds();

    // Cache sky gradient for performance
    this.skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    this.skyGradient.addColorStop(0, '#87CEEB');
    this.skyGradient.addColorStop(0.7, '#E0F6FF');
    this.skyGradient.addColorStop(1, '#87CEEB');

    // Animation
    this.lastTime = 0;
  }

  generateClouds() {
    const clouds = [];
    const count = this.isMobile ? 3 : 5; // Fewer clouds on mobile
    for (let i = 0; i < count; i++) {
      clouds.push({
        x: Math.random() * this.width,
        y: 30 + Math.random() * 100,
        size: 20 + Math.random() * 40
      });
    }
    return clouds;
  }

  loadHighScore() {
    return parseInt(localStorage.getItem('fappyHighScore') || '0', 10);
  }

  saveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('fappyHighScore', this.highScore.toString());
    }
  }

  start() {
    if (this.state === 'menu' || this.state === 'gameover') {
      this.reset();
      this.state = 'ready'; // Wait for first pump
      this.frozen = true;
    }
  }

  reset() {
    this.bird.reset(80, this.height / 2);
    this.pipes.reset();
    this.score = 0;
    this.frozen = true;
    this.speed = 0.5;
    this.gap = 200;
  }

  updateDifficulty() {
    // Speed = 0.5 + 0.05 * score, capped at maxSpeed
    this.speed = Math.min(0.5 + this.speedIncrement * this.score, this.maxSpeed);
    // Gap = 200 - 4 * score, capped at minGap
    this.gap = Math.max(200 - this.gapDecrement * this.score, this.minGap);
  }

  jump() {
    if (this.state === 'playing') {
      this.bird.jump();
      return true;
    } else if (this.state === 'ready') {
      // First pump starts the game
      this.frozen = false;
      this.state = 'playing';
      this.bird.jump();
      return true;
    } else if (this.state === 'menu') {
      this.start();
      return true;
    } else if (this.state === 'gameover') {
      if (this.canRestartFromGameOver()) {
        this.start();
        return true;
      }
      return false;
    }
    return false;
  }

  update(deltaTime = 16.67) {
    if (this.state !== 'playing' && this.state !== 'ready') return;
    if (this.frozen) return; // Bird stationary until first pump

    // Normalize delta time to 60fps baseline (16.67ms per frame)
    const dt = (deltaTime / 16.67) * this.speed;

    // Update bird and pipes with normalized delta time
    this.bird.update(dt);
    this.pipes.update(dt, this.gap);

    // Check scoring
    if (this.pipes.checkScore(this.bird)) {
      this.score++;
      this.updateDifficulty(); // Increase speed and decrease gap after scoring
      return 'score';
    }

    // Check collisions
    const playableHeight = this.height - GROUND_HEIGHT;

    // Ground/ceiling collision
    if (this.bird.y < this.bird.radius ||
        this.bird.y > playableHeight - this.bird.radius) {
      this.gameOver();
      return 'hit';
    }

    // Pipe collision
    if (this.pipes.checkCollision(this.bird)) {
      this.gameOver();
      return 'hit';
    }

    // Update background (scaled by delta time)
    this.groundOffset = (this.groundOffset + 2.5 * dt) % 24;
    this.cloudOffset = (this.cloudOffset + 0.5 * dt) % this.width;

    return null;
  }

  gameOver() {
    this.state = 'gameover';
    this.gameOverTime = performance.now();
    this.saveHighScore();
  }

  canRestartFromGameOver() {
    return performance.now() - this.gameOverTime >= this.restartCooldown;
  }

  render() {
    const ctx = this.ctx;

    // Sky gradient (cached)
    ctx.fillStyle = this.skyGradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (const cloud of this.clouds) {
      const x = (cloud.x - this.cloudOffset + this.width) % this.width;
      this.drawCloud(ctx, x, cloud.y, cloud.size);
    }

    // Pipes
    this.pipes.draw(ctx);

    // Ground
    this.drawGround(ctx);

    // Bird
    this.bird.draw(ctx);
  }

  drawCloud(ctx, x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y - size * 0.2, size * 0.4, 0, Math.PI * 2);
    ctx.arc(x + size * 0.8, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.4, y + size * 0.1, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGround(ctx) {
    const groundY = this.height - GROUND_HEIGHT;

    // Dirt
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, groundY + 20, this.width, GROUND_HEIGHT - 20);

    // Grass top - use solid color on mobile, gradient on desktop
    if (this.isMobile) {
      ctx.fillStyle = '#228B22';
    } else {
      const grassGradient = ctx.createLinearGradient(0, groundY, 0, groundY + 25);
      grassGradient.addColorStop(0, '#228B22');
      grassGradient.addColorStop(1, '#2E8B57');
      ctx.fillStyle = grassGradient;
    }
    ctx.fillRect(0, groundY, this.width, 25);

    // Grass pattern - skip on mobile for performance
    if (!this.isMobile) {
      ctx.fillStyle = '#1E7A1E';
      for (let i = -this.groundOffset; i < this.width + 24; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, groundY);
        ctx.lineTo(i + 12, groundY + 10);
        ctx.lineTo(i + 24, groundY);
        ctx.fill();
      }
    }

    // Grass highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(0, groundY, this.width, 3);
  }

  getScore() {
    return this.score;
  }

  getHighScore() {
    return this.highScore;
  }

  getState() {
    return this.state;
  }
}
