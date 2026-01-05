// Motion detection and jump conversion

export class MotionDetector {
  constructor() {
    // Position tracking with smoothing
    this.positions = [];
    this.maxPositions = 10;
    this.smoothedY = null;
    this.smoothingFactor = 0.5; // Higher = more responsive

    // Jump detection parameters
    this.jumpThreshold = 8; // Minimum upward velocity to trigger jump
    this.cooldownFrames = 8; // Frames between jumps
    this.cooldownTimer = 0;

    // State machine
    this.state = 'idle'; // 'idle' | 'cooldown'
    this.lastVelocity = 0;

    // Stats for debug
    this.currentVelocity = 0;
    this.rawY = 0;
  }

  addPosition(y) {
    const now = performance.now();

    // Apply exponential smoothing to reduce jitter
    if (this.smoothedY === null) {
      this.smoothedY = y;
    } else {
      this.smoothedY = this.smoothingFactor * y + (1 - this.smoothingFactor) * this.smoothedY;
    }

    this.rawY = y;
    this.positions.push({ y: this.smoothedY, time: now });

    if (this.positions.length > this.maxPositions) {
      this.positions.shift();
    }
  }

  getVelocity() {
    if (this.positions.length < 2) return 0;

    // Use only the most recent 2 positions for instant response
    const len = this.positions.length;
    const curr = this.positions[len - 1];
    const prev = this.positions[len - 2];

    const dy = curr.y - prev.y;
    const dt = curr.time - prev.time;
    // Normalize to ~60fps (16.67ms per frame)
    const velocity = (dy / Math.max(dt, 1)) * 16.67;

    this.currentVelocity = velocity;
    return velocity;
  }

  update(y) {
    if (y === null || y === undefined) {
      // No hand detected - don't reset, allow brief occlusions
      return false;
    }

    this.addPosition(y);
    const velocity = this.getVelocity();

    // Handle cooldown
    if (this.cooldownTimer > 0) {
      this.cooldownTimer--;
    }

    // Detect sharp upward motion onset
    // Trigger when: velocity crosses threshold AND we're accelerating upward
    const isMovingUp = velocity < -this.jumpThreshold;
    const justStartedUp = this.lastVelocity > -this.jumpThreshold && isMovingUp;

    this.lastVelocity = velocity;

    if (this.state === 'idle') {
      // Trigger immediately on sharp upward motion start
      if (isMovingUp && this.cooldownTimer === 0) {
        this.state = 'cooldown';
        this.cooldownTimer = this.cooldownFrames;
        return true; // JUMP!
      }
    } else if (this.state === 'cooldown') {
      // Wait for hand to stop or move down before allowing next jump
      if (velocity > 0) {
        this.state = 'idle';
      }
    }

    return false;
  }

  reset() {
    this.positions = [];
    this.smoothedY = null;
    this.state = 'idle';
    this.lastVelocity = 0;
    this.cooldownTimer = 0;
    this.currentVelocity = 0;
  }

  getDebugInfo() {
    return {
      velocity: this.currentVelocity,
      state: this.state,
      cooldown: this.cooldownTimer,
      positions: this.positions.length,
      smoothedY: this.smoothedY,
      rawY: this.rawY
    };
  }
}
