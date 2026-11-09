import { createVercelHandler } from "../server/vercel-adapter.mjs";

// Vercel owns the listener; the same application handler runs locally in Node.
export default createVercelHandler();
