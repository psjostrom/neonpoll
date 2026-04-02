import { randomBytes } from "crypto";

export function validateGlobalToken(token: string | null): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) return false;
  return token === adminToken;
}

export function validatePollToken(token: string | null, pollAdminToken: string): boolean {
  if (!token) return false;
  if (token === pollAdminToken) return true;
  return validateGlobalToken(token);
}

export function generateAdminToken(): string {
  return randomBytes(24).toString("base64url");
}
