import { defineApp } from "convex/server";
import polar from "@convex-dev/polar/convex.config.js";

/** Components: Polar (storage plans — `billing.ts`). */
const app = defineApp();
app.use(polar);

export default app;
