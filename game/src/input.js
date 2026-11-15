// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. Besides movement keys it tracks the action keys
// the sim reads once per frame: E (plant), G (grenade), B (buy menu),
// 1/2/3 (weapon slots) and the number keys the buy menu uses.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set(); // codes pressed since the last takePressed() call
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (event.code === 'Space') event.preventDefault();
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      pressed.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Edge-triggered keys: each code is reported once, the frame it went down.
    takePressed() {
      const out = pressed;
      pressed.clear();
      return out;
    },
  };
}
