/**
 * Helper to convert an ArrayBuffer to a Base64URL string.
 */
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Helper to convert a Base64URL string to an ArrayBuffer.
 */
function base64urlToBuffer(base64url) {
  let base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Checks if the Web Authentication API is supported and if platform authenticator is available.
 * Returns true if supported, false otherwise.
 */
export async function isPlatformAuthenticatorAvailable() {
  try {
    if (!window.PublicKeyCredential) {
      return false;
    }
    // Check if the device has a platform authenticator (fingerprint scanner, FaceID, Windows Hello, PIN, pattern)
    return await PublicKeyCredential.isUserVerificationPlatformAuthenticatorAvailable();
  } catch (error) {
    console.error('Error checking platform authenticator availability:', error);
    return false;
  }
}

/**
 * Triggers the browser registration flow for a platform authenticator.
 * This will prompt the native OS PIN/Pattern/Biometrics screen to enroll this device.
 * Returns the registered Credential ID (Base64url format).
 */
export async function registerDeviceCredential() {
  const available = await isPlatformAuthenticatorAvailable();
  if (!available) {
    throw new Error('Device lock screen authentication is not supported or not available in this context.');
  }

  // Generate unique values for challenge and user ID
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const rpId = window.location.hostname;

  const createOptions = {
    publicKey: {
      challenge: challenge,
      rp: {
        name: "MSA Document Hub",
        id: rpId
      },
      user: {
        id: userId,
        name: "user@msa.hub",
        displayName: "MSA User"
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256 (ECDSA using P-256 and SHA-256)
        { type: "public-key", alg: -257 }  // RS256 (RSASSA-PKCS1-v1_5 using SHA-256)
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Force native on-device authenticator (PIN, fingerprint, pattern, Face ID)
        userVerification: "required",        // Enforce actual prompt for user's passcode/biometrics
        residentKey: "preferred"
      },
      timeout: 60000
    }
  };

  const credential = await navigator.credentials.create(createOptions);
  if (!credential) {
    throw new Error('Credential registration returned null.');
  }

  return bufferToBase64url(credential.rawId);
}

/**
 * Prompts the user with their native OS lock screen to verify identity.
 * Returns true if verification succeeds, otherwise throws.
 */
export async function verifyDeviceCredential(credentialId) {
  if (!credentialId) {
    throw new Error('Credential ID is required for verification.');
  }

  const rawId = base64urlToBuffer(credentialId);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const rpId = window.location.hostname;

  const getOptions = {
    publicKey: {
      challenge: challenge,
      rpId: rpId,
      allowCredentials: [{
        type: 'public-key',
        id: rawId
      }],
      userVerification: 'required', // Prompt for PIN/Passcode/Biometrics
      timeout: 60000
    }
  };

  const assertion = await navigator.credentials.get(getOptions);
  if (!assertion) {
    throw new Error('Verification returned null.');
  }

  return true;
}
