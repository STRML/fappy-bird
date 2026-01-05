// Bird physics and rendering

export const GRAVITY = 0.4;
export const JUMP_VELOCITY = -8;
export const TERMINAL_VELOCITY = 10;

export class Bird {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.velocity = 0;
    this.rotation = 0;
    this.radius = 15;

    // Animation
    this.flapFrame = 0;
    this.flapTimer = 0;
    this.isFlapping = false;
  }

  update(speed = 1) {
    // Apply gravity (scaled by speed)
    this.velocity += GRAVITY * speed;
    this.velocity = Math.min(this.velocity, TERMINAL_VELOCITY);
    this.y += this.velocity * speed;

    // Rotate bird based on velocity (-30 to 90 degrees)
    const targetRotation = Math.min(Math.max(this.velocity * 4, -25), 90);
    this.rotation += (targetRotation - this.rotation) * 0.1;

    // Flap animation
    if (this.isFlapping) {
      this.flapTimer++;
      if (this.flapTimer > 3) {
        this.flapTimer = 0;
        this.flapFrame++;
        if (this.flapFrame > 2) {
          this.flapFrame = 0;
          this.isFlapping = false;
        }
      }
    }
  }

  jump() {
    this.velocity = JUMP_VELOCITY;
    this.isFlapping = true;
    this.flapFrame = 0;
    this.flapTimer = 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation * Math.PI / 180);

    // Body
    ctx.fillStyle = '#FFD93D';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.radius + 3, this.radius, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing
    ctx.fillStyle = '#FFC107';
    const wingOffset = this.flapFrame === 1 ? -8 : this.flapFrame === 2 ? -4 : 0;
    ctx.beginPath();
    ctx.ellipse(-2, 2 + wingOffset, 8, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eye (white)
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(8, -4, 7, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(10, -3, 3, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#E31937';
    ctx.beginPath();
    ctx.moveTo(12, 2);
    ctx.lineTo(22, 5);
    ctx.lineTo(12, 8);
    ctx.closePath();
    ctx.fill();

    // Blush (when jumping)
    if (this.isFlapping) {
      ctx.fillStyle = 'rgba(255, 150, 150, 0.6)';
      ctx.beginPath();
      ctx.arc(2, 6, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  getBounds() {
    return {
      left: this.x - this.radius,
      right: this.x + this.radius,
      top: this.y - this.radius,
      bottom: this.y + this.radius
    };
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.velocity = 0;
    this.rotation = 0;
    this.flapFrame = 0;
    this.isFlapping = false;
  }
}
