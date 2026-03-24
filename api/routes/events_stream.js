import express from "express";
import TreeSyncBus from "../events/tree_sync.js";

export default function createEventsStreamRouter() {
  const router = express.Router();

  router.get("/stream", (req, res) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Send initial comment to establish connection
    res.write(": connected\n\n");

    // Subscribe to all event types
    const unsubscribers = [];
    
    for (const eventType of Object.values(TreeSyncBus.EVENT_TYPES)) {
      const unsubscribe = TreeSyncBus.on(eventType, (event) => {
        try {
          const sseData = {
            trace_id: event.trace_id,
            payload: event.payload,
            ts: event.ts,
          };
          
          // Format as SSE message
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        } catch (err) {
          console.error("[events_stream] error sending event:", err);
        }
      });
      
      unsubscribers.push(unsubscribe);
    }

    // Send heartbeat every 15 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch (err) {
        console.error("[events_stream] error sending heartbeat:", err);
        clearInterval(heartbeatInterval);
      }
    }, 15000);

    // Cleanup on connection close
    req.on("close", () => {
      clearInterval(heartbeatInterval);
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    });
  });

  return router;
}
