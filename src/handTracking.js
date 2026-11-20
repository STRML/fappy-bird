// TensorFlow.js hand tracking integration

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [0, 9], [9, 10], [10, 11], [11, 12], // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17] // palm
];

export class HandTracker {
  constructor() {
    this.detector = null;
    this.worker = null;
    this.useWorker = true; // Try worker first, fall back to main thread
    this.video = null;
    this.isReady = false;
    this.lastHand = null;
    this.debugCanvas = null;
    this.debugCtx = null;

    // Camera settings
    this.facingMode = 'user'; // 'user' = front, 'environment' = back
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // One frame in flight to the worker. The timeout is a liveness check for a
    // lost reply, set well above the slowest phone's inference time.
    this.inFlight = null;
    this.frameTimeoutMs = 5000;
    this.nextFrameId = 0;

    // Track hand positions to identify the moving hand
    this.handHistories = [[], []]; // History for up to 2 hands
    this.activeHandIndex = -1; // Which hand is the "pumping" hand
    this.historyLength = 10;

    // Persistence: keep tracking for a few frames when hand is lost
    this.lostFrames = 0;
    this.maxLostFrames = 8; // Continue using last position for up to 8 frames (~250ms at 30fps)
    this.lastValidCenter = null;
    this.lastValidHand = null;

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

      // Try to use worker for better performance
      if (this.useWorker) {
        try {
          console.log('Initializing hand detector in worker...');
          await this.initWorker();
          console.log('Worker-based hand detector ready');
          this.isReady = true;
          return true;
        } catch (error) {
          console.warn('Worker init failed, falling back to main thread:', error);
          this.useWorker = false;
        }
      }

      // Fallback: main thread detection
      if (typeof handPoseDetection === 'undefined') {
        console.warn('handPoseDetection not loaded, using camera-only mode');
        this.isReady = false;
        return false;
      }

      console.log('Initializing hand detector on main thread...');
      const model = handPoseDetection.SupportedModels.MediaPipeHands;
      this.detector = await handPoseDetection.createDetector(model, {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
        modelType: 'full',
        maxHands: 2,
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

  async initWorker() {
    return new Promise((resolve, reject) => {
      this.worker = new Worker('src/handWorker.js');

      const timeout = setTimeout(() => {
        reject(new Error('Worker init timeout'));
      }, 30000); // 30s timeout for model loading

      this.worker.onmessage = (e) => {
        const { type, hands, error, frameId } = e.data;

        if (type === 'ready') {
          clearTimeout(timeout);
          resolve();
        } else if (type === 'error') {
          clearTimeout(timeout);
          reject(new Error(error));
        } else if (type === 'result') {
          this.onWorkerResult(hands, frameId);
        }
      };

      this.worker.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
        this.onWorkerError(error);
      };

      // Initialize worker with video dimensions
      this.worker.postMessage({
        type: 'init',
        data: {
          width: this.video.videoWidth || 640,
          height: this.video.videoHeight || 480
        }
      });
    });
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
        width: { ideal: 640 },
        height: { ideal: 480 },
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

  detectWithWorker() {
    if (this.inFlight) {
      return this.inFlight.promise;
    }

    let resolve;
    const promise = new Promise(r => { resolve = r; });
    const frameId = ++this.nextFrameId;
    const timer = setTimeout(() => this.settleInFlight(frameId), this.frameTimeoutMs);
    this.inFlight = { promise, resolve, frameId, timer };
    this.postFrame(frameId);
    return promise;
  }

  async postFrame(frameId) {
    let imageBitmap = null;
    try {
      imageBitmap = await createImageBitmap(this.video);
      if (this.inFlight?.frameId !== frameId) {
        imageBitmap.close();
        return;
      }
      this.worker.postMessage({
        type: 'detect',
        data: { imageBitmap, frameId }
      }, [imageBitmap]);
    } catch (error) {
      console.error('Worker detection error:', error);
      imageBitmap?.close();
      this.settleInFlight(frameId);
    }
  }

  // A late reply to a timed-out frame still carries a real detection, so use it,
  // but only the reply to the current frame frees the slot.
  onWorkerResult(hands, frameId) {
    this.processHandResult(hands || []);
    this.settleInFlight(frameId);
  }

  onWorkerError(error) {
    console.error('Hand worker error:', error);
    this.settleInFlight(this.inFlight?.frameId);
  }

  settleInFlight(frameId) {
    if (!this.inFlight || this.inFlight.frameId !== frameId) return;
    clearTimeout(this.inFlight.timer);
    this.inFlight.resolve(this.lastHand);
    this.inFlight = null;
  }

  // Process hands array and update internal state
  processHandResult(hands) {
    if (hands.length === 0) {
      this.lostFrames++;
      if (this.lostFrames <= this.maxLostFrames && this.lastValidHand) {
        this.lastHand = this.lastValidHand;
        this.lastHandCenter = this.lastValidCenter;
        return this.lastValidHand;
      }
      this.lastHand = null;
      this.lastHandCenter = null;
      return null;
    }

    this.lostFrames = 0;
    const handPositions = hands.map(hand => this.getHandCenter(hand));
    this.updateHandHistories(handPositions);
    const activeHand = this.selectActiveHand(hands, handPositions);

    if (activeHand) {
      this.lastHand = activeHand.hand;
      this.lastHandCenter = activeHand.center;
      this.lastValidHand = activeHand.hand;
      this.lastValidCenter = activeHand.center;
      return activeHand.hand;
    }

    return hands[0];
  }

  async detect() {
    if (!this.isReady || !this.video) {
      return null;
    }

    // Worker-based detection
    if (this.useWorker && this.worker) {
      return this.detectWithWorker();
    }

    // Main thread detection (fallback)
    if (!this.detector) {
      return null;
    }

    try {
      const hands = await this.detector.estimateHands(this.video, {
        flipHorizontal: true
      });
      return this.processHandResult(hands);
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

  // Called every animation frame so the camera preview stays live
  // no matter how slowly detection results arrive.
  renderPreview() {
    if (!this.debugCtx || !this.isReady || !this.video?.videoWidth) return;

    this.drawVideoFrame();
    if (!this.lastHand) {
      this.drawNoHand();
      return;
    }
    if (this.isMobile) {
      this.drawCenterDot(this.lastHand);
      return;
    }
    this.drawSkeleton(this.lastHand, this.lostFrames === 0);
  }

  drawVideoFrame() {
    const ctx = this.debugCtx;
    const { width, height } = this.debugCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    if (this.facingMode === 'user') {
      ctx.scale(-1, 1);
      ctx.drawImage(this.video, -width, 0, width, height);
    } else {
      ctx.drawImage(this.video, 0, 0, width, height);
    }
    ctx.restore();
  }

  drawNoHand() {
    this.debugCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    this.debugCtx.fillRect(0, 0, this.debugCanvas.width, this.debugCanvas.height);
  }

  // Keypoints come back pre-flipped (flipHorizontal: true). The front-camera
  // preview is mirrored to match; the rear-camera preview is not, so flip back.
  toPreview(point) {
    const x = point.x * this.debugCanvas.width / this.video.videoWidth;
    const y = point.y * this.debugCanvas.height / this.video.videoHeight;
    return { x: this.facingMode === 'user' ? x : this.debugCanvas.width - x, y };
  }

  drawCenterDot(hand) {
    const center = this.getHandCenter(hand);
    if (!center) return;
    const { x, y } = this.toPreview(center);
    const ctx = this.debugCtx;
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSkeleton(hand, isActive) {
    const ctx = this.debugCtx;
    const color = isActive ? '#00ff00' : '#666666';
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    const points = hand.keypoints.map(p => this.toPreview(p));
    for (const { x, y } of points) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const [i, j] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[j].x, points[j].y);
      ctx.stroke();
    }

    const center = this.getHandCenter(hand);
    if (center && isActive) {
      this.drawCrosshair(this.toPreview(center));
    }
  }

  drawCrosshair({ x, y }) {
    const ctx = this.debugCtx;
    ctx.strokeStyle = '#FFD93D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y + 12);
    ctx.stroke();
  }

  destroy() {
    if (this.video && this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
    this.settleInFlight(this.inFlight?.frameId);
    this.isReady = false;
  }
}
