const button = document.getElementById('render');
const canvas = document.getElementById('canvas');
const scene = document.getElementById('scene');
const concurrency = document.getElementById('concurrency');
const concurrencyAmt = document.getElementById('concurrency-amt');
const timing = document.getElementById('timing');
const timingVal = document.getElementById('timing-val');
const ctx = canvas.getContext('2d');

button.disabled = true;
concurrency.disabled = true;

// First up, load our wasm
wasm_bindgen('./raytrace_parallel_bg.wasm')
  .then(run)
  .catch(e => {
    if (e instanceof WebAssembly.CompileError) {
      let msg = 'failed to compile wasm module';
      msg += `\nerror: ${e.message}`;
      msg += "\ncurrently this requires nightly Firefox";
      alert(msg);
    } else {
      console.error(e);
    }
  });

const { Scene, WorkerPool } = wasm_bindgen;

function run() {
  // The maximal concurrency of our web worker pool is `hardwareConcurrency`,
  // so set that up here and this ideally is the only location we create web
  // workers.
  pool = new WorkerPool(navigator.hardwareConcurrency);

  // Configure various buttons and such.
  button.onclick = function() {
    console.time('render');
    let json;
    try {
      json = JSON.parse(scene.value);
    } catch(e) {
      alert(`invalid json: ${e}`);
      return
    }
    canvas.width = json.width;
    canvas.height = json.height;
    render(new Scene(json));
  };
  button.innerText = 'Render!';
  button.disabled = false;

  concurrency.oninput = function() {
    concurrencyAmt.innerText = 'Concurrency: ' + concurrency.value;
  };
  concurrency.min = 1;
  concurrency.step = 1;
  concurrency.max = navigator.hardwareConcurrency;
  concurrency.value = concurrency.max;
  concurrency.oninput();
  concurrency.disabled = false;
}

let rendering = null;
let start = null;
let interval = null;
let pool = null;

class State {
  constructor(wasm) {
    this.start = performance.now();
    this.wasm = wasm;
    this.running = true;
    this.counter = 1;

    this.interval = setInterval(() => this.updateTimer(), 100);

    wasm.promise()
      .then(() => {
        this.updateTimer();
        this.stop();
      })
      .catch(console.error);
  }

  updateTimer() {
    const dur = performance.now() - this.start;
    timingVal.innerText = `${dur}ms`;
    this.counter += 1;
    if (this.wasm && this.counter % 3 == 0)
      this.wasm.requestUpdate();
  }

  stop() {
    if (!this.running)
      return;
    console.timeEnd('render');
    this.running = false;
    pool = this.wasm.cancel(); // this frees `wasm`, returning the worker pool
    this.wasm = null;
    clearInterval(this.interval);
  }
}

function render(scene) {
  if (rendering) {
    rendering.stop();
    rendering = null;
  }
  rendering = new State(scene.render(concurrency.value, pool, ctx));
  pool = null; // previous call took ownership of `pool`, zero it out here too
}