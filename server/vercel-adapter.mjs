import { createHandler } from "./index.mjs";

export function createVercelHandler(options = {}) {
  const handle = createHandler({ ...options, deployed: true });
  return async (req, res) => {
    const url = new URL(req.url, "https://vercel.invalid");
    // Support both the original path and the destination URL after a rewrite.
    if (url.pathname === "/api/index") {
      const route = url.searchParams.get("__route") || req.query?.__route;
      if (typeof route === "string" && /^[a-z]+$/.test(route)) {
        url.searchParams.delete("__route");
        req.url = `/api/${route}${url.search}`;
      }
    }
    return handle(req, res);
  };
}
