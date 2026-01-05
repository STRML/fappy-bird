#!/usr/bin/env node
// Node.js test runner for Fappy Bird

// Mock browser globals for Node.js
globalThis.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; }
};

import { Bird, TERMINAL_VELOCITY } from '../src/bird.js';
import { PipeManager, PIPE_WIDTH } from '../src/pipes.js';
import { MotionDetector } from '../src/motionDetection.js';
import { HandTracker } from '../src/handTracking.js';
import { Game } from '../src/game.js';

// Simple test framework
let passed = 0;
let failed = 0;
let currentSuite = '';

function describe(name, fn) {
  currentSuite = name;
  console.log(`\n${name}`);
  fn();
}

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${e.message}`);
  }
}

function assertTrue(val, msg) {
  if (!val) throw new Error(msg || `Expected truthy, got ${val}`);
}

function assertFalse(val, msg) {
  if (val) throw new Error(msg || `Expected falsy, got ${val}`);
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

// ========== BIRD TESTS ==========

describe('Bird - Initialization', () => {
  test('creates bird at specified position', () => {
    const bird = new Bird(100, 200);
    assertEqual(bird.x, 100);
    assertEqual(bird.y, 200);
  });

  test('initializes with zero velocity', () => {
    const bird = new Bird(100, 200);
    assertEqual(bird.velocity, 0);
  });

  test('has default radius', () => {
    const bird = new Bird(100, 200);
    assertTrue(bird.radius > 0);
  });
});

describe('Bird - Physics', () => {
  test('gravity increases velocity', () => {
    const bird = new Bird(100, 200);
    const initialVel = bird.velocity;
    bird.update();
    assertTrue(bird.velocity > initialVel);
  });

  test('jump sets negative velocity', () => {
    const bird = new Bird(100, 200);
    bird.jump();
    assertTrue(bird.velocity < 0);
  });

  test('position changes with velocity', () => {
    const bird = new Bird(100, 200);
    bird.velocity = 5;
    bird.update();
    assertTrue(bird.y > 200);
  });

  test('velocity is capped at terminal velocity', () => {
    const bird = new Bird(100, 200);
    bird.velocity = 100;
    bird.update();
    assertTrue(bird.velocity <= TERMINAL_VELOCITY);
  });

  test('reset restores initial state', () => {
    const bird = new Bird(100, 200);
    bird.velocity = 10;
    bird.y = 500;
    bird.reset(100, 200);
    assertEqual(bird.y, 200);
    assertEqual(bird.velocity, 0);
  });
});

// ========== PIPE TESTS ==========

describe('PipeManager - Initialization', () => {
  test('starts with no pipes', () => {
    const pm = new PipeManager(400, 600, 80);
    assertEqual(pm.pipes.length, 0);
  });

  test('stores dimensions', () => {
    const pm = new PipeManager(400, 600, 80);
    assertEqual(pm.canvasWidth, 400);
    assertEqual(pm.canvasHeight, 600);
  });
});

describe('PipeManager - Pipe Generation', () => {
  test('update adds pipes', () => {
    const pm = new PipeManager(400, 600, 80);
    for (let i = 0; i < 100; i++) pm.update();
    assertTrue(pm.pipes.length > 0);
  });

  test('pipes have gap', () => {
    const pm = new PipeManager(400, 600, 80);
    for (let i = 0; i < 100; i++) pm.update();
    const pipe = pm.pipes[0];
    assertTrue(pipe.gapTop > 0);
    assertTrue(pipe.gapBottom > pipe.gapTop);
  });

  test('reset clears pipes', () => {
    const pm = new PipeManager(400, 600, 80);
    for (let i = 0; i < 100; i++) pm.update();
    pm.reset();
    assertEqual(pm.pipes.length, 0);
  });
});

describe('PipeManager - Collision', () => {
  test('no collision when bird in gap', () => {
    const pm = new PipeManager(400, 600, 80);
    pm.pipes = [{ x: 80, gapTop: 200, gapBottom: 360 }];
    const bird = new Bird(80, 280); // In the middle of gap
    assertFalse(pm.checkCollision(bird));
  });

  test('collision when bird hits top pipe', () => {
    const pm = new PipeManager(400, 600, 80);
    pm.pipes = [{ x: 80, gapTop: 200, gapBottom: 360 }];
    const bird = new Bird(80, 100); // Above gap
    assertTrue(pm.checkCollision(bird));
  });

  test('collision when bird hits bottom pipe', () => {
    const pm = new PipeManager(400, 600, 80);
    pm.pipes = [{ x: 80, gapTop: 200, gapBottom: 360 }];
    const bird = new Bird(80, 450); // Below gap
    assertTrue(pm.checkCollision(bird));
  });
});

// ========== MOTION DETECTION TESTS ==========

describe('MotionDetector - Velocity', () => {
  test('velocity is 0 with no positions', () => {
    const md = new MotionDetector();
    assertEqual(md.getVelocity(), 0);
  });

  test('velocity is 0 with one position', () => {
    const md = new MotionDetector();
    md.addPosition(100);
    assertEqual(md.getVelocity(), 0);
  });

  test('detects downward motion', () => {
    const md = new MotionDetector();
    md.addPosition(100);
    md.addPosition(120);
    md.addPosition(140);
    md.getVelocity(); // Must call to update currentVelocity
    assertTrue(md.currentVelocity > 0);
  });

  test('detects upward motion', () => {
    const md = new MotionDetector();
    md.addPosition(200);
    md.addPosition(180);
    md.addPosition(160);
    md.getVelocity(); // Must call to update currentVelocity
    assertTrue(md.currentVelocity < 0);
  });
});

describe('MotionDetector - Jump Detection', () => {
  test('no jump on first update', () => {
    const md = new MotionDetector();
    assertFalse(md.update(100));
  });

  test('no jump on very slow motion', () => {
    const md = new MotionDetector();
    // Very gradual movement shouldn't trigger
    md.update(100);
    md.update(99.9);
    md.update(99.8);
    assertFalse(md.update(99.7));
  });

  test('no jump on downward motion', () => {
    const md = new MotionDetector();
    md.update(100);
    md.update(130);
    md.update(160);
    assertFalse(md.update(200));
  });

  test('handles null gracefully', () => {
    const md = new MotionDetector();
    md.update(100);
    assertFalse(md.update(null));
  });
});

describe('MotionDetector - State Machine', () => {
  test('initial state is idle', () => {
    const md = new MotionDetector();
    assertEqual(md.state, 'idle');
  });

  test('reset clears state', () => {
    const md = new MotionDetector();
    md.update(200);
    md.update(150);
    md.reset();
    assertEqual(md.state, 'idle');
    assertEqual(md.positions.length, 0);
  });
});

describe('MotionDetector - Smoothing', () => {
  test('smoothedY initialized on first position', () => {
    const md = new MotionDetector();
    md.addPosition(100);
    assertEqual(md.smoothedY, 100);
  });

  test('smoothedY applies exponential smoothing', () => {
    const md = new MotionDetector();
    md.addPosition(100);
    md.addPosition(200);
    assertEqual(md.smoothedY, 150); // 0.5 * 200 + 0.5 * 100
  });

  test('rawY tracks unsmoothed value', () => {
    const md = new MotionDetector();
    md.addPosition(100);
    md.addPosition(200);
    assertEqual(md.rawY, 200);
  });
});

// ========== HAND TRACKER TESTS ==========

describe('HandTracker - Initialization', () => {
  test('initializes with null detector', () => {
    const ht = new HandTracker();
    assertEqual(ht.detector, null);
  });

  test('initializes not ready', () => {
    const ht = new HandTracker();
    assertEqual(ht.isReady, false);
  });

  test('initializes hand histories', () => {
    const ht = new HandTracker();
    assertEqual(ht.handHistories.length, 2);
  });
});

describe('HandTracker - Hand Center', () => {
  test('calculates center from keypoints', () => {
    const ht = new HandTracker();
    const hand = {
      keypoints: Array(21).fill(null).map((_, i) => ({
        x: 100 + (i % 5) * 10,
        y: 100 + Math.floor(i / 5) * 10
      }))
    };
    const center = ht.getHandCenter(hand);
    assertTrue(center !== null);
    assertTrue('x' in center);
    assertTrue('y' in center);
  });

  test('returns null for empty keypoints', () => {
    const ht = new HandTracker();
    assertEqual(ht.getHandCenter({ keypoints: [] }), null);
  });
});

describe('HandTracker - Persistence', () => {
  test('initializes persistence state', () => {
    const ht = new HandTracker();
    assertEqual(ht.lostFrames, 0);
    assertEqual(ht.maxLostFrames, 8);
    assertEqual(ht.lastValidCenter, null);
    assertEqual(ht.lastValidHand, null);
  });

  test('persistence window is ~250ms at 30fps', () => {
    const ht = new HandTracker();
    const frameTime = 1000 / 30;
    const persistenceTime = ht.maxLostFrames * frameTime;
    assertTrue(persistenceTime >= 200);
    assertTrue(persistenceTime <= 300);
  });
});

// ========== GAME SPEED TESTS ==========

// Mock canvas for Game tests
const mockCanvas = {
  width: 400,
  height: 600,
  getContext: () => ({
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    fillRect: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    ellipse: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillStyle: '',
    strokeStyle: ''
  })
};

describe('Game - Speed Initialization', () => {
  test('starts at 50% speed', () => {
    const game = new Game(mockCanvas);
    assertEqual(game.speed, 0.5);
  });

  test('speedIncrement is 0.05', () => {
    const game = new Game(mockCanvas);
    assertEqual(game.speedIncrement, 0.05);
  });

  test('maxSpeed is 1.0', () => {
    const game = new Game(mockCanvas);
    assertEqual(game.maxSpeed, 1.0);
  });
});

describe('Game - Speed Ramping', () => {
  test('speed increases by 5% per pipe', () => {
    const game = new Game(mockCanvas);
    game.score = 1;
    game.updateSpeed();
    assertEqual(game.speed, 0.55); // 0.5 + 0.05 * 1
  });

  test('speed at score 5', () => {
    const game = new Game(mockCanvas);
    game.score = 5;
    game.updateSpeed();
    assertEqual(game.speed, 0.75); // 0.5 + 0.05 * 5
  });

  test('speed reaches 1.0 at score 10', () => {
    const game = new Game(mockCanvas);
    game.score = 10;
    game.updateSpeed();
    assertEqual(game.speed, 1.0); // 0.5 + 0.05 * 10
  });

  test('speed caps at 1.0 beyond score 10', () => {
    const game = new Game(mockCanvas);
    game.score = 20;
    game.updateSpeed();
    assertEqual(game.speed, 1.0); // capped
  });
});

describe('Game - Reset', () => {
  test('reset restores initial speed', () => {
    const game = new Game(mockCanvas);
    game.speed = 1.0;
    game.score = 10;
    game.reset();
    assertEqual(game.speed, 0.5);
  });
});

// ========== SUMMARY ==========

console.log('\n' + '='.repeat(40));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);
