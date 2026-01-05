// Hand detection web worker
// Runs TensorFlow.js hand detection off the main thread

let detector = null;
let isReady = false;
let offscreenCanvas = null;
let offscreenCtx = null;

// Import TensorFlow.js in worker - use tfjs runtime (not mediapipe) for worker compatibility
importScripts(
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.17.0/dist/tf-core.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@4.17.0/dist/tf-converter.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.17.0/dist/tf-backend-webgl.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/hand-pose-detection@2.0.1/dist/hand-pose-detection.min.js'
);

async function initDetector(width, height) {
  try {
    // Create offscreen canvas for WebGL
    offscreenCanvas = new OffscreenCanvas(width, height);
    offscreenCtx = offscreenCanvas.getContext('2d');

    await tf.setBackend('webgl');
    await tf.ready();

    // Use 'tfjs' runtime which works in workers (not 'mediapipe')
    const model = handPoseDetection.SupportedModels.MediaPipeHands;
    detector = await handPoseDetection.createDetector(model, {
      runtime: 'tfjs',
      modelType: 'full',
      maxHands: 2
    });

    isReady = true;
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message });
  }
}

async function detectHands(imageBitmap) {
  if (!isReady || !detector) {
    return null;
  }

  try {
    // Draw to offscreen canvas
    offscreenCtx.drawImage(imageBitmap, 0, 0);
    imageBitmap.close();

    const hands = await detector.estimateHands(offscreenCanvas, {
      flipHorizontal: true
    });
    return hands;
  } catch (error) {
    console.error('Detection error:', error);
    return null;
  }
}

self.onmessage = async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'init':
      await initDetector(data.width, data.height);
      break;

    case 'detect':
      const hands = await detectHands(data.imageBitmap);
      self.postMessage({ type: 'result', hands, timestamp: data.timestamp });
      break;
  }
};
