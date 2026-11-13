import { JWT } from "google-auth-library";
import { googleConfig } from "@/server/config";

export const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.send",
];

let client: JWT | null = null;

/**
 * A service-account client acting as the Workspace user (equipment@) through
 * domain-wide delegation. The super admin must have authorized the service
 * account's client ID for SCOPES in the Admin console.
 */
export function googleAuth(): JWT {
  if (client) return client;
  const g = googleConfig();
  client = new JWT({ email: g.serviceAccountEmail, key: g.privateKey, scopes: SCOPES, subject: g.impersonate });
  return client;
}
