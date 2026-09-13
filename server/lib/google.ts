import { OAuth2Client } from 'google-auth-library';

export type GoogleProfile = {
  email: string;
  name: string;
  picture: string | null;
  sub: string;
};

function displayNameFromGoogle(data: {
  email?: string;
  name?: string;
  full_name?: string;
  given_name?: string;
  family_name?: string;
}): string {
  const full = (data.full_name || data.name || "").trim();
  if (full) return full;
  const parts = [data.given_name, data.family_name].map((part) => (part || "").trim()).filter(Boolean);
  if (parts.length) return parts.join(" ");
  return (data.email?.split("@")[0] || "").trim();
}

function getGoogleClientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }
  return id;
}

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

export async function verifyGoogleCredential(rawToken: string): Promise<GoogleProfile> {
  const clientId = getGoogleClientId();
  const client = new OAuth2Client(clientId);
  const token = rawToken.trim();

  if (looksLikeJwt(token)) {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.trim().toLowerCase();
    if (!payload || !email) {
      throw new Error('Google account email is missing');
    }
    if (payload.email_verified === false) {
      throw new Error('Google account email is unverified');
    }
    return {
      email,
      name: displayNameFromGoogle({
        email,
        name: payload.name,
        given_name: payload.given_name,
        family_name: payload.family_name,
      }),
      picture: payload.picture || null,
      sub: payload.sub,
    };
  }

  const tokenInfo = await client.getTokenInfo(token);
  if (tokenInfo.aud && tokenInfo.aud !== clientId) {
    throw new Error('Google token audience mismatch');
  }

  client.setCredentials({ access_token: token });
  const userinfo = await client.request<{
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    full_name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    sub?: string;
  }>({ url: 'https://www.googleapis.com/oauth2/v3/userinfo' });

  const data = userinfo.data;
  const email = data.email?.trim().toLowerCase();
  if (!email) {
    throw new Error('Google account email is missing');
  }
  if (data.email_verified === false || data.email_verified === 'false') {
    throw new Error('Google account email is unverified');
  }

  return {
    email,
    name: displayNameFromGoogle(data),
    picture: data.picture || null,
    sub: String(data.sub || tokenInfo.sub || email),
  };
}
