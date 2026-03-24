// Minimal smoke test placeholder for coverage command.
// Does not hit external services; intended to exercise module loading.
import assert from "assert";
import { isDemoUserId } from "../lib/auth_user.js";

// Basic sanity checks
assert.strictEqual(isDemoUserId(null), false, "null is not a demo user");
assert.strictEqual(isDemoUserId("some-id"), false, "arbitrary id is not demo");

console.log("api smoke test passed");
