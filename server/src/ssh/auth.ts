import { SSH_MSG_USERAUTH_REQUEST, SSH_MSG_USERAUTH_SUCCESS, SSH_MSG_USERAUTH_FAILURE, AuthResult } from './types';
import { encodeString, concat, readUint32 } from './utils';

interface KeyMaterial {
  signingKey: CryptoKey;
  publicKeyBlob: Uint8Array;
  keyType: string;
}

export class SSHAuth {
  static buildPasswordAuthRequest(
    username: string,
    password: string
  ): Uint8Array {
    const parts: Uint8Array[] = [
      new Uint8Array([SSH_MSG_USERAUTH_REQUEST]),
      encodeString(username),
      encodeString('ssh-connection'),
      encodeString('password'),
      new Uint8Array([0x00]),
      encodeString(password),
    ];

    return concat(...parts);
  }

  /**
   * Build a public key auth request (RFC 4252 §7).
   * Supports Ed25519 and RSA (rsa-sha2-512 / rsa-sha2-256).
   */
  static async buildPublicKeyAuthRequest(
    username: string,
    privateKeyPEM: string,
    sessionID: Uint8Array
  ): Promise<Uint8Array> {
    const { signingKey, publicKeyBlob, keyType } = await this.parsePrivateKey(privateKeyPEM);

    const sigType = keyType === 'ssh-ed25519' ? 'ssh-ed25519' : 'rsa-sha2-512';

    // Build the request body (without signature first)
    const requestBody = concat(
      new Uint8Array([SSH_MSG_USERAUTH_REQUEST]),
      encodeString(username),
      encodeString('ssh-connection'),
      encodeString('publickey'),
      new Uint8Array([0x01]), // TRUE = has signature
      encodeString(keyType),
      encodeString(publicKeyBlob),
    );

    // Data to sign: session_id_string || request_body
    const dataToSign = concat(encodeString(sessionID), requestBody);

    // Sign
    let rawSignature: Uint8Array;
    if (keyType === 'ssh-ed25519') {
      rawSignature = new Uint8Array(await crypto.subtle.sign('Ed25519', signingKey, dataToSign));
    } else {
      rawSignature = new Uint8Array(await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
        signingKey,
        dataToSign,
      ));
    }

    // SSH signature blob: string sigType || string signature
    const signatureBlob = concat(
      encodeString(sigType),
      encodeString(rawSignature),
    );

    // Full auth packet: requestBody || string signature_blob
    return concat(requestBody, encodeString(signatureBlob));
  }

  private static async parsePrivateKey(pem: string): Promise<KeyMaterial> {
    const { keyType, privSection } = this.parseOpenSSHPem(pem);

    if (keyType === 'ssh-ed25519') {
      return this.parseEd25519Key(privSection);
    }
    if (keyType === 'ssh-rsa') {
      return this.parseRsaKey(privSection);
    }
    throw new Error(`不支持的密钥类型: ${keyType}，支持 ssh-ed25519 和 ssh-rsa`);
  }

  /**
   * Parse OpenSSH PEM container, return key type and raw private section.
   */
  private static parseOpenSSHPem(pem: string): { keyType: string; privSection: Uint8Array } {
    const lines = pem.trim().split('\n');
    const b64 = lines.filter(l => !l.startsWith('-----')).join('');
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    const magic = 'openssh-key-v1\0';
    const magicBytes = new TextEncoder().encode(magic);
    if (raw.length < magicBytes.length) throw new Error('私钥数据太短');
    for (let i = 0; i < magicBytes.length; i++) {
      if (raw[i] !== magicBytes[i]) throw new Error('不支持的私钥格式，请使用 OpenSSH 格式密钥');
    }
    let offset = magicBytes.length;

    const readStr = () => {
      if (offset + 4 > raw.length) throw new Error('私钥格式损坏');
      const len = readUint32(raw, offset); offset += 4;
      if (offset + len > raw.length) throw new Error('私钥格式损坏');
      const s = new TextDecoder().decode(raw.slice(offset, offset + len)); offset += len;
      return s;
    };
    const skipBytes = () => {
      if (offset + 4 > raw.length) throw new Error('私钥格式损坏');
      const len = readUint32(raw, offset); offset += 4;
      if (offset + len > raw.length) throw new Error('私钥格式损坏');
      offset += len;
    };
    const readUint = () => {
      if (offset + 4 > raw.length) throw new Error('私钥格式损坏');
      const v = readUint32(raw, offset); offset += 4;
      return v;
    };

    const cipher = readStr();
    if (cipher !== 'none') throw new Error('不支持加密的私钥，请使用 ssh-keygen -p 移除密码');
    skipBytes(); // kdfname
    skipBytes(); // kdfoptions
    const numKeys = readUint();
    if (numKeys !== 1) throw new Error('仅支持单密钥文件');
    skipBytes(); // public key section

    // private key section
    const privSecLen = readUint();
    if (offset + privSecLen > raw.length) throw new Error('私钥格式损坏');
    const privSection = raw.slice(offset, offset + privSecLen);

    // read key type from private section
    let po = 8; // skip checkint1 + checkint2
    if (po + 4 > privSection.length) throw new Error('私钥格式损坏');
    const ktLen = readUint32(privSection, po); po += 4;
    if (po + ktLen > privSection.length) throw new Error('私钥格式损坏');
    const keyType = new TextDecoder().decode(privSection.slice(po, po + ktLen));

    return { keyType, privSection };
  }

  /**
   * Read an SSH mpint (uint32 length + big-endian bytes) from privSection at pos.
   */
  private static readMpInt(privSection: Uint8Array, pos: number): { value: Uint8Array; end: number } {
    if (pos + 4 > privSection.length) throw new Error('私钥格式损坏：mpint 长度越界');
    const len = readUint32(privSection, pos); pos += 4;
    if (pos + len > privSection.length) throw new Error('私钥格式损坏：mpint 数据越界');
    return { value: privSection.slice(pos, pos + len), end: pos + len };
  }

  /**
   * Strip leading zero bytes (SSH mpints pad positive values > 0x7f with 0x00).
   */
  private static stripLeadingZero(bytes: Uint8Array): Uint8Array {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    return bytes.slice(start);
  }

  /**
   * Convert raw big-endian bytes to base64url (no padding) for JWK.
   */
  private static toBase64Url(bytes: Uint8Array): string {
    const stripped = this.stripLeadingZero(bytes);
    let binary = '';
    for (let i = 0; i < stripped.length; i++) {
      binary += String.fromCharCode(stripped[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Parse Ed25519 key from private section.
   */
  private static async parseEd25519Key(privSection: Uint8Array): Promise<KeyMaterial> {
    let po = 8; // skip checkints

    // skip key type
    const ktLen = readUint32(privSection, po); po += 4 + ktLen;

    // public key (32 bytes)
    if (po + 4 > privSection.length) throw new Error('私钥格式损坏');
    const pubKeyLen = readUint32(privSection, po); po += 4;
    const pubKeyRaw = privSection.slice(po, po + pubKeyLen); po += pubKeyLen;

    // private key (64 bytes = 32 seed + 32 pubkey)
    if (po + 4 > privSection.length) throw new Error('私钥格式损坏');
    const privKeyLen = readUint32(privSection, po); po += 4;
    const privKeyRaw = privSection.slice(po, po + privKeyLen);
    if (privKeyRaw.length < 32) throw new Error('私钥格式损坏：种子长度不足');
    const seed = privKeyRaw.slice(0, 32);

    const pkcs8 = this.buildEd25519PKCS8(seed);
    const signingKey = await crypto.subtle.importKey(
      'pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']
    );

    const publicKeyBlob = concat(
      encodeString('ssh-ed25519'),
      encodeString(pubKeyRaw),
    );

    return { signingKey, publicKeyBlob, keyType: 'ssh-ed25519' };
  }

  /**
   * Parse RSA key from OpenSSH private section.
   * Format: checkints || keytype || e || n || d || iqmp || p || q || comment || padding
   */
  private static async parseRsaKey(privSection: Uint8Array): Promise<KeyMaterial> {
    let po = 8; // skip checkints

    // skip key type ("ssh-rsa")
    const ktLen = readUint32(privSection, po); po += 4 + ktLen;

    // e (public exponent)
    const e = this.readMpInt(privSection, po); po = e.end;
    // n (modulus)
    const n = this.readMpInt(privSection, po); po = n.end;
    // d (private exponent)
    const d = this.readMpInt(privSection, po); po = d.end;
    // iqmp (inverse of q mod p)
    const iqmp = this.readMpInt(privSection, po); po = iqmp.end;
    // p (prime1)
    const p = this.readMpInt(privSection, po); po = p.end;
    // q (prime2)
    const q = this.readMpInt(privSection, po); po = q.end;

    // dp = d mod (p-1), dq = d mod (q-1) for JWK
    const dp = this.modReduce(d.value, p.value);
    const dq = this.modReduce(d.value, q.value);

    const jwk: JsonWebKey = {
      kty: 'RSA',
      e: this.toBase64Url(e.value),
      n: this.toBase64Url(n.value),
      d: this.toBase64Url(d.value),
      p: this.toBase64Url(p.value),
      q: this.toBase64Url(q.value),
      dp: this.toBase64Url(dp),
      dq: this.toBase64Url(dq),
      qi: this.toBase64Url(iqmp.value),
    };

    const signingKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
      false,
      ['sign'],
    );

    const publicKeyBlob = concat(
      encodeString('ssh-rsa'),
      encodeString(e.value),
      encodeString(n.value),
    );

    return { signingKey, publicKeyBlob, keyType: 'ssh-rsa' };
  }

  /**
   * Compute value mod (modulus - 1) using BigInt.
   */
  private static modReduce(value: Uint8Array, modulus: Uint8Array): Uint8Array {
    const valueBI = this.bytesToBigInt(value);
    const modBI = this.bytesToBigInt(modulus) - 1n;
    return this.bigIntToBytes(valueBI % modBI, modulus.length);
  }

  private static bytesToBigInt(bytes: Uint8Array): bigint {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
      result = (result << 8n) | BigInt(bytes[i]);
    }
    return result;
  }

  private static bigIntToBytes(value: bigint, minLen: number): Uint8Array {
    if (value === 0n) return new Uint8Array(minLen);
    const hex = value.toString(16);
    const padded = hex.length % 2 ? '0' + hex : hex;
    const bytes = new Uint8Array(padded.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    }
    if (bytes.length < minLen) {
      const out = new Uint8Array(minLen);
      out.set(bytes, minLen - bytes.length);
      return out;
    }
    return bytes;
  }

  /**
   * Wrap a 32-byte Ed25519 seed into PKCS8 DER format for Web Crypto import.
   */
  private static buildEd25519PKCS8(seed: Uint8Array): Uint8Array {
    const oid = new Uint8Array([0x06, 0x03, 0x2b, 0x65, 0x70]); // OID 1.3.101.112
    const seedOctet = new Uint8Array([0x04, seed.length, ...seed]);
    const innerOctet = new Uint8Array([0x04, seedOctet.length, ...seedOctet]);
    const algoSeq = new Uint8Array([0x30, oid.length, ...oid]);
    const version = new Uint8Array([0x02, 0x01, 0x00]);
    const totalLen = version.length + algoSeq.length + innerOctet.length;
    return new Uint8Array([0x30, totalLen, ...version, ...algoSeq, ...innerOctet]);
  }

  static handleResponse(payload: Uint8Array): AuthResult {
    const msgType = payload[0];

    switch (msgType) {
      case SSH_MSG_USERAUTH_SUCCESS:
        return { success: true };

      case SSH_MSG_USERAUTH_FAILURE: {
        const len = readUint32(payload, 1);
        const methods = new TextDecoder().decode(
          payload.slice(5, 5 + len)
        );
        const partialSuccess =
          payload.length > 5 + len ? payload[5 + len] !== 0 : false;
        return {
          success: false,
          allowedMethods: methods.split(',').filter(Boolean),
          partialSuccess,
        };
      }

      default:
        throw new Error(`Unexpected auth message type: ${msgType}`);
    }
  }
}
