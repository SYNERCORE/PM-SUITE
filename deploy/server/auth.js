// Azure AD token verification.
// The ProMaster app already gets a Microsoft 365 access token via MSAL
// for SharePoint. We reuse the same token here — the server just
// verifies it against Microsoft's public JWKS.
//
// It ALSO issues and verifies "LAN passes" — the server's own short-lived
// session tokens (HS256, signed with a local secret). A user signs in with
// Microsoft ONCE while online; the server exchanges that for a LAN pass valid
// N days. The app then opens and the server accepts reads/writes entirely
// OFFLINE for that window — no Microsoft, no internet. This is what makes
// multi-day offline operation possible on the LAN. Passes are validated only
// by this server, which lives behind Caddy + the LAN firewall.

import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

const tenantId = () => process.env.AZURE_TENANT_ID;
const clientId = () => process.env.AZURE_CLIENT_ID;

// ── LAN pass (server-issued offline session) ─────────────────────────
const LAN_ISS = 'promaster-lan';
let _lanSecret = null;                 // Uint8Array, set once at boot by server.js
export function setLanSecret(buf) { _lanSecret = buf; }

// Sign a LAN pass for a user profile. `days` = offline validity window.
// `m365Verified` marks that this issuance was backed by a live Microsoft
// sign-in (vs an admin pre-issue), for auditing.
export async function signLanPass(profile, days, m365Verified) {
  if (!_lanSecret) throw new Error('LAN secret not set');
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    email: profile.email,
    name: profile.name || profile.email,
    oid: profile.oid || profile.email,   // used client-side as the encryption key seed
    isAdmin: !!profile.isAdmin,
    role: profile.role || 'user',
    m365: !!m365Verified,
    typ: 'lan-pass',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(LAN_ISS)
    .setSubject(String(profile.email || ''))
    .setIssuedAt(now)
    .setExpirationTime(now + Math.max(1, days) * 24 * 3600)
    .sign(_lanSecret);
}

// Verify a LAN pass. `isRevoked(email, iatSeconds)` is an optional predicate
// the caller supplies to enforce revocation (a pass issued before an admin
// revoked that user is rejected). Throws on any invalid/expired/revoked pass.
export async function verifyLanPass(token, isRevoked) {
  if (!_lanSecret) throw new Error('LAN secret not set');
  const { payload } = await jwtVerify(token, _lanSecret, { issuer: LAN_ISS });
  if (payload.typ !== 'lan-pass') throw new Error('not a lan-pass');
  if (typeof isRevoked === 'function' && isRevoked(payload.email, payload.iat)) {
    throw new Error('lan-pass revoked');
  }
  return {
    email: payload.email, name: payload.name, oid: payload.oid,
    isAdmin: !!payload.isAdmin, role: payload.role, viaLanPass: true,
    m365: !!payload.m365, exp: payload.exp,
  };
}

let _jwks = null;
function jwks() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId()}/discovery/v2.0/keys`),
      {
        // This LAN server's internet to Microsoft can blip. Keep the signing
        // keys warm for 6h and don't refetch more than once every 30s, so
        // steady-state token checks are served from memory and almost never
        // touch the network. Bound each fetch so a stalled connection can't
        // hang a request. Transient fetch failures still surface as a caught
        // rejection (→ 401), never a process crash (see server.js guards).
        cacheMaxAge: 6 * 60 * 60 * 1000, // 6 hours
        cooldownDuration: 30 * 1000,     // 30 seconds
        timeoutDuration: 8 * 1000,       // 8 seconds
      }
    );
  }
  return _jwks;
}

export async function verifyAzureToken(token) {
  const { payload } = await jwtVerify(token, jwks(), {
    issuer: [
      `https://login.microsoftonline.com/${tenantId()}/v2.0`,
      `https://sts.windows.net/${tenantId()}/`,
    ],
    audience: [clientId(), `api://${clientId()}`],
  });
  return {
    email: payload.preferred_username || payload.upn || payload.email,
    name: payload.name,
    oid: payload.oid,
    tid: payload.tid,
  };
}
