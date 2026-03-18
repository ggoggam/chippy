export type QueueCallback = (next: () => void) => void;

export default class Queue {
  _queue: QueueCallback[];
  _onEmptyCallback: () => void;
  _active: boolean;

  constructor(onEmptyCallback: () => void) {
    this._queue = [];
    this._onEmptyCallback = onEmptyCallback;
    this._active = false;
  }

  queue(func: QueueCallback) {
    this._queue.push(func);
    if (this._queue.length === 1 && !this._active) {
      this._progressQueue();
    }
  }

  _progressQueue() {
    if (!this._queue.length) {
      this._onEmptyCallback();
      return;
    }
    const f = this._queue.shift()!;
    this._active = true;
    f(this.next.bind(this));
  }

  clear() {
    this._queue = [];
  }

  next() {
    this._active = false;
    this._progressQueue();
  }

  dispose() {
    this._queue = [];
    this._active = false;
    this._onEmptyCallback = () => {};
  }
}
