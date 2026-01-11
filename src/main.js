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
    this.losePhraseEl = document.getElementById('lose-phrase');

    // Random lose phrases
    this.losePhrases = [
      'You Fapped Out!',
      'Limp Finish!',
      'Premature Ending!',
      'Lost Your Grip!',
      'Hand Cramp!',
      'Fap Failure!',
      'Weak Stroke!',
      'Couldn\'t Keep It Up!',
      'Wrist Gave Out!',
      'Performance Issues!'
    ];

    // Set canvas size
    this.canvas.width = 600;
    this.canvas.height = 900;

    // Initialize systems
    this.game = new Game(this.canvas);
    this.handTracker = new HandTracker();
    this.motionDetector = new MotionDetector();
    this.inputManager = new InputManager();
    this.audio = new AudioManager();

    // State
    this.handTrackingEnabled = false;
    this.lastDetectionTime = 0;
    this.detectionInProgress = false;
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    this.detectionInterval = 33; // ~30fps for hand detection
    this.lastFrameTime = 0; // For delta time calculation

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

    document.getElementById('start-with-camera-btn').addEventListener('click', async () => {
      this.audio.resume();
      if (!this.handTrackingEnabled) {
        await this.initHandTracking();
      }
      this.startGame();
    });

    document.getElementById('retry-btn').addEventListener('click', () => {
      this.audio.resume();
      this.startGame();
    });

    document.getElementById('share-btn').addEventListener('click', () => {
      this.shareScore();
    });

    // Camera switch button (only shown on mobile)
    const switchCamBtn = document.getElementById('switch-cam-btn');
    if (switchCamBtn) {
      switchCamBtn.addEventListener('click', async () => {
        if (this.handTracker.canSwitchCamera()) {
          this.updateStatus('Switching camera...');
          await this.handTracker.switchCamera();
          this.updateStatus('Camera switched');
        }
      });
    }

    // Start game loop immediately (game works without camera)
    requestAnimationFrame(this.gameLoop);

    // Check if we already have camera permission and auto-enable if so
    this.checkExistingCameraPermission();
  }

  async checkExistingCameraPermission() {
    // Check if Permissions API is available
    if (!navigator.permissions || !navigator.permissions.query) {
      this.updateStatus('');
      return;
    }

    try {
      const result = await navigator.permissions.query({ name: 'camera' });
      if (result.state === 'granted') {
        // Already have permission, auto-init hand tracking
        this.initHandTracking();
      } else {
        this.updateStatus('');
      }
    } catch (e) {
      // Permissions API not supported for camera, fall back to manual
      this.updateStatus('');
    }
  }

  async initHandTracking() {
    this.updateStatus('Loading...');
    this.showLoadingOverlay(true);

    // Wait a bit for TensorFlow scripts to load
    await new Promise(r => setTimeout(r, 500));

    // Check if we're in a secure context (required for camera)
    if (!window.isSecureContext) {
      this.updateStatus('HTTPS required');
      this.showLoadingOverlay(false);
      console.warn('Camera requires HTTPS or localhost');
      return false;
    }

    this.updateStatus('Starting camera...');

    try {
      this.updateStatus('Loading AI model...');
      this.handTrackingEnabled = await this.handTracker.init(this.webcam, this.handCanvas);

      this.showLoadingOverlay(false);
      if (this.handTrackingEnabled) {
        this.updateStatus('Ready!');
        // Hide raw webcam - debug canvas shows video + skeleton
        this.webcam.style.display = 'none';
        document.getElementById('debug-overlay').style.display = 'block';
        // Show camera switch button on mobile
        const switchCamBtn = document.getElementById('switch-cam-btn');
        if (switchCamBtn && this.handTracker.canSwitchCamera()) {
          switchCamBtn.style.display = 'block';
        }
        return true;
      } else {
        this.updateStatus('Camera denied');
        this.webcam.style.display = 'none';
        document.getElementById('debug-overlay').style.display = 'none';
        return false;
      }
    } catch (error) {
      console.error('Hand tracking init error:', error);
      this.showLoadingOverlay(false);
      this.updateStatus('Camera error');
      this.webcam.style.display = 'none';
      return false;
    }
  }

  showLoadingOverlay(show) {
    let overlay = document.getElementById('loading-overlay');
    if (show) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';

        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';

        const text = document.createElement('div');
        text.className = 'loading-text';
        text.textContent = 'Loading hand tracking...';

        overlay.appendChild(spinner);
        overlay.appendChild(text);
        document.getElementById('game-container').appendChild(overlay);
      }
      overlay.style.display = 'flex';
    } else if (overlay) {
      overlay.style.display = 'none';
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
    this.updateUI();
  }

  async gameLoop(timestamp) {
    // Calculate delta time (capped at 50ms to prevent huge jumps on tab switch)
    const deltaTime = Math.min(timestamp - this.lastFrameTime, 50);
    this.lastFrameTime = timestamp;

    // Hand tracking (throttled, non-blocking)
    if (this.handTrackingEnabled && !this.detectionInProgress &&
        timestamp - this.lastDetectionTime > this.detectionInterval) {
      this.lastDetectionTime = timestamp;
      this.detectionInProgress = true;
      // Don't await - let detection run in background
      this.processHandTracking().finally(() => {
        this.detectionInProgress = false;
      });
    }

    // Update game with delta time
    const event = this.game.update(deltaTime);

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
      // Only set phrase once when first showing
      if (this.gameoverScreen.classList.contains('hidden')) {
        this.losePhraseEl.textContent = this.losePhrases[Math.floor(Math.random() * this.losePhrases.length)];
      }
      this.gameoverScreen.classList.remove('hidden');
      this.finalScoreEl.textContent = score;
    } else {
      this.gameoverScreen.classList.add('hidden');
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
