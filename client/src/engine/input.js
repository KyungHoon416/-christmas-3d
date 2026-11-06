// Unified keyboard / mouse / multi-touch input.
// Mobile: left half = virtual joystick, right half = camera drag; both at once (multi-touch).
export class Input {
  constructor(canvas, joystickEl) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, z: 0 };
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.run = false;
    this.runToggle = false;
    this.jumpQueued = false;
    this.enabled = true;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.joystickEl = joystickEl;
    this.knob = joystickEl?.querySelector('.knob');
    this.handlers = [];
    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this.handlers.push(() => el.removeEventListener(ev, fn, opt)); };
    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); };

    on(window, 'keydown', (e) => {
      if (typing() || !this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jumpQueued = true; e.preventDefault(); }
      this.onKey?.(e);
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());

    // mouse look: drag with any button on the canvas
    let drag = null;
    on(canvas, 'pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
    });
    on(canvas, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      this.look.dx += dx; this.look.dy += dy;
    });
    on(canvas, 'pointerup', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (drag && drag.moved < 5) this.onTap?.(e.clientX, e.clientY);
      drag = null;
    });
    on(canvas, 'wheel', (e) => { this.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    on(canvas, 'contextmenu', (e) => e.preventDefault());

    // touch
    const touchStart = (e) => {
      for (const t of e.changedTouches) {
        const leftSide = t.clientX < window.innerWidth * 0.45;
        if (leftSide && this.joy.id === null) {
          this.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0, t0: performance.now() };
          this.showJoy(t.clientX, t.clientY);
        } else if (this.lookTouch.id === null) {
          this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now() };
        }
      }
      e.preventDefault();
    };
    const touchMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          const R = 55;
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
          this.joy.x = dx / R; this.joy.y = dy / R;
          if (this.knob) this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.run = this.runToggle || d > R * 1.25;
        } else if (t.identifier === this.lookTouch.id) {
          this.look.dx += (t.clientX - this.lookTouch.x) * 1.3;
          this.look.dy += (t.clientY - this.lookTouch.y) * 1.3;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        }
      }
      e.preventDefault();
    };
    const touchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) { this.joy = { id: null, x: 0, y: 0 }; this.hideJoy(); }
        if (t.identifier === this.lookTouch.id) {
          const lt = this.lookTouch;
          if (Math.hypot(t.clientX - lt.sx, t.clientY - lt.sy) < 10 && performance.now() - lt.t0 < 300) this.onTap?.(t.clientX, t.clientY);
          this.lookTouch = { id: null };
        }
      }
    };
    on(canvas, 'touchstart', touchStart, { passive: false });
    on(canvas, 'touchmove', touchMove, { passive: false });
    on(canvas, 'touchend', touchEnd);
    on(canvas, 'touchcancel', touchEnd);
  }

  showJoy(x, y) {
    if (!this.joystickEl) return;
    this.joystickEl.classList.add('active');
    this.joystickEl.style.left = x + 'px';
    this.joystickEl.style.top = y + 'px';
  }

  hideJoy() {
    if (!this.joystickEl) return;
    this.joystickEl.classList.remove('active');
    this.joystickEl.style.left = ''; this.joystickEl.style.top = '';
    if (this.knob) this.knob.style.transform = '';
  }

  // Called once per frame: returns current intent.
  sample() {
    const k = this.keys;
    let x = 0, z = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) z += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) z -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (this.joy.id !== null) { x += this.joy.x; z -= this.joy.y; }
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    const out = {
      x, z,
      run: this.run || this.runToggle || k.has('ShiftLeft') || k.has('ShiftRight'),
      jump: this.jumpQueued,
      lookX: this.look.dx, lookY: this.look.dy, zoom: this.zoom,
    };
    this.jumpQueued = false;
    this.look.dx = 0; this.look.dy = 0; this.zoom = 0;
    if (this.joy.id === null) this.run = false;
    return out;
  }

  dispose() { for (const h of this.handlers) h(); }
}
