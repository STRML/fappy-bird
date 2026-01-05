// Unit tests for Bird class

import { Bird, GRAVITY, JUMP_VELOCITY, TERMINAL_VELOCITY } from '../src/bird.js';
import { TestRunner, assertEqual, assertApprox, assertTrue } from './test-runner.js';

const runner = new TestRunner();

runner.describe('Bird Physics', () => {

  runner.test('initial position is set correctly', () => {
    const bird = new Bird(100, 200);
    assertEqual(bird.x, 100, 'x position');
    assertEqual(bird.y, 200, 'y position');
    assertEqual(bird.velocity, 0, 'initial velocity');
  });

  runner.test('gravity increases velocity each update', () => {
    const bird = new Bird(100, 200);
    bird.update();
    assertApprox(bird.velocity, GRAVITY, 0.01, 'velocity after 1 update');
    bird.update();
    assertApprox(bird.velocity, GRAVITY * 2, 0.01, 'velocity after 2 updates');
  });

  runner.test('bird falls due to gravity', () => {
    const bird = new Bird(100, 200);
    const initialY = bird.y;
    bird.update();
    assertTrue(bird.y > initialY, 'bird should fall (y increases)');
  });

  runner.test('velocity is capped at terminal velocity', () => {
    const bird = new Bird(100, 200);
    // Simulate many updates to reach terminal velocity
    for (let i = 0; i < 100; i++) {
      bird.update();
    }
    assertTrue(bird.velocity <= TERMINAL_VELOCITY,
      `velocity ${bird.velocity} should not exceed ${TERMINAL_VELOCITY}`);
  });

  runner.test('jump sets negative velocity', () => {
    const bird = new Bird(100, 200);
    bird.jump();
    assertEqual(bird.velocity, JUMP_VELOCITY, 'velocity after jump');
    assertTrue(bird.velocity < 0, 'jump velocity should be negative (upward)');
  });

  runner.test('bird moves up after jump', () => {
    const bird = new Bird(100, 300);
    bird.jump();
    const yAfterJump = bird.y;
    bird.update();
    assertTrue(bird.y < yAfterJump, 'bird should move up after jump');
  });

  runner.test('jump cancels falling velocity', () => {
    const bird = new Bird(100, 200);
    // Build up some falling velocity
    for (let i = 0; i < 10; i++) {
      bird.update();
    }
    assertTrue(bird.velocity > 0, 'should be falling');
    bird.jump();
    assertEqual(bird.velocity, JUMP_VELOCITY, 'jump resets velocity');
  });

  runner.test('rotation increases when falling', () => {
    const bird = new Bird(100, 200);
    for (let i = 0; i < 20; i++) {
      bird.update();
    }
    assertTrue(bird.rotation > 0, 'rotation should be positive when falling');
  });

  runner.test('rotation decreases (goes negative) when jumping', () => {
    const bird = new Bird(100, 200);
    bird.jump();
    bird.update();
    assertTrue(bird.rotation < 0, 'rotation should be negative after jump');
  });

  runner.test('getBounds returns correct bounding box', () => {
    const bird = new Bird(100, 200);
    const bounds = bird.getBounds();
    assertEqual(bounds.left, 100 - bird.radius, 'left bound');
    assertEqual(bounds.right, 100 + bird.radius, 'right bound');
    assertEqual(bounds.top, 200 - bird.radius, 'top bound');
    assertEqual(bounds.bottom, 200 + bird.radius, 'bottom bound');
  });

  runner.test('reset restores initial state', () => {
    const bird = new Bird(100, 200);
    bird.jump();
    for (let i = 0; i < 10; i++) bird.update();
    bird.reset(50, 100);
    assertEqual(bird.x, 50, 'reset x');
    assertEqual(bird.y, 100, 'reset y');
    assertEqual(bird.velocity, 0, 'reset velocity');
    assertEqual(bird.rotation, 0, 'reset rotation');
  });

});

export { runner };
