// Motion detection and jump conversion

export class MotionDetector {
  constructor() {
    // Position tracking with smoothing
    this.positions = [];
    this.maxPositions = 10;
    this.smoothedY = null;
    this.smoothingFactor = 0.4; // Lower = smoother but more lag

    // Jump detection parameters
    this.jumpThreshold = 10; // Minimum upward velocity to trigger jump
    this.cooldownFrames = 10; // Frames between jumps
    this.cooldownTimer = 0;

    // State machine
    this.state = 'idle'; // 'idle' | 'moving_up' | 'cooldown'
    this.upwardFrames = 0;
    this.requiredUpwardFrames = 2;

    // Peak detection
    this.peakVelocity = 0;
    this.velocityHistory = [];
    this.maxVelocityHistory = 5;

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

    // Use weighted average with more recent samples weighted higher
    const recent = this.positions.slice(-4);
    let totalVelocity = 0;
    let totalWeight = 0;

    for (let i = 1; i < recent.length; i++) {
      const dy = recent[i].y - recent[i - 1].y;
      const dt = recent[i].time - recent[i - 1].time;
      // Normalize to ~60fps (16.67ms per frame)
      const normalizedVelocity = (dy / Math.max(dt, 1)) * 16.67;
      // Weight recent samples more heavily
      const weight = i;
      totalVelocity += normalizedVelocity * weight;
      totalWeight += weight;
    }

    const avgVelocity = totalWeight > 0 ? totalVelocity / totalWeight : 0;
    this.currentVelocity = avgVelocity;

    // Track velocity history for peak detection
    this.velocityHistory.push(avgVelocity);
    if (this.velocityHistory.length > this.maxVelocityHistory) {
      this.velocityHistory.shift();
    }

    return avgVelocity;
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

    // State machine for debounced jump detection
    switch (this.state) {
      case 'idle':
        // Check for start of upward motion (negative velocity = moving up on screen)
        if (velocity < -5) {
          this.state = 'moving_up';
          this.upwardFrames = 1;
        }
        break;

      case 'moving_up':
        if (velocity < -5) {
          this.upwardFrames++;

          // Trigger jump after consistent upward motion
          if (this.upwardFrames >= this.requiredUpwardFrames &&
              velocity < -this.jumpThreshold &&
              this.cooldownTimer === 0) {
            this.state = 'cooldown';
            this.cooldownTimer = this.cooldownFrames;
            return true; // JUMP!
          }
        } else {
          // Motion stopped or reversed
          this.state = 'idle';
          this.upwardFrames = 0;
        }
        break;

      case 'cooldown':
        // Wait for hand to move back down before next jump
        if (velocity > 3) {
          this.state = 'idle';
          this.upwardFrames = 0;
        }
        break;
    }

    return false;
  }

  reset() {
    this.positions = [];
    this.smoothedY = null;
    this.velocityHistory = [];
    this.peakVelocity = 0;
    this.state = 'idle';
    this.upwardFrames = 0;
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
