/*global Ultraviolet*/
/*globals __uv$config*/

const Ultraviolet = self.Ultraviolet;

const cspHeaders = [
  "cross-origin-embedder-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "content-security-policy",
  "content-security-policy-report-only",
  "expect-ct",
  "feature-policy",
  "origin-isolation",
  "strict-transport-security",
  "upgrade-insecure-requests",
  "x-content-type-options",
  "x-download-options",
  "x-frame-options",
  "x-permitted-cross-domain-policies",
  "x-powered-by",
  "x-xss-protection",
];

const emptyMethods = ["GET", "HEAD"];

class UVServiceWorker extends Ultraviolet.EventEmitter {
  constructor(config = __uv$config) {
    super();
    this.config = config;
    this.bareClient = new Ultraviolet.BareClient();
  }

  route({ request }) {
    return request.url.startsWith(location.origin + this.config.prefix);
  }

  async fetch({ request }) {
    let fetchedURL;

    try {
      if (!this.route({ request })) {
        return fetch(request);
      }

      const ultraviolet = new Ultraviolet(this.config);

      const db = await ultraviolet.cookie.db();

      ultraviolet.meta.origin = location.origin;
      ultraviolet.meta.base = ultraviolet.meta.url = new URL(
        ultraviolet.sourceUrl(request.url)
      );

      const requestCtx = {
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: !emptyMethods.includes(request.method)
          ? await request.blob()
          : null,
      };

      const cookies = (await ultraviolet.cookie.getCookies(db)) || [];

      const cookieStr = ultraviolet.cookie.serialize(
        cookies,
        ultraviolet.meta,
        false
      );

      if (cookieStr) requestCtx.headers.cookie = cookieStr;

      fetchedURL = ultraviolet.meta.url;

      const response = await this.bareClient.fetch(fetchedURL, requestCtx);

      const headers = {};
      for (const key in response.rawHeaders) {
        headers[key.toLowerCase()] = response.rawHeaders[key];
      }

      // 🔥 Remove security headers
      for (const name of cspHeaders) {
        delete headers[name];
      }

      // 🔥 Handle redirects
      if (headers.location) {
        headers.location = ultraviolet.rewriteUrl(headers.location);
      }

      // 🔥 Handle cookies
      if (headers["set-cookie"]) {
        await ultraviolet.cookie.setCookies(
          headers["set-cookie"],
          db,
          ultraviolet.meta
        );
        delete headers["set-cookie"];
      }

      let body = response.body;

      // 🔥 Rewrite content
      if (body) {
        switch (request.destination) {
          case "script":
            body = ultraviolet.js.rewrite(await response.text());
            break;

          case "style":
            body = ultraviolet.rewriteCSS(await response.text());
            break;

          case "document":
          case "iframe":
            if (
              headers["content-type"] &&
              headers["content-type"].includes("text/html")
            ) {
              body = ultraviolet.rewriteHtml(await response.text(), {
                document: true,
                injectHead: ultraviolet.createHtmlInject(
                  ultraviolet.handlerScript,
                  ultraviolet.bundleScript,
                  ultraviolet.clientScript,
                  ultraviolet.configScript,
                  ultraviolet.cookie.serialize(
                    cookies,
                    ultraviolet.meta,
                    true
                  ),
                  request.referrer
                ),
              });
            }
            break;
        }
      }

      return new Response(body, {
        status: response.status,
        headers: headers,
      });

    } catch (err) {
      console.error(err);

      return new Response(
        `<h1>Ultraviolet Error</h1><pre>${err}</pre>`,
        {
          status: 500,
          headers: { "content-type": "text/html" },
        }
      );
    }
  }
}

self.UVServiceWorker = UVServiceWorker;

const uv = new UVServiceWorker();

self.addEventListener("fetch", (event) => {
  if (uv.route(event)) {
    event.respondWith(uv.fetch(event));
  }
});
