// Pipe generation and management

export const PIPE_GAP_START = 200;
export const PIPE_GAP_MIN = 160;
export const PIPE_WIDTH = 60;
export const PIPE_SPEED = 2.5;
export const PIPE_SPACING = 220;

export class PipeManager {
  constructor(canvasWidth, canvasHeight, groundHeight) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.groundHeight = groundHeight;
    this.pipes = [];
    this.spawnTimer = 0;
    this.spawnInterval = PIPE_SPACING / PIPE_SPEED;
  }

  update(speed = 1, gap = PIPE_GAP_MIN) {
    // Move all pipes left (scaled by speed)
    for (const pipe of this.pipes) {
      pipe.x -= PIPE_SPEED * speed;
    }

    // Remove off-screen pipes
    this.pipes = this.pipes.filter(pipe => pipe.x > -PIPE_WIDTH);

    // Spawn new pipes (scaled by speed)
    this.spawnTimer += speed;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnPipe(gap);
      this.spawnTimer = 0;
    }
  }

  spawnPipe(gap = PIPE_GAP_MIN) {
    const playableHeight = this.canvasHeight - this.groundHeight;
    const minY = 80;
    const maxY = playableHeight - gap - 80;
    const gapY = Math.random() * (maxY - minY) + minY;

    this.pipes.push({
      x: this.canvasWidth,
      gapTop: gapY,
      gapBottom: gapY + gap,
      scored: false
    });
  }

  draw(ctx) {
    for (const pipe of this.pipes) {
      this.drawPipe(ctx, pipe);
    }
  }

  drawPipe(ctx, pipe) {
    const capHeight = 25;
    const capOverhang = 6;

    // Pipe gradient
    const gradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0);
    gradient.addColorStop(0, '#2E8B57');
    gradient.addColorStop(0.3, '#3CB371');
    gradient.addColorStop(0.7, '#3CB371');
    gradient.addColorStop(1, '#228B22');

    // Top pipe body
    ctx.fillStyle = gradient;
    ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.gapTop - capHeight);

    // Top pipe cap
    ctx.fillStyle = '#2E8B57';
    ctx.fillRect(
      pipe.x - capOverhang,
      pipe.gapTop - capHeight,
      PIPE_WIDTH + capOverhang * 2,
      capHeight
    );

    // Top cap highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(
      pipe.x - capOverhang,
      pipe.gapTop - capHeight,
      PIPE_WIDTH + capOverhang * 2,
      5
    );

    // Bottom pipe body
    const bottomY = pipe.gapBottom + capHeight;
    ctx.fillStyle = gradient;
    ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, this.canvasHeight - bottomY);

    // Bottom pipe cap
    ctx.fillStyle = '#2E8B57';
    ctx.fillRect(
      pipe.x - capOverhang,
      pipe.gapBottom,
      PIPE_WIDTH + capOverhang * 2,
      capHeight
    );

    // Bottom cap highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(
      pipe.x - capOverhang,
      pipe.gapBottom,
      PIPE_WIDTH + capOverhang * 2,
      5
    );

    // Pipe body highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(pipe.x + 5, 0, 8, pipe.gapTop - capHeight);
    ctx.fillRect(pipe.x + 5, bottomY, 8, this.canvasHeight - bottomY);
  }

  checkCollision(bird) {
    const bounds = bird.getBounds();

    for (const pipe of this.pipes) {
      // Check if bird is horizontally within pipe
      if (bounds.right > pipe.x && bounds.left < pipe.x + PIPE_WIDTH) {
        // Check if bird is NOT in the gap
        if (bounds.top < pipe.gapTop || bounds.bottom > pipe.gapBottom) {
          return true;
        }
      }
    }

    return false;
  }

  checkScore(bird) {
    let scored = false;

    for (const pipe of this.pipes) {
      if (!pipe.scored && bird.x > pipe.x + PIPE_WIDTH) {
        pipe.scored = true;
        scored = true;
      }
    }

    return scored;
  }

  reset() {
    this.pipes = [];
    this.spawnTimer = 0;
  }
}
