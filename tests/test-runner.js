// Simple test runner

export class TestRunner {
  constructor() {
    this.tests = [];
    this.results = { passed: 0, failed: 0, errors: [] };
  }

  describe(name, fn) {
    this.currentSuite = name;
    fn();
    this.currentSuite = null;
  }

  test(name, fn) {
    this.tests.push({
      suite: this.currentSuite,
      name,
      fn
    });
  }

  async run() {
    console.log('Running tests...\n');
    this.results = { passed: 0, failed: 0, errors: [] };

    for (const test of this.tests) {
      const fullName = test.suite ? `${test.suite} > ${test.name}` : test.name;
      try {
        await test.fn();
        this.results.passed++;
        console.log(`✓ ${fullName}`);
      } catch (error) {
        this.results.failed++;
        this.results.errors.push({ name: fullName, error });
        console.log(`✗ ${fullName}`);
        console.log(`  Error: ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Results: ${this.results.passed} passed, ${this.results.failed} failed`);

    return this.results;
  }
}

// Assertion helpers
export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

export function assertApprox(actual, expected, tolerance = 0.01, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(message || `Expected ~${expected}, got ${actual}`);
  }
}

export function assertTrue(value, message) {
  assert(value === true, message || `Expected true, got ${value}`);
}

export function assertFalse(value, message) {
  assert(value === false, message || `Expected false, got ${value}`);
}
