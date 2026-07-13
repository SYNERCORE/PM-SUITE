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
      new URL(`https://login.microsoftonline.com/${tenantId()}/discovery/v2.0/keys`)
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
