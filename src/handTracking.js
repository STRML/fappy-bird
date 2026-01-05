// TensorFlow.js hand tracking integration

export class HandTracker {
  constructor() {
    this.detector = null;
    this.video = null;
    this.isReady = false;
    this.lastHand = null;
    this.debugCanvas = null;
    this.debugCtx = null;

    // Camera settings
    this.facingMode = 'user'; // 'user' = front, 'environment' = back
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Track hand positions to identify the moving hand
    this.handHistories = [[], []]; // History for up to 2 hands
    this.activeHandIndex = -1; // Which hand is the "pumping" hand
    this.historyLength = 10;

    // Persistence: keep tracking for a few frames when hand is lost
    this.lostFrames = 0;
    this.maxLostFrames = 8; // Continue using last position for up to 8 frames (~250ms at 30fps)
    this.lastValidCenter = null;
    this.lastValidHand = null;

    // Squirt detection: detect motion above the hand
    this.velocityHistory = [];
    this.maxVelocityHistory = 5;
    this.squirtDetected = false;
    this.previousFrame = null;
  }

  async init(videoElement, debugCanvas) {
    this.video = videoElement;
    this.debugCanvas = debugCanvas;
    this.debugCtx = debugCanvas?.getContext('2d');

    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia not supported');
        return false;
      }

      // Start camera
      await this.startCamera();

      // Set debug canvas size
      if (this.debugCanvas) {
        this.debugCanvas.width = 120;
        this.debugCanvas.height = 90;
      }

      // Check if handPoseDetection is available
      if (typeof handPoseDetection === 'undefined') {
        console.warn('handPoseDetection not loaded, using camera-only mode');
        this.isReady = false;
        return false;
      }

      // Initialize hand detector with mobile-optimized settings
      console.log('Initializing hand detector...');
      const model = handPoseDetection.SupportedModels.MediaPipeHands;
      this.detector = await handPoseDetection.createDetector(model, {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
        modelType: this.isMobile ? 'lite' : 'full', // Lite model for mobile performance
        maxHands: this.isMobile ? 1 : 2, // Single hand on mobile for speed
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      console.log('Hand detector ready');
      this.isReady = true;
      return true;
    } catch (error) {
      console.error('Hand tracking initialization failed:', error);
      return false;
    }
  }

  async startCamera() {
    // Stop existing stream if any
    if (this.video && this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }

    console.log(`Requesting camera access (${this.facingMode})...`);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: this.isMobile ? 480 : 640 },
        height: { ideal: this.isMobile ? 360 : 480 },
        facingMode: this.facingMode,
        frameRate: { ideal: 30 }
      },
      audio: false
    });

    console.log('Camera access granted');
    this.video.srcObject = stream;

    await new Promise((resolve, reject) => {
      this.video.onloadedmetadata = () => {
        this.video.play().then(resolve).catch(reject);
      };
      this.video.onerror = reject;
      setTimeout(() => reject(new Error('Video load timeout')), 5000);
    });

    console.log('Video playing');
  }

  async switchCamera() {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    try {
      await this.startCamera();
      return true;
    } catch (error) {
      console.error('Failed to switch camera:', error);
      // Revert to previous camera
      this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
      return false;
    }
  }

  canSwitchCamera() {
    return this.isMobile; // Only show switch on mobile where front/back matters
  }

  async detect() {
    if (!this.isReady || !this.detector || !this.video) {
      return null;
    }

    try {
      const hands = await this.detector.estimateHands(this.video, {
        flipHorizontal: true
      });

      if (hands.length === 0) {
        // Hand lost - use persistence
        this.lostFrames++;

        if (this.lostFrames <= this.maxLostFrames && this.lastValidHand) {
          // Continue using last known position
          this.lastHand = this.lastValidHand;
          this.lastHandCenter = this.lastValidCenter;
          this.drawDebug(this.lastValidHand, false); // Draw dimmed to show it's interpolated
          return this.lastValidHand;
        }

        // Truly lost - clear everything
        this.lastHand = null;
        this.lastHandCenter = null;
        this.clearDebug();
        return null;
      }

      // Hand found - reset lost counter
      this.lostFrames = 0;

      // Get center position for each hand (average of key points)
      // This works better for horizontal grips than just wrist
      const handPositions = hands.map(hand => this.getHandCenter(hand));

      // Update histories and find the most active (moving) hand
      this.updateHandHistories(handPositions);
      const activeHand = this.selectActiveHand(hands, handPositions);

      if (activeHand) {
        this.lastHand = activeHand.hand;
        this.lastHandCenter = activeHand.center;
        // Store as valid for persistence
        this.lastValidHand = activeHand.hand;
        this.lastValidCenter = activeHand.center;
        // Track velocity for squirt detection
        this.trackVelocity(activeHand.center);
        this.drawDebug(activeHand.hand, activeHand.isActive);
        return activeHand.hand;
      }

      return hands[0];
    } catch (error) {
      console.error('Detection error:', error);
      return null;
    }
  }

  // Get center of hand using multiple landmarks for stability
  getHandCenter(hand) {
    // Use wrist (0), index MCP (5), middle MCP (9), pinky MCP (17)
    // These form a stable base even for a horizontal fist
    const indices = [0, 5, 9, 13, 17];
    let sumX = 0, sumY = 0, count = 0;

    for (const i of indices) {
      if (hand.keypoints[i]) {
        sumX += hand.keypoints[i].x;
        sumY += hand.keypoints[i].y;
        count++;
      }
    }

    return count > 0 ? { x: sumX / count, y: sumY / count } : null;
  }

  updateHandHistories(positions) {
    // Simple tracking: assume hands stay in roughly same position
    for (let i = 0; i < positions.length && i < 2; i++) {
      if (positions[i]) {
        this.handHistories[i].push(positions[i].y);
        if (this.handHistories[i].length > this.historyLength) {
          this.handHistories[i].shift();
        }
      }
    }

    // Clear histories for hands not detected
    for (let i = positions.length; i < 2; i++) {
      this.handHistories[i] = [];
    }
  }

  selectActiveHand(hands, positions) {
    if (hands.length === 1) {
      return { hand: hands[0], center: positions[0], isActive: true };
    }

    // Calculate motion (variance) for each hand
    const motions = this.handHistories.map(history => {
      if (history.length < 3) return 0;
      const recent = history.slice(-5);
      const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recent.length;
      return variance;
    });

    // Pick the hand with more motion (the pumping hand)
    const activeIndex = motions[0] >= motions[1] ? 0 : 1;

    // Only switch if the difference is significant
    if (this.activeHandIndex === -1 || motions[activeIndex] > motions[1 - activeIndex] * 1.5) {
      this.activeHandIndex = activeIndex;
    }

    const idx = Math.min(this.activeHandIndex, hands.length - 1);
    return {
      hand: hands[idx],
      center: positions[idx],
      isActive: true
    };
  }

  getWristPosition() {
    // Return center position instead of just wrist for better horizontal hand tracking
    if (this.lastHandCenter) {
      return this.lastHandCenter;
    }
    if (!this.lastHand) return null;
    return this.getHandCenter(this.lastHand);
  }

  // Track velocity for squirt detection
  trackVelocity(center) {
    if (!center) return;

    if (this.velocityHistory.length > 0) {
      const last = this.velocityHistory[this.velocityHistory.length - 1];
      const velocity = last.y - center.y; // Positive = moving up
      this.velocityHistory.push({ y: center.y, velocity, time: performance.now() });
    } else {
      this.velocityHistory.push({ y: center.y, velocity: 0, time: performance.now() });
    }

    if (this.velocityHistory.length > this.maxVelocityHistory) {
      this.velocityHistory.shift();
    }
  }

  // Check if squirt gesture detected (hand shoots up rapidly and exits frame)
  checkSquirt() {
    if (this.squirtDetected) return true;

    // Need velocity history
    if (this.velocityHistory.length < 3) return false;

    // Check if hand was moving very fast upward recently
    const recentVelocities = this.velocityHistory.slice(-3);
    const avgVelocity = recentVelocities.reduce((sum, v) => sum + v.velocity, 0) / recentVelocities.length;

    // Check if hand is near top of frame or just disappeared while moving fast up
    const lastY = this.velocityHistory[this.velocityHistory.length - 1].y;
    const nearTop = lastY < 50; // Near top of frame
    const movingFastUp = avgVelocity > 15; // Fast upward motion

    // Squirt = hand was moving fast up AND (near top OR hand lost)
    if (movingFastUp && (nearTop || (this.lostFrames > 0 && this.lostFrames < 5))) {
      this.squirtDetected = true;
      return true;
    }

    return false;
  }

  resetSquirt() {
    this.squirtDetected = false;
    this.velocityHistory = [];
  }

  drawDebug(hand, isActive = true) {
    if (!this.debugCtx || !this.debugCanvas) return;

    const ctx = this.debugCtx;
    const scaleX = this.debugCanvas.width / this.video.videoWidth;
    const scaleY = this.debugCanvas.height / this.video.videoHeight;

    // Clear
    ctx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);

    // Draw video frame (mirrored to match selfie view)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(
      this.video,
      -this.debugCanvas.width, 0,
      this.debugCanvas.width, this.debugCanvas.height
    );
    ctx.restore();

    // Draw hand landmarks
    // Note: flipHorizontal:true in detection means keypoints are already mirrored
    // We need to flip x again to match our mirrored video display
    const color = isActive ? '#00ff00' : '#666666';
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (const point of hand.keypoints) {
      // Keypoints from detection with flipHorizontal need to be re-flipped for mirrored canvas
      const x = point.x * scaleX;
      const y = point.y * scaleY;

      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // index
      [0, 9], [9, 10], [10, 11], [11, 12], // middle
      [0, 13], [13, 14], [14, 15], [15, 16], // ring
      [0, 17], [17, 18], [18, 19], [19, 20], // pinky
      [5, 9], [9, 13], [13, 17] // palm
    ];

    for (const [i, j] of connections) {
      const p1 = hand.keypoints[i];
      const p2 = hand.keypoints[j];
      const x1 = p1.x * scaleX;
      const y1 = p1.y * scaleY;
      const x2 = p2.x * scaleX;
      const y2 = p2.y * scaleY;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Draw tracked center point (yellow crosshair)
    const center = this.getHandCenter(hand);
    if (center && isActive) {
      const cx = center.x * scaleX;
      const cy = center.y * scaleY;

      ctx.strokeStyle = '#FFD93D';
      ctx.lineWidth = 2;

      // Circle
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshair
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy);
      ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx, cy + 12);
      ctx.stroke();
    }
  }

  clearDebug() {
    if (!this.debugCtx || !this.debugCanvas) return;

    const ctx = this.debugCtx;
    ctx.clearRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);

    // Draw video frame only
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(
      this.video,
      -this.debugCanvas.width, 0,
      this.debugCanvas.width, this.debugCanvas.height
    );
    ctx.restore();

    // "No hand" indicator
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.fillRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);
  }

  destroy() {
    if (this.video && this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
    this.isReady = false;
  }
}
