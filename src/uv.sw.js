/*global Ultraviolet*/
/*globals __uv$config*/

const Ultraviolet = self.Ultraviolet;

const cspHeaders = [
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "content-security-policy",
  "content-security-policy-report-only",
  "strict-transport-security",
  "x-frame-options",
];

class UVServiceWorker {
  constructor(config = __uv$config) {
    this.config = config;
    this.bareClient = new Ultraviolet.BareClient();
  }

  route({ request }) {
    return request.url.startsWith(location.origin + this.config.prefix);
  }

  async fetch({ request }) {
    try {
      if (!this.route({ request })) {
        return fetch(request);
      }

      const ultraviolet = new Ultraviolet(this.config);

      const targetUrl = new URL(
        ultraviolet.sourceUrl(request.url)
      );

      const response = await this.bareClient.fetch(targetUrl, {
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
      });

      const headers = {};
      for (const key in response.rawHeaders) {
        headers[key.toLowerCase()] = response.rawHeaders[key];
      }

      // remove CSP headers (important for proxy)
      for (const name of cspHeaders) {
        delete headers[name];
      }

      let body = response.body;

      // rewrite HTML
      if (
        headers["content-type"] &&
        headers["content-type"].includes("text/html")
      ) {
        const text = await response.text();
        body = ultraviolet.rewriteHtml(text);
      }

      return new Response(body, {
        status: response.status,
        headers: headers,
      });

    } catch (err) {
      console.error(err);

      return new Response(
        `<h1>Error</h1><p>${err.toString()}</p>`,
        {
          status: 500,
          headers: { "content-type": "text/html" },
        }
      );
    }
  }
}

self.UVServiceWorker = UVServiceWorker;

// register fetch
const uv = new UVServiceWorker();

self.addEventListener("fetch", (event) => {
  if (uv.route(event)) {
    event.respondWith(uv.fetch(event));
  }
});
