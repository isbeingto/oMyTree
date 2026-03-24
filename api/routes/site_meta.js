/**
 * Public Site Metadata API
 * 
 * Provides public access to site metadata (TDK, favicon)
 * for SEO and browser rendering purposes.
 */

import express from "express";
import { getConfig } from "../services/system_config.js";

const router = express.Router();

/**
 * GET /api/site/meta
 * Get public site metadata (favicon)
 * No authentication required - this is public information
 */
router.get("/api/site/meta", async (req, res) => {
  try {
    const favicon = await getConfig("site_favicon", "");

    res.json({
      favicon,
    });
  } catch (error) {
    console.error("[site/meta] Error fetching metadata:", error.message);
    // Return defaults on error
    res.json({
      favicon: "",
    });
  }
});

export default router;
