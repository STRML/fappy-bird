// Fappy Bird - Main entry point

import { Game } from './game.js';
import { HandTracker } from './handTracking.js';
import { MotionDetector } from './motionDetection.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';

class FappyBird {
  constructor() {
    // DOM elements
    this.canvas = document.getElementById('game');
    this.webcam = document.getElementById('webcam');
    this.handCanvas = document.getElementById('hand-canvas');
    this.statusEl = document.getElementById('status');
    this.scoreDisplay = document.getElementById('score-display');
    this.scoreEl = document.getElementById('score');
    this.menuScreen = document.getElementById('menu');
    this.readyScreen = document.getElementById('ready');
    this.gameoverScreen = document.getElementById('gameover');
    this.finalScoreEl = document.getElementById('final-score');
    this.wonScreen = document.getElementById('won');
    this.winScoreEl = document.getElementById('win-score');

    // Set canvas size
    this.canvas.width = 400;
    this.canvas.height = 600;

    // Initialize systems
    this.game = new Game(this.canvas);
    this.handTracker = new HandTracker();
    this.motionDetector = new MotionDetector();
    this.inputManager = new InputManager();
    this.audio = new AudioManager();

    // State
    this.handTrackingEnabled = false;
    this.lastDetectionTime = 0;
    this.detectionInterval = 33; // ~30fps for hand detection

    // Bind methods
    this.gameLoop = this.gameLoop.bind(this);
    this.handleJump = this.handleJump.bind(this);

    this.init();
  }

  async init() {
    // Initialize audio
    this.audio.init();

    // Setup input callbacks
    this.inputManager.onJump(this.handleJump);
    this.inputManager.setupCanvas(this.canvas);

    // Setup UI buttons
    document.getElementById('start-btn').addEventListener('click', () => {
      this.audio.resume();
      this.startGame();
    });

    document.getElementById('retry-btn').addEventListener('click', () => {
      this.audio.resume();
      this.startGame();
    });

    document.getElementById('share-btn').addEventListener('click', () => {
      this.shareScore();
    });

    document.getElementById('win-retry-btn').addEventListener('click', () => {
      this.audio.resume();
      this.startGame();
    });

    document.getElementById('win-share-btn').addEventListener('click', () => {
      this.shareScore(true);
    });

    // Start game loop immediately (game works without camera)
    requestAnimationFrame(this.gameLoop);

    // Try to initialize hand tracking (async, non-blocking)
    this.initHandTracking();
  }

  async initHandTracking() {
    this.updateStatus('Checking camera...');

    // Wait a bit for TensorFlow scripts to load
    await new Promise(r => setTimeout(r, 500));

    // Check if we're in a secure context (required for camera)
    if (!window.isSecureContext) {
      this.updateStatus('HTTPS required for camera');
      console.warn('Camera requires HTTPS or localhost');
      return;
    }

    this.updateStatus('Initializing camera...');

    try {
      this.handTrackingEnabled = await this.handTracker.init(this.webcam, this.handCanvas);

      if (this.handTrackingEnabled) {
        this.updateStatus('Hand tracking ready!');
        this.webcam.style.display = 'block';
      } else {
        this.updateStatus('Use keyboard/tap');
        this.webcam.style.display = 'none';
        document.getElementById('debug-overlay').style.display = 'none';
      }
    } catch (error) {
      console.error('Hand tracking init error:', error);
      this.updateStatus('Camera error - use keyboard');
      this.webcam.style.display = 'none';
    }
  }

  handleJump() {
    if (this.game.jump()) {
      this.audio.resume();
      this.audio.playJump();

      // Visual feedback
      this.canvas.classList.add('jump-flash');
      setTimeout(() => this.canvas.classList.remove('jump-flash'), 150);
    }
  }

  startGame() {
    this.game.start();
    this.motionDetector.reset();
    this.handTracker.resetSquirt();
    this.updateUI();
  }

  handleWin() {
    this.game.win();
    this.audio.playScore(); // Victory sound
    this.spawnConfetti();
    this.updateUI();
  }

  spawnConfetti() {
    // Create confetti particles
    const colors = ['#FFD93D', '#E31937', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800'];
    const container = document.getElementById('game-container');

    for (let i = 0; i < 100; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.cssText = `
        position: absolute;
        width: ${5 + Math.random() * 10}px;
        height: ${5 + Math.random() * 10}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        left: ${Math.random() * 100}%;
        top: -20px;
        opacity: 1;
        transform: rotate(${Math.random() * 360}deg);
        animation: confetti-fall ${2 + Math.random() * 2}s ease-out forwards;
        animation-delay: ${Math.random() * 0.5}s;
        z-index: 100;
        pointer-events: none;
      `;
      container.appendChild(confetti);

      // Remove after animation
      setTimeout(() => confetti.remove(), 5000);
    }
  }

  async gameLoop(timestamp) {
    // Hand tracking (throttled)
    if (this.handTrackingEnabled && timestamp - this.lastDetectionTime > this.detectionInterval) {
      this.lastDetectionTime = timestamp;
      await this.processHandTracking();
    }

    // Update game
    const event = this.game.update();

    if (event === 'score') {
      this.audio.playScore();
    } else if (event === 'hit') {
      this.audio.playHit();
      setTimeout(() => this.audio.playGameOver(), 200);
    }

    // Render
    this.game.render();

    // Update UI
    this.updateUI();

    // Continue loop
    requestAnimationFrame(this.gameLoop);
  }

  async processHandTracking() {
    const hand = await this.handTracker.detect();
    const state = this.game.getState();

    // Check for squirt gesture (win condition)
    if (state === 'playing' && this.handTracker.checkSquirt()) {
      this.handleWin();
      return;
    }

    if (hand) {
      // Use hand center (works better for horizontal grip)
      const position = this.handTracker.getWristPosition();
      if (!position) return;

      const shouldJump = this.motionDetector.update(position.y);

      // Allow pump to start from menu, ready, gameover, won, or during play
      if (shouldJump && (state === 'playing' || state === 'ready' || state === 'menu' || state === 'gameover' || state === 'won')) {
        this.handleJump();
      }

      // Update debug status
      const debug = this.motionDetector.getDebugInfo();
      this.updateStatus(`v: ${debug.velocity.toFixed(1)} | ${debug.state}`);
    } else {
      this.updateStatus('No hand detected');
    }
  }

  updateUI() {
    const state = this.game.getState();
    const score = this.game.getScore();

    // Score display
    if (state === 'playing') {
      this.scoreDisplay.classList.remove('hidden');
      this.scoreEl.textContent = score;
    } else {
      this.scoreDisplay.classList.add('hidden');
    }

    // Menu screen
    if (state === 'menu') {
      this.menuScreen.classList.remove('hidden');
    } else {
      this.menuScreen.classList.add('hidden');
    }

    // Ready/tutorial screen
    if (state === 'ready') {
      this.readyScreen.classList.remove('hidden');
    } else {
      this.readyScreen.classList.add('hidden');
    }

    // Game over screen
    if (state === 'gameover') {
      this.gameoverScreen.classList.remove('hidden');
      this.finalScoreEl.textContent = score;
    } else {
      this.gameoverScreen.classList.add('hidden');
    }

    // Win screen
    if (state === 'won') {
      this.wonScreen.classList.remove('hidden');
      this.winScoreEl.textContent = score;
    } else {
      this.wonScreen.classList.add('hidden');
    }
  }

  updateStatus(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  shareScore() {
    const score = this.game.getScore();
    const messages = [
      `I fapped ${score} times in Fappy Bird! Can you beat my score?`,
      `Just scored ${score} in Fappy Bird! My hand is tired.`,
      `${score} faps! I'm basically a Fappy Bird pro now.`
    ];
    const text = messages[Math.floor(Math.random() * messages.length)];
    const url = window.location.href;

    if (navigator.share) {
      navigator.share({
        title: 'Fappy Bird',
        text: text,
        url: url
      }).catch(() => {
        this.copyToClipboard(`${text} ${url}`);
      });
    } else {
      this.copyToClipboard(`${text} ${url}`);
    }
  }

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Score copied to clipboard!');
    }).catch(() => {
      alert(`Share this: ${text}`);
    });
  }
}

// Start the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.fappyBird = new FappyBird();
});
