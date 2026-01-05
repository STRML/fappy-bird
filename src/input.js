// Input manager for keyboard/touch fallback

export class InputManager {
  constructor() {
    this.jumpCallbacks = [];
    this.setupKeyboard();
    this.setupTouch();
  }

  onJump(callback) {
    this.jumpCallbacks.push(callback);
  }

  triggerJump() {
    for (const callback of this.jumpCallbacks) {
      callback();
    }
  }

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.triggerJump();
      }
    });
  }

  setupTouch() {
    const gameCanvas = document.getElementById('game');
    if (gameCanvas) {
      gameCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.triggerJump();
      });

      gameCanvas.addEventListener('click', (e) => {
        // Only trigger if not clicking a button
        if (e.target === gameCanvas) {
          this.triggerJump();
        }
      });
    }
  }

  setupCanvas(canvas) {
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.triggerJump();
    });

    canvas.addEventListener('click', (e) => {
      if (e.target === canvas) {
        this.triggerJump();
      }
    });
  }
}
