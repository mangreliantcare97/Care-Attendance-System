/**
 * Tiny API client.
 *
 * Every response uses the same envelope:
 *   { success: true,  data: ..., meta: ... }
 *   { success: false, error: { code, message, details } }
 *
 * The CSRF token issued at login is sent back with every state changing
 * request in the `X-CSRF-Token` header.
 */
(function () {
  var csrfToken = null;

  function setCsrfToken(token) {
    csrfToken = token || null;
  }

  function getCsrfToken() {
    return csrfToken;
  }

  function buildHeaders(options) {
    var headers = { Accept: 'application/json' };

    if (options.headers) {
      Object.keys(options.headers).forEach(function (key) {
        headers[key] = options.headers[key];
      });
    }

    var method = (options.method || 'GET').toUpperCase();
    if (csrfToken && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      headers['X-CSRF-Token'] = csrfToken;
    }

    return headers;
  }

  async function request(path, options) {
    options = options || {};

    var method = (options.method || 'GET').toUpperCase();
    var body = options.body;

    if (body && typeof body !== 'string' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
      options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    }

    var response;
    try {
      response = await fetch(path, {
        method: method,
        headers: buildHeaders(options),
        body: body,
        credentials: 'same-origin',
      });
    } catch (error) {
      var networkError = new Error('The server could not be reached. Please check your connection.');
      networkError.code = 'network_error';
      throw networkError;
    }

    var contentType = response.headers.get('content-type') || '';
    var payload = null;

    if (contentType.indexOf('application/json') !== -1) {
      payload = await response.json();
    }

    if (response.status === 401) {
      document.dispatchEvent(new CustomEvent('hrm:unauthenticated'));
    }

    if (!response.ok || (payload && payload.success === false)) {
      var failure = new Error(
        (payload && payload.error && payload.error.message) || 'The request could not be completed.',
      );
      failure.status = response.status;
      failure.code = (payload && payload.error && payload.error.code) || 'request_failed';
      failure.details = payload && payload.error && payload.error.details;
      throw failure;
    }

    return payload || { success: true, data: null };
  }

  function get(path) {
    return request(path, { method: 'GET' });
  }

  function post(path, body) {
    return request(path, { method: 'POST', body: body });
  }

  function patch(path, body) {
    return request(path, { method: 'PATCH', body: body });
  }

  function remove(path, body) {
    return request(path, { method: 'DELETE', body: body });
  }

  window.HrmApi = {
    request: request,
    get: get,
    post: post,
    patch: patch,
    delete: remove,
    setCsrfToken: setCsrfToken,
    getCsrfToken: getCsrfToken,
  };
})();
