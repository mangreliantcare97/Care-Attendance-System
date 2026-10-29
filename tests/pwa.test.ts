import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const pwaScript = readFileSync(fileURLToPath(new URL('../public/js/pwa.js', import.meta.url)), 'utf8');
const workerScript = readFileSync(fileURLToPath(new URL('../public/service-worker.js', import.meta.url)), 'utf8');
const openDoms: JSDOM[] = [];

afterEach(() => {
  for (const dom of openDoms.splice(0)) {
    dom.window.close();
  }
});

function openPwaPage(options: {
  platform?: string;
  standalone?: boolean;
  secure?: boolean;
  serviceWorker?: object;
} = {}): JSDOM {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://care-attendance.example/',
    runScripts: 'outside-only',
  });
  openDoms.push(dom);

  Object.defineProperty(dom.window, 'isSecureContext', { value: options.secure ?? false });
  Object.defineProperty(dom.window.navigator, 'platform', { value: options.platform ?? 'Win32' });
  Object.defineProperty(dom.window.navigator, 'maxTouchPoints', { value: 0 });
  if (options.serviceWorker) {
    Object.defineProperty(dom.window.navigator, 'serviceWorker', { value: options.serviceWorker });
  }
  dom.window.matchMedia = (query: string) => ({
    matches: query === '(display-mode: standalone)' && options.standalone === true,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });

  dom.window.eval(pwaScript);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom;
}

describe('PWA installation controls', () => {
  it('only shows the Android install action after the browser offers its prompt', async () => {
    const dom = openPwaPage();
    const button = dom.window.document.querySelector<HTMLButtonElement>('.pwa-install-button');
    assert.ok(button);
    assert.equal(button.hidden, true);

    let promptCalls = 0;
    const promptEvent = new dom.window.Event('beforeinstallprompt', { cancelable: true });
    Object.assign(promptEvent, {
      prompt: async () => {
        promptCalls += 1;
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    dom.window.dispatchEvent(promptEvent);

    assert.equal(promptEvent.defaultPrevented, true);
    assert.equal(button.hidden, false);
    assert.equal(promptCalls, 0);

    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(promptCalls, 1);
    assert.equal(button.hidden, true);
  });

  it('suppresses the Android install action after the user dismisses the prompt', async () => {
    const dom = openPwaPage();
    const button = dom.window.document.querySelector<HTMLButtonElement>('.pwa-install-button');
    assert.ok(button);

    const promptEvent = new dom.window.Event('beforeinstallprompt', { cancelable: true });
    Object.assign(promptEvent, {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    dom.window.dispatchEvent(promptEvent);
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(button.hidden, true);

    const repeatedEvent = new dom.window.Event('beforeinstallprompt', { cancelable: true });
    Object.assign(repeatedEvent, {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    dom.window.dispatchEvent(repeatedEvent);
    assert.equal(button.hidden, true);
  });

  it('offers iOS Home Screen instructions without claiming a native prompt', () => {
    const dom = openPwaPage({ platform: 'iPhone' });
    const button = dom.window.document.querySelector<HTMLButtonElement>('.pwa-install-button');
    const panel = dom.window.document.querySelector<HTMLElement>('.pwa-install-panel');
    assert.ok(button);
    assert.ok(panel);
    assert.equal(button.hidden, false);

    button.click();
    assert.equal(panel.hidden, false);
    assert.match(panel.textContent ?? '', /Safari.*Share.*Add to Home Screen/);
  });

  it('does not show installation instructions when already running standalone', () => {
    const dom = openPwaPage({ platform: 'iPhone', standalone: true });
    const button = dom.window.document.querySelector<HTMLButtonElement>('.pwa-install-button');
    assert.ok(button);
    assert.equal(button.hidden, true);
  });

  it('does not activate an app update while the page has unsaved changes', async () => {
    const messages: Array<{ type: string }> = [];
    const registration = {
      waiting: { postMessage: (message: { type: string }) => messages.push(message) },
      installing: null,
      addEventListener: () => undefined,
      update: async () => undefined,
    };
    const serviceWorker = {
      controller: {},
      addEventListener: () => undefined,
      register: async () => registration,
    };
    const dom = openPwaPage({ secure: true, serviceWorker });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updateButton = dom.window.document.querySelector<HTMLButtonElement>('.pwa-update-button');
    const status = dom.window.document.querySelector<HTMLElement>('.pwa-install-status');
    assert.ok(updateButton);
    assert.ok(status);
    assert.equal(updateButton.hidden, false);

    dom.window.document.body.classList.add('sheet-dirty');
    updateButton.click();

    assert.deepEqual(messages, []);
    assert.equal(status.hidden, false);
    assert.match(status.textContent ?? '', /Finish or save your current changes/);
  });
});

interface WorkerRequest {
  url: string;
  method: string;
  mode: string;
  headers: Headers;
}

interface WorkerEvent {
  request?: WorkerRequest;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<unknown>) => void;
}

interface WorkerCache {
  add: (url: string) => Promise<void>;
  match: (request: string | WorkerRequest) => Promise<unknown>;
  put: (request: WorkerRequest, response: unknown) => Promise<void>;
}

function loadWorker(fetchImplementation: (request: WorkerRequest, options?: { cache?: string }) => Promise<unknown>) {
  const handlers: Record<string, (event: WorkerEvent) => void> = {};
  const cached = new Map<string, unknown>();
  const writes: string[] = [];
  const cache: WorkerCache = {
    add: async (url) => {
      cached.set(url, 'offline shell');
    },
    match: async (request) => cached.get(typeof request === 'string' ? request : request.url),
    put: async (request, response) => {
      writes.push(request.url);
      cached.set(request.url, response);
    },
  };
  const context = {
    self: {
      location: new URL('https://care-attendance.example/'),
      clients: { claim: async () => undefined },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) => {
        handlers[name] = handler;
      },
      skipWaiting: async () => undefined,
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: fetchImplementation,
    URL,
    Response,
    Promise,
    console,
  };
  runInNewContext(workerScript, context);
  return { handlers, cached, writes };
}

function workerRequest(url: string, options: { method?: string; mode?: string } = {}): WorkerRequest {
  return {
    url: new URL(url, 'https://care-attendance.example/').href,
    method: options.method ?? 'GET',
    mode: options.mode ?? 'cors',
    headers: new Headers(),
  };
}

describe('service worker caching boundaries', () => {
  it('does not intercept API requests or non-GET requests', () => {
    let fetchCalls = 0;
    const worker = loadWorker(async () => {
      fetchCalls += 1;
      return new Response('unexpected');
    });

    for (const request of [
      workerRequest('/api/auth/me'),
      workerRequest('/js/app.js', { method: 'POST' }),
    ]) {
      let intercepted = false;
      worker.handlers.fetch({
        request,
        respondWith: () => {
          intercepted = true;
        },
      });
      assert.equal(intercepted, false);
    }
    assert.equal(fetchCalls, 0);
    assert.deepEqual(worker.writes, []);
  });

  it('uses the generic offline page for failed navigations without caching HTML', async () => {
    const worker = loadWorker(async () => {
      throw new Error('offline');
    });
    let install: Promise<unknown> | undefined;
    worker.handlers.install({ waitUntil: (promise) => { install = promise; } });
    await install;

    let navigation: Promise<unknown> | undefined;
    worker.handlers.fetch({
      request: workerRequest('/dashboard.html', { mode: 'navigate' }),
      respondWith: (promise) => { navigation = promise; },
    });
    assert.equal(await navigation, 'offline shell');
    assert.deepEqual(worker.writes, []);
  });

  it('revalidates and caches only successful static assets', async () => {
    let fetchOptions: { cache?: string } | undefined;
    const worker = loadWorker(async (_request, options) => {
      fetchOptions = options;
      return {
        ok: true,
        type: 'basic',
        clone: () => 'static file',
      };
    });
    const assetRequest = workerRequest('/js/app.js');
    let assetResponse: Promise<unknown> | undefined;
    worker.handlers.fetch({
      request: assetRequest,
      respondWith: (promise) => { assetResponse = promise; },
    });
    await assetResponse;

    assert.equal(fetchOptions?.cache, 'no-cache');
    assert.deepEqual(worker.writes, [assetRequest.url]);
  });
});
