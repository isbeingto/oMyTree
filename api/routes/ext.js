import express from "express";

// v0.4-lite placeholder per Constitution v0.4 + Codebook governance.
export default function createExtRouter() {
  const router = express.Router();

  router.get("/manifest", (_req, res) => {
    const body = {
      plugins: [],
      mode: "v0.4-lite",
    };

    res
      .status(200)
      .set("Content-Type", "application/json; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(`${JSON.stringify(body)}\n`);
  });

  return router;
}
