/**
 * T25-2: Password Reset Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import pg from "pg";

// Mock pg
vi.mock("pg", () => ({
  default: {
    Pool: vi.fn(),
  },
}));

// Mock mail module
vi.mock("../lib/mail/sendAppMail.js", () => ({
  sendAppMail: vi.fn().mockResolvedValue({ ok: true }),
}));

// Mock bcrypt
vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password"),
  },
}));

describe("Password Reset Module", () => {
  let mockClient;
  let passwordResetModule;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock client
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    // Import module after mocks are set up
    passwordResetModule = await import("../lib/password_reset.js");
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("generateResetToken", () => {
    it("should generate a 64-character hex token", () => {
      const { generateResetToken } = passwordResetModule;
      const token = generateResetToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate unique tokens", () => {
      const { generateResetToken } = passwordResetModule;
      const token1 = generateResetToken();
      const token2 = generateResetToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe("createResetToken", () => {
    it("should create a token for a user", async () => {
      const { createResetToken } = passwordResetModule;

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await createResetToken(mockClient, "user-123");

      expect(result).toHaveProperty("token");
      expect(result.token).toMatch(/^[a-f0-9]{64}$/);
      expect(result).toHaveProperty("expiresAt");
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO password_reset_tokens"),
        expect.arrayContaining(["user-123", expect.any(String), expect.any(Date)])
      );
    });
  });

  describe("checkResetCooldown", () => {
    it("should return canSend true when no recent token", async () => {
      const { checkResetCooldown } = passwordResetModule;

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await checkResetCooldown(mockClient, "user-123");
      expect(result).toEqual({ canSend: true });
    });

    it("should return canSend false with remainingSeconds when in cooldown", async () => {
      const { checkResetCooldown } = passwordResetModule;

      const recentTime = new Date();
      recentTime.setMinutes(recentTime.getMinutes() - 1);

      mockClient.query.mockResolvedValueOnce({
        rows: [{ created_at: recentTime }],
      });

      const result = await checkResetCooldown(mockClient, "user-123");
      expect(result.canSend).toBe(false);
      expect(typeof result.remainingSeconds).toBe("number");
      expect(result.remainingSeconds).toBeGreaterThan(0);
    });
  });

  describe("verifyResetToken", () => {
    it("should verify valid token and return ok status", async () => {
      const { verifyResetToken } = passwordResetModule;

      const futureExpiry = new Date();
      futureExpiry.setHours(futureExpiry.getHours() + 1);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: "token-123",
            user_id: "user-123",
            expires_at: futureExpiry,
            used_at: null,
          },
        ],
      });

      const result = await verifyResetToken(mockClient, "valid-token");

      expect(result).toEqual({
        status: "ok",
        tokenId: "token-123",
        userId: "user-123",
      });
    });

    it("should reject expired token", async () => {
      const { verifyResetToken } = passwordResetModule;

      const pastExpiry = new Date();
      pastExpiry.setHours(pastExpiry.getHours() - 1);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: "token-123",
            user_id: "user-123",
            expires_at: pastExpiry,
            used_at: null,
          },
        ],
      });

      const result = await verifyResetToken(mockClient, "expired-token");

      expect(result).toEqual({
        status: "expired",
      });
    });

    it("should reject already used token", async () => {
      const { verifyResetToken } = passwordResetModule;

      const futureExpiry = new Date();
      futureExpiry.setHours(futureExpiry.getHours() + 1);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: "token-123",
            user_id: "user-123",
            expires_at: futureExpiry,
            used_at: new Date(),
          },
        ],
      });

      const result = await verifyResetToken(mockClient, "used-token");

      expect(result).toEqual({
        status: "used",
      });
    });

    it("should reject non-existent token", async () => {
      const { verifyResetToken } = passwordResetModule;

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await verifyResetToken(mockClient, "invalid-token");

      expect(result).toEqual({
        status: "invalid",
      });
    });
  });

  describe("resetPassword", () => {
    it("should reset password with valid token", async () => {
      const { resetPassword } = passwordResetModule;

      const futureExpiry = new Date();
      futureExpiry.setHours(futureExpiry.getHours() + 1);

      // Mock verifyResetToken query
      mockClient.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: "token-123",
              user_id: "user-123",
              expires_at: futureExpiry,
              used_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({}) // UPDATE users
        .mockResolvedValueOnce({}) // UPDATE token used_at
        .mockResolvedValueOnce({}); // UPDATE other tokens

      const result = await resetPassword(mockClient, "valid-token", "newPassword123");

      expect(result).toEqual({ status: "ok" });
    });

    it("should reject password reset with invalid token", async () => {
      const { resetPassword } = passwordResetModule;

      // Mock no token found
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await resetPassword(mockClient, "invalid-token", "newPassword123");

      expect(result).toEqual({
        status: "invalid",
      });
    });

    it("should reject weak password", async () => {
      const { resetPassword } = passwordResetModule;

      const result = await resetPassword(mockClient, "valid-token", "123");

      expect(result).toEqual({
        status: "weak_password",
        error: "Password must be at least 6 characters",
      });
    });
  });

  describe("sendResetEmail", () => {
    it("should send password reset email", async () => {
      const { sendResetEmail } = passwordResetModule;
      const { sendAppMail } = await import("../lib/mail/sendAppMail.js");

      const result = await sendResetEmail("test@example.com", "test-token-123");

      expect(result).toEqual({ ok: true });
      expect(sendAppMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@example.com",
          subject: expect.stringContaining("Reset"),
        })
      );
    });
  });

  describe("buildResetUrl", () => {
    it("should build correct reset URL", () => {
      const { buildResetUrl } = passwordResetModule;

      const url = buildResetUrl("test-token");
      expect(url).toContain("/auth/reset-password?token=test-token");
    });
  });

  describe("findUserByEmail", () => {
    it("should find existing user", async () => {
      const { findUserByEmail } = passwordResetModule;

      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: "user-123", email: "test@example.com" }],
      });

      const result = await findUserByEmail(mockClient, "test@example.com");
      expect(result).toEqual({ id: "user-123", email: "test@example.com" });
    });

    it("should return null for non-existent user", async () => {
      const { findUserByEmail } = passwordResetModule;

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await findUserByEmail(mockClient, "nonexistent@example.com");
      expect(result).toBeNull();
    });
  });
});
