// Azure AD token verification.
// The ProMaster app already gets a Microsoft 365 access token via MSAL
// for SharePoint. We reuse the same token here — the server just
// verifies it against Microsoft's public JWKS.

import { createRemoteJWKSet, jwtVerify } from 'jose';

const tenantId = () => process.env.AZURE_TENANT_ID;
const clientId = () => process.env.AZURE_CLIENT_ID;

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
