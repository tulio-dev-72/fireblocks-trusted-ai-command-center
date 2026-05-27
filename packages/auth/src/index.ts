import { createHmac, timingSafeEqual } from "node:crypto";
import type { Actor, ActorType } from "@taicc/shared-types";

export interface AuthConfig {
  jwtSecret: string;
  issuer: string;
  audience: string;
}

export interface TokenPayload {
  sub: string;
  name: string;
  type: ActorType;
  roles: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export type Permission =
  | "operations:read"
  | "operations:write"
  | "approvals:read"
  | "approvals:write"
  | "policies:read"
  | "policies:write"
  | "audit:read"
  | "agents:read"
  | "agents:write";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    "operations:read",
    "operations:write",
    "approvals:read",
    "approvals:write",
    "policies:read",
    "policies:write",
    "audit:read",
    "agents:read",
    "agents:write",
  ],
  operator: [
    "operations:read",
    "operations:write",
    "approvals:read",
    "approvals:write",
    "audit:read",
    "agents:read",
  ],
  approver: ["operations:read", "approvals:read", "approvals:write", "audit:read"],
  viewer: ["operations:read", "audit:read", "agents:read"],
  agent: ["operations:read", "operations:write"],
};

export class AuthService {
  constructor(private readonly config: AuthConfig) {}

  signToken(actor: Actor, expiresInSeconds = 3600): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      sub: actor.id,
      name: actor.name,
      type: actor.type,
      roles: actor.roles,
      iat: now,
      exp: now + expiresInSeconds,
      iss: this.config.issuer,
      aud: this.config.audience,
    };

    const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = base64UrlEncode(JSON.stringify(payload));
    const signature = createHmac("sha256", this.config.jwtSecret)
      .update(`${header}.${body}`)
      .digest("base64url");

    return `${header}.${body}.${signature}`;
  }

  verifyToken(token: string): Actor {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new AuthError("INVALID_TOKEN", "Malformed JWT");
    }

    const [header, body, signature] = parts;
    const expectedSig = createHmac("sha256", this.config.jwtSecret)
      .update(`${header}.${body}`)
      .digest();

    const actualSig = Buffer.from(signature, "base64url");
    if (
      actualSig.length !== expectedSig.length ||
      !timingSafeEqual(actualSig, expectedSig)
    ) {
      throw new AuthError("INVALID_TOKEN", "Invalid JWT signature");
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf-8"),
    ) as TokenPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new AuthError("TOKEN_EXPIRED", "JWT has expired");
    }

    if (payload.iss !== this.config.issuer) {
      throw new AuthError("INVALID_ISSUER", "Invalid token issuer");
    }

    if (payload.aud !== this.config.audience) {
      throw new AuthError("INVALID_AUDIENCE", "Invalid token audience");
    }

    return {
      id: payload.sub,
      type: payload.type,
      name: payload.name,
      roles: payload.roles,
    };
  }

  hasPermission(actor: Actor, permission: Permission): boolean {
    const permissions = new Set<Permission>();
    for (const role of actor.roles) {
      const rolePerms = ROLE_PERMISSIONS[role];
      if (rolePerms) rolePerms.forEach((p) => permissions.add(p));
    }
    return permissions.has(permission);
  }

  requirePermission(actor: Actor, permission: Permission): void {
    if (!this.hasPermission(actor, permission)) {
      throw new AuthError(
        "FORBIDDEN",
        `Missing permission: ${permission}`,
      );
    }
  }
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice(7);
}
