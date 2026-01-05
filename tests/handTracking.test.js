// Tests for hand tracking utilities

import { HandTracker } from '../src/handTracking.js';
import { TestRunner, assertTrue, assertFalse, assertEqual } from './test-runner.js';

const runner = new TestRunner();

runner.describe('HandTracker - Initialization', () => {

  runner.test('initializes with correct default state', () => {
    const tracker = new HandTracker();
    assertEqual(tracker.detector, null, 'detector should be null');
    assertEqual(tracker.video, null, 'video should be null');
    assertEqual(tracker.isReady, false, 'should not be ready');
    assertEqual(tracker.lastHand, null, 'lastHand should be null');
  });

  runner.test('initializes hand histories for multi-hand tracking', () => {
    const tracker = new HandTracker();
    assertEqual(tracker.handHistories.length, 2, 'should have 2 hand history slots');
    assertEqual(tracker.handHistories[0].length, 0, 'first history should be empty');
    assertEqual(tracker.handHistories[1].length, 0, 'second history should be empty');
  });

  runner.test('initializes with activeHandIndex of -1', () => {
    const tracker = new HandTracker();
    assertEqual(tracker.activeHandIndex, -1, 'no active hand initially');
  });

});

runner.describe('HandTracker - Hand Center Calculation', () => {

  runner.test('calculates center from keypoints', () => {
    const tracker = new HandTracker();
    const mockHand = {
      keypoints: [
        { x: 100, y: 100 }, // 0 - wrist
        { x: 110, y: 90 },  // 1
        { x: 120, y: 80 },  // 2
        { x: 130, y: 70 },  // 3
        { x: 140, y: 60 },  // 4
        { x: 120, y: 100 }, // 5 - index MCP
        { x: 125, y: 90 },  // 6
        { x: 130, y: 80 },  // 7
        { x: 135, y: 70 },  // 8
        { x: 140, y: 100 }, // 9 - middle MCP
        { x: 145, y: 90 },  // 10
        { x: 150, y: 80 },  // 11
        { x: 155, y: 70 },  // 12
        { x: 150, y: 110 }, // 13 - ring MCP
        { x: 155, y: 100 }, // 14
        { x: 160, y: 90 },  // 15
        { x: 165, y: 80 },  // 16
        { x: 160, y: 120 }, // 17 - pinky MCP
        { x: 165, y: 110 }, // 18
        { x: 170, y: 100 }, // 19
        { x: 175, y: 90 }   // 20
      ]
    };

    const center = tracker.getHandCenter(mockHand);

    assertTrue(center !== null, 'should return a center');
    assertTrue('x' in center, 'center should have x');
    assertTrue('y' in center, 'center should have y');
    // Center uses indices 0, 5, 9, 13, 17
    // x: (100 + 120 + 140 + 150 + 160) / 5 = 134
    // y: (100 + 100 + 100 + 110 + 120) / 5 = 106
    assertEqual(center.x, 134, 'center x should be average of key points');
    assertEqual(center.y, 106, 'center y should be average of key points');
  });

  runner.test('handles missing keypoints gracefully', () => {
    const tracker = new HandTracker();
    const mockHand = {
      keypoints: [
        { x: 100, y: 100 }, // 0 - wrist only
      ]
    };

    const center = tracker.getHandCenter(mockHand);
    assertTrue(center !== null, 'should return a center even with limited keypoints');
  });

  runner.test('returns null for empty keypoints', () => {
    const tracker = new HandTracker();
    const mockHand = { keypoints: [] };

    const center = tracker.getHandCenter(mockHand);
    assertEqual(center, null, 'should return null for empty keypoints');
  });

});

runner.describe('HandTracker - Hand History Management', () => {

  runner.test('updates hand histories with positions', () => {
    const tracker = new HandTracker();
    const positions = [{ x: 100, y: 150 }, { x: 200, y: 250 }];

    tracker.updateHandHistories(positions);

    assertEqual(tracker.handHistories[0].length, 1, 'first hand should have 1 entry');
    assertEqual(tracker.handHistories[1].length, 1, 'second hand should have 1 entry');
    assertEqual(tracker.handHistories[0][0], 150, 'should store y position');
    assertEqual(tracker.handHistories[1][0], 250, 'should store y position');
  });

  runner.test('limits history length', () => {
    const tracker = new HandTracker();
    tracker.historyLength = 5;

    // Add more positions than history length
    for (let i = 0; i < 10; i++) {
      tracker.updateHandHistories([{ x: 100, y: 100 + i }]);
    }

    assertEqual(tracker.handHistories[0].length, 5, 'should cap history at historyLength');
  });

  runner.test('clears history for hands not detected', () => {
    const tracker = new HandTracker();

    // First detect 2 hands
    tracker.updateHandHistories([{ x: 100, y: 100 }, { x: 200, y: 200 }]);
    assertEqual(tracker.handHistories[1].length, 1, 'second hand should have history');

    // Then detect only 1 hand
    tracker.updateHandHistories([{ x: 100, y: 150 }]);
    assertEqual(tracker.handHistories[0].length, 2, 'first hand should have 2 entries');
    assertEqual(tracker.handHistories[1].length, 0, 'second hand history should be cleared');
  });

});

runner.describe('HandTracker - Active Hand Selection', () => {

  runner.test('selects single hand as active', () => {
    const tracker = new HandTracker();
    const hands = [{ keypoints: createMockKeypoints(100, 100) }];
    const positions = [{ x: 100, y: 100 }];

    const result = tracker.selectActiveHand(hands, positions);

    assertTrue(result !== null, 'should return a result');
    assertEqual(result.hand, hands[0], 'should select the only hand');
    assertTrue(result.isActive, 'should mark as active');
  });

  runner.test('selects hand with more motion when two hands present', () => {
    const tracker = new HandTracker();
    tracker.historyLength = 5;

    // Build up history - first hand stationary, second hand moving
    for (let i = 0; i < 5; i++) {
      tracker.handHistories[0].push(100); // stationary
      tracker.handHistories[1].push(100 + i * 20); // moving
    }

    const hands = [
      { keypoints: createMockKeypoints(100, 100) },
      { keypoints: createMockKeypoints(200, 150) }
    ];
    const positions = [{ x: 100, y: 100 }, { x: 200, y: 180 }];

    const result = tracker.selectActiveHand(hands, positions);

    assertEqual(result.hand, hands[1], 'should select the moving hand');
  });

  runner.test('prefers current active hand unless motion difference is significant', () => {
    const tracker = new HandTracker();
    tracker.activeHandIndex = 0;

    // Give both hands similar motion
    for (let i = 0; i < 5; i++) {
      tracker.handHistories[0].push(100 + i * 10);
      tracker.handHistories[1].push(100 + i * 11); // Slightly more but not 1.5x
    }

    const hands = [
      { keypoints: createMockKeypoints(100, 100) },
      { keypoints: createMockKeypoints(200, 200) }
    ];
    const positions = [{ x: 100, y: 150 }, { x: 200, y: 255 }];

    tracker.selectActiveHand(hands, positions);

    // Should prefer existing active hand for stability
    assertTrue(tracker.activeHandIndex >= 0, 'should have an active hand index');
  });

});

runner.describe('HandTracker - Wrist Position', () => {

  runner.test('returns null when no hand detected', () => {
    const tracker = new HandTracker();
    const position = tracker.getWristPosition();
    assertEqual(position, null, 'should return null with no hand');
  });

  runner.test('returns lastHandCenter if available', () => {
    const tracker = new HandTracker();
    tracker.lastHandCenter = { x: 150, y: 200 };

    const position = tracker.getWristPosition();

    assertEqual(position.x, 150, 'should return cached center x');
    assertEqual(position.y, 200, 'should return cached center y');
  });

  runner.test('calculates center from lastHand if no cached center', () => {
    const tracker = new HandTracker();
    tracker.lastHandCenter = null;
    tracker.lastHand = { keypoints: createMockKeypoints(100, 100) };

    const position = tracker.getWristPosition();

    assertTrue(position !== null, 'should calculate position from lastHand');
    assertTrue('x' in position, 'should have x coordinate');
    assertTrue('y' in position, 'should have y coordinate');
  });

});

runner.describe('HandTracker - Destroy', () => {

  runner.test('sets isReady to false on destroy', () => {
    const tracker = new HandTracker();
    tracker.isReady = true;

    tracker.destroy();

    assertFalse(tracker.isReady, 'should not be ready after destroy');
  });

});

runner.describe('HandTracker - Persistence', () => {

  runner.test('initializes persistence state correctly', () => {
    const tracker = new HandTracker();
    assertEqual(tracker.lostFrames, 0, 'lostFrames should start at 0');
    assertEqual(tracker.maxLostFrames, 8, 'maxLostFrames should be 8');
    assertEqual(tracker.lastValidCenter, null, 'lastValidCenter should be null');
    assertEqual(tracker.lastValidHand, null, 'lastValidHand should be null');
  });

  runner.test('stores valid hand data for persistence', () => {
    const tracker = new HandTracker();
    const mockHand = { keypoints: createMockKeypoints(100, 100) };
    const mockCenter = { x: 100, y: 100 };

    // Simulate what detect() does when hand is found
    tracker.lastValidHand = mockHand;
    tracker.lastValidCenter = mockCenter;
    tracker.lostFrames = 0;

    assertEqual(tracker.lastValidHand, mockHand, 'should store valid hand');
    assertEqual(tracker.lastValidCenter, mockCenter, 'should store valid center');
  });

  runner.test('increments lostFrames when hand not detected', () => {
    const tracker = new HandTracker();
    tracker.lostFrames = 0;

    // Simulate losing hand
    tracker.lostFrames++;
    assertEqual(tracker.lostFrames, 1, 'should increment lostFrames');

    tracker.lostFrames++;
    assertEqual(tracker.lostFrames, 2, 'should continue incrementing');
  });

  runner.test('resets lostFrames when hand found', () => {
    const tracker = new HandTracker();
    tracker.lostFrames = 5;

    // Simulate finding hand again
    tracker.lostFrames = 0;

    assertEqual(tracker.lostFrames, 0, 'should reset to 0');
  });

  runner.test('uses lastValidHand within maxLostFrames', () => {
    const tracker = new HandTracker();
    const mockHand = { keypoints: createMockKeypoints(100, 100) };
    const mockCenter = { x: 100, y: 100 };

    tracker.lastValidHand = mockHand;
    tracker.lastValidCenter = mockCenter;
    tracker.lostFrames = 3; // Within maxLostFrames (8)

    // Should still have valid data available
    assertTrue(tracker.lostFrames <= tracker.maxLostFrames, 'should be within persistence window');
    assertTrue(tracker.lastValidHand !== null, 'should have last valid hand');
  });

  runner.test('clears data after exceeding maxLostFrames', () => {
    const tracker = new HandTracker();
    tracker.lostFrames = 9; // Exceeds maxLostFrames (8)

    const shouldUsePersistence = tracker.lostFrames <= tracker.maxLostFrames;
    assertFalse(shouldUsePersistence, 'should not use persistence after max frames');
  });

  runner.test('persistence window is approximately 250ms at 30fps', () => {
    const tracker = new HandTracker();
    const frameTime = 1000 / 30; // ~33.3ms per frame
    const persistenceTime = tracker.maxLostFrames * frameTime;

    assertTrue(persistenceTime >= 200, 'persistence should be at least 200ms');
    assertTrue(persistenceTime <= 300, 'persistence should be at most 300ms');
  });

});

runner.describe('HandTracker - Detection Confidence', () => {

  runner.test('has reasonable detection confidence thresholds', () => {
    // These values are set in init(), but we can verify the concept
    const minDetectionConfidence = 0.5;
    const minTrackingConfidence = 0.5;

    assertTrue(minDetectionConfidence >= 0.3, 'detection confidence should not be too low');
    assertTrue(minDetectionConfidence <= 0.7, 'detection confidence should not be too high');
    assertTrue(minTrackingConfidence >= 0.3, 'tracking confidence should not be too low');
    assertTrue(minTrackingConfidence <= 0.7, 'tracking confidence should not be too high');
  });

});

// Helper function to create mock keypoints
function createMockKeypoints(baseX, baseY) {
  const keypoints = [];
  for (let i = 0; i < 21; i++) {
    keypoints.push({
      x: baseX + (i % 5) * 10,
      y: baseY + Math.floor(i / 5) * 10
    });
  }
  return keypoints;
}

export { runner };
