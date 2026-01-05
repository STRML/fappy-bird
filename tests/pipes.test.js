// Unit tests for PipeManager and collision detection

import { PipeManager, PIPE_GAP, PIPE_WIDTH, PIPE_SPEED } from '../src/pipes.js';
import { Bird } from '../src/bird.js';
import { TestRunner, assertEqual, assertTrue, assertFalse } from './test-runner.js';

const runner = new TestRunner();

runner.describe('Pipe Generation', () => {

  runner.test('starts with no pipes', () => {
    const pipes = new PipeManager(400, 600, 80);
    assertEqual(pipes.pipes.length, 0, 'should start empty');
  });

  runner.test('spawns pipe with correct structure', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.spawnPipe();
    assertEqual(pipes.pipes.length, 1, 'should have 1 pipe');

    const pipe = pipes.pipes[0];
    assertEqual(pipe.x, 400, 'pipe starts at canvas width');
    assertTrue(pipe.gapTop > 0, 'gapTop should be positive');
    assertTrue(pipe.gapBottom > pipe.gapTop, 'gapBottom should be below gapTop');
    assertEqual(pipe.gapBottom - pipe.gapTop, PIPE_GAP, 'gap size should match PIPE_GAP');
    assertFalse(pipe.scored, 'should not be scored initially');
  });

  runner.test('gap is within playable bounds', () => {
    const pipes = new PipeManager(400, 600, 80);
    // Spawn many pipes to test randomization
    for (let i = 0; i < 100; i++) {
      pipes.spawnPipe();
    }

    for (const pipe of pipes.pipes) {
      assertTrue(pipe.gapTop >= 80, 'gap should not be too high');
      assertTrue(pipe.gapBottom <= 600 - 80 - 80, 'gap should not be too low');
    }
  });

  runner.test('pipes move left on update', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.spawnPipe();
    const initialX = pipes.pipes[0].x;
    pipes.update();
    assertEqual(pipes.pipes[0].x, initialX - PIPE_SPEED, 'pipe should move left');
  });

  runner.test('off-screen pipes are removed', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.spawnPipe();
    pipes.pipes[0].x = -PIPE_WIDTH - 1; // Move off screen
    pipes.update();
    assertEqual(pipes.pipes.length, 0, 'off-screen pipe should be removed');
  });

  runner.test('reset clears all pipes', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.spawnPipe();
    pipes.spawnPipe();
    pipes.reset();
    assertEqual(pipes.pipes.length, 0, 'reset should clear pipes');
  });

});

runner.describe('Collision Detection', () => {

  runner.test('no collision when bird is in gap', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.pipes.push({
      x: 75,
      gapTop: 200,
      gapBottom: 200 + PIPE_GAP,
      scored: false
    });

    // Bird in the middle of the gap
    const bird = new Bird(100, 200 + PIPE_GAP / 2);
    assertFalse(pipes.checkCollision(bird), 'should not collide when in gap');
  });

  runner.test('collision when bird hits top pipe', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.pipes.push({
      x: 75,
      gapTop: 200,
      gapBottom: 200 + PIPE_GAP,
      scored: false
    });

    // Bird above the gap
    const bird = new Bird(100, 100);
    assertTrue(pipes.checkCollision(bird), 'should collide with top pipe');
  });

  runner.test('collision when bird hits bottom pipe', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.pipes.push({
      x: 75,
      gapTop: 200,
      gapBottom: 200 + PIPE_GAP,
      scored: false
    });

    // Bird below the gap
    const bird = new Bird(100, 400);
    assertTrue(pipes.checkCollision(bird), 'should collide with bottom pipe');
  });

  runner.test('no collision when bird is before pipe', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.pipes.push({
      x: 200,
      gapTop: 200,
      gapBottom: 200 + PIPE_GAP,
      scored: false
    });

    // Bird before the pipe
    const bird = new Bird(50, 100); // Would hit pipe if aligned
    assertFalse(pipes.checkCollision(bird), 'should not collide when before pipe');
  });

  runner.test('no collision when bird is past pipe', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.pipes.push({
      x: 50,
      gapTop: 200,
      gapBottom: 200 + PIPE_GAP,
      scored: false
    });

    // Bird after the pipe
    const bird = new Bird(200, 100); // Would hit pipe if aligned
    assertFalse(pipes.checkCollision(bird), 'should not collide when past pipe');
  });

});

runner.describe('Scoring', () => {

  runner.test('score when bird passes pipe', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.pipes.push({
      x: 50,
      gapTop: 200,
      gapBottom: 200 + PIPE_GAP,
      scored: false
    });

    const bird = new Bird(50 + PIPE_WIDTH + 10, 250);
    const scored = pipes.checkScore(bird);
    assertTrue(scored, 'should score when passing pipe');
    assertTrue(pipes.pipes[0].scored, 'pipe should be marked as scored');
  });

  runner.test('no double scoring', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.pipes.push({
      x: 50,
      gapTop: 200,
      gapBottom: 200 + PIPE_GAP,
      scored: false
    });

    const bird = new Bird(50 + PIPE_WIDTH + 10, 250);
    pipes.checkScore(bird); // First score
    const scoredAgain = pipes.checkScore(bird);
    assertFalse(scoredAgain, 'should not score twice for same pipe');
  });

  runner.test('no score when bird has not passed pipe', () => {
    const pipes = new PipeManager(400, 600, 80);
    pipes.pipes.push({
      x: 200,
      gapTop: 200,
      gapBottom: 200 + PIPE_GAP,
      scored: false
    });

    const bird = new Bird(100, 250);
    const scored = pipes.checkScore(bird);
    assertFalse(scored, 'should not score when bird has not passed');
  });

});

export { runner };
