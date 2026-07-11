import { SSH_MSG_USERAUTH_REQUEST, SSH_MSG_USERAUTH_SUCCESS, SSH_MSG_USERAUTH_FAILURE, AuthResult } from './types';
import { encodeString, concat, readUint32 } from './utils';

interface KeyMaterial {
  signingKey: CryptoKey;
  publicKeyBlob: Uint8Array;
  keyType: string;
}

// --- DER/ASN.1 helpers ---

function derLength(data: Uint8Array, offset: number): { length: number; end: number } {
  if (offset >= data.length) throw new Error('DER 格式损坏：长度越界');
  const first = data[offset];
  if (first < 0x80) return { length: first, end: offset + 1 };
  const numBytes = first & 0x7f;
  if (numBytes === 0 || offset + 1 + numBytes > data.length) throw new Error('DER 格式损坏');
  let length = 0;
  for (let i = 0; i < numBytes; i++) length = (length << 8) | data[offset + 1 + i];
  return { length, end: offset + 1 + numBytes };
}

function derReadLength(data: Uint8Array, offset: number): number {
  const r = derLength(data, offset);
  return r.end - offset;
}

function derReadSequence(data: Uint8Array, offset: number): { items: Uint8Array[]; end: number } {
  if (data[offset] !== 0x30) throw new Error('DER 格式损坏：期望 SEQUENCE');
  const lenInfo = derLength(data, offset + 1);
  const bodyStart = lenInfo.end;
  const bodyEnd = bodyStart + lenInfo.length;
  if (bodyEnd > data.length) throw new Error('DER 格式损坏：SEQUENCE 越界');
  const items: Uint8Array[] = [];
  let pos = bodyStart;
  while (pos < bodyEnd) {
    const tag = data[pos];
    const li = derLength(data, pos + 1);
    const valStart = li.end;
    const valEnd = valStart + li.length;
    if (tag === 0x30) {
      items.push(data.slice(pos, valEnd)); // include tag + length for nested SEQUENCE
    } else {
      items.push(data.slice(valStart, valEnd));
    }
    pos = valEnd;
  }
  return { items, end: bodyEnd };
}

function derReadOid(data: Uint8Array, offset: number): { oid: string; end: number } {
  if (data[offset] !== 0x06) throw new Error('DER 格式损坏：期望 OID');
  const li = derLength(data, offset + 1);
  const bodyStart = li.end;
  const bodyEnd = bodyStart + li.length;
  let oid = '';
  let val = 0;
  let first = true;
  for (let i = bodyStart; i < bodyEnd; i++) {
    val = (val << 7) | (data[i] & 0x7f);
    if (!(data[i] & 0x80)) {
      if (first) { oid += Math.floor(val / 40) + '.' + (val % 40); first = false; }
      else oid += '.' + val;
      val = 0;
    }
  }
  return { oid, end: bodyEnd };
}

function derReadInteger(data: Uint8Array, offset: number): { value: Uint8Array; end: number } {
  if (data[offset] !== 0x02) throw new Error('DER 格式损坏：期望 INTEGER');
  const li = derLength(data, offset + 1);
  const start = li.end;
  const end = start + li.length;
  return { value: data.slice(start, end), end };
}

function derReadBitString(data: Uint8Array, offset: number): { value: Uint8Array; end: number } {
  if (data[offset] !== 0x03) throw new Error('DER 格式损坏：期望 BIT STRING');
  const li = derLength(data, offset + 1);
  const start = li.end;
  const end = start + li.length;
  const unusedBits = data[start];
  if (unusedBits !== 0) throw new Error('DER 格式损坏：BIT STRING unused bits != 0');
  return { value: data.slice(start + 1, end), end };
}

function derReadOctetString(data: Uint8Array, offset: number): { value: Uint8Array; end: number } {
  if (data[offset] !== 0x04) throw new Error('DER 格式损坏：期望 OCTET STRING');
  const li = derLength(data, offset + 1);
  const start = li.end;
  const end = start + li.length;
  return { value: data.slice(start, end), end };
}

const EC_CURVES: Record<string, string> = {
  '1.2.840.10045.3.1.7': 'nistp256',   // P-256
  '1.3.132.0.34':        'nistp384',   // P-384
  '1.3.132.0.35':        'nistp521',   // P-521
};

// --- PEM decoding ---

function decodePem(pem: string): { header: string; der: Uint8Array } {
  const trimmed = pem.trim();
  const headerMatch = trimmed.match(/-----BEGIN ([A-Z ]+)-----/);
  if (!headerMatch) throw new Error('无法识别 PEM 头部');
  const header = headerMatch[1];
  const body = trimmed.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return { header, der };
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
   * Supports Ed25519 and RSA (rsa-sha2-512).
   */
  static async buildPublicKeyAuthRequest(
    username: string,
    privateKeyPEM: string,
    sessionID: Uint8Array
  ): Promise<Uint8Array> {
    const { signingKey, publicKeyBlob, keyType } = await this.parsePrivateKey(privateKeyPEM);

    const sigType = keyType === 'ssh-ed25519' ? 'ssh-ed25519' : 'rsa-sha2-512';

    const requestBody = concat(
      new Uint8Array([SSH_MSG_USERAUTH_REQUEST]),
      encodeString(username),
      encodeString('ssh-connection'),
      encodeString('publickey'),
      new Uint8Array([0x01]),
      encodeString(keyType),
      encodeString(publicKeyBlob),
    );

    const dataToSign = concat(encodeString(sessionID), requestBody);

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

    const signatureBlob = concat(
      encodeString(sigType),
      encodeString(rawSignature),
    );

    return concat(requestBody, encodeString(signatureBlob));
  }

  private static async parsePrivateKey(pem: string): Promise<KeyMaterial> {
    const { header } = decodePem(pem);

    switch (header) {
      case 'OPENSSH PRIVATE KEY':
        return this.parseOpenSshKey(pem);
      case 'PRIVATE KEY':
        return this.parsePkcs8Key(pem);
      case 'RSA PRIVATE KEY':
        return this.parsePkcs1RsaKey(pem);
      case 'EC PRIVATE KEY':
        return this.parseSec1EcKey(pem);
      case 'ENCRYPTED PRIVATE KEY':
        throw new Error('不支持加密的私钥，请先移除密码保护');
      default:
        throw new Error(`不支持的 PEM 类型: ${header}`);
    }
  }

  // --- OpenSSH format ---

  private static async parseOpenSshKey(pem: string): Promise<KeyMaterial> {
    const lines = pem.trim().split('\n');
    const b64 = lines.filter(l => !l.startsWith('-----')).join('');
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

    const magic = 'openssh-key-v1\0';
    const magicBytes = new TextEncoder().encode(magic);
    if (raw.length < magicBytes.length) throw new Error('私钥数据太短');
    for (let i = 0; i < magicBytes.length; i++) {
      if (raw[i] !== magicBytes[i]) throw new Error('OpenSSH 格式校验失败');
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

    const privSecLen = readUint();
    if (offset + privSecLen > raw.length) throw new Error('私钥格式损坏');
    const privSection = raw.slice(offset, offset + privSecLen);

    let po = 8;
    if (po + 4 > privSection.length) throw new Error('私钥格式损坏');
    const ktLen = readUint32(privSection, po); po += 4;
    if (po + ktLen > privSection.length) throw new Error('私钥格式损坏');
    const keyType = new TextDecoder().decode(privSection.slice(po, po + ktLen));

    if (keyType === 'ssh-ed25519') return this.buildEd25519FromOpenSsh(privSection);
    if (keyType === 'ssh-rsa') return this.buildRsaFromOpenSsh(privSection);
    throw new Error(`不支持的密钥类型: ${keyType}，支持 ssh-ed25519 和 ssh-rsa`);
  }

  private static readMpInt(privSection: Uint8Array, pos: number): { value: Uint8Array; end: number } {
    if (pos + 4 > privSection.length) throw new Error('私钥格式损坏：mpint 长度越界');
    const len = readUint32(privSection, pos); pos += 4;
    if (pos + len > privSection.length) throw new Error('私钥格式损坏：mpint 数据越界');
    return { value: privSection.slice(pos, pos + len), end: pos + len };
  }

  private static async buildEd25519FromOpenSsh(privSection: Uint8Array): Promise<KeyMaterial> {
    let po = 8;
    const ktLen = readUint32(privSection, po); po += 4 + ktLen;

    if (po + 4 > privSection.length) throw new Error('私钥格式损坏');
    const pubKeyLen = readUint32(privSection, po); po += 4;
    const pubKeyRaw = privSection.slice(po, po + pubKeyLen); po += pubKeyLen;

    if (po + 4 > privSection.length) throw new Error('私钥格式损坏');
    const privKeyLen = readUint32(privSection, po); po += 4;
    const privKeyRaw = privSection.slice(po, po + privKeyLen);
    if (privKeyRaw.length < 32) throw new Error('私钥格式损坏：种子长度不足');
    const seed = privKeyRaw.slice(0, 32);

    const pkcs8 = this.buildEd25519PKCS8(seed);
    const signingKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
    const publicKeyBlob = concat(encodeString('ssh-ed25519'), encodeString(pubKeyRaw));
    return { signingKey, publicKeyBlob, keyType: 'ssh-ed25519' };
  }

  private static async buildRsaFromOpenSsh(privSection: Uint8Array): Promise<KeyMaterial> {
    let po = 8;
    const ktLen = readUint32(privSection, po); po += 4 + ktLen;

    const e = this.readMpInt(privSection, po); po = e.end;
    const n = this.readMpInt(privSection, po); po = n.end;
    const d = this.readMpInt(privSection, po); po = d.end;
    const iqmp = this.readMpInt(privSection, po); po = iqmp.end;
    const p = this.readMpInt(privSection, po); po = p.end;
    const q = this.readMpInt(privSection, po); po = q.end;

    return await this.buildRsaKeyMaterial(e.value, n.value, d.value, p.value, q.value, iqmp.value);
  }

  // --- PKCS#8 format (Ed25519 + RSA) ---

  private static async parsePkcs8Key(pem: string): Promise<KeyMaterial> {
    const { der } = decodePem(pem);

    // PKCS#8: SEQUENCE { version, algorithmIdentifier, privateKey }
    if (der[0] !== 0x30) throw new Error('PKCS#8 格式损坏');
    let pos = derLength(der, 1).end;

    // version INTEGER 0
    const ver = derReadInteger(der, pos); pos = ver.end;

    // algorithmIdentifier SEQUENCE — skip it, read OID from first item
    const algoSeq = derReadSequence(der, pos); pos = algoSeq.end;

    // Extract OID from algorithmIdentifier
    const { oid } = derReadOid(algoSeq.items[0], 0);

    // privateKey OCTET STRING
    const privOctet = derReadOctetString(der, pos);

    if (oid === '1.3.101.112') {
      // Ed25519: inner is a SEQUENCE with 32-byte seed
      const innerSeq = derReadSequence(privOctet.value, 0);
      const seedItem = derReadOctetString(innerSeq.items[0], 0);
      return this.buildEd25519FromSeed(seedItem.value);
    }

    if (oid === '1.2.840.113549.1.1.1') {
      // RSA: re-wrap inner data as PKCS#8 DER for Web Crypto import
      return this.buildRsaFromPkcs8(privOctet.value, der);
    }

    throw new Error(`不支持的 PKCS#8 算法 OID: ${oid}`);
  }

  private static async buildEd25519FromSeed(seed: Uint8Array): Promise<KeyMaterial> {
    // PKCS#8 Ed25519 only contains the 32-byte seed; public key must be computed
    // via scalar multiplication which requires a dedicated library.
    // Use OpenSSH format instead: ssh-keygen -t ed25519
    throw new Error('PKCS#8 Ed25519 需要公钥，请使用 OpenSSH 格式 (ssh-keygen -t ed25519)');
  }

  private static async buildRsaFromPkcs8(innerData: Uint8Array, fullDer: Uint8Array): Promise<KeyMaterial> {
    // Parse RSA private key from inner PKCS#1 DER
    // PKCS#1 RSAPrivateKey: SEQUENCE { version, n, e, d, p, q, dp, dq, iqmp }
    if (innerData[0] !== 0x30) throw new Error('RSA 私钥格式损坏');
    const bodyStart = derLength(innerData, 1).end;

    const ver = derReadInteger(innerData, bodyStart);
    const nInt = derReadInteger(innerData, ver.end);
    const eInt = derReadInteger(innerData, nInt.end);
    const dInt = derReadInteger(innerData, eInt.end);
    const pInt = derReadInteger(innerData, dInt.end);
    const qInt = derReadInteger(innerData, pInt.end);
    const dpInt = derReadInteger(innerData, qInt.end);
    const dqInt = derReadInteger(innerData, dpInt.end);
    const iqmpInt = derReadInteger(innerData, dqInt.end);

    return await this.buildRsaKeyMaterial(
      eInt.value, nInt.value, dInt.value,
      pInt.value, qInt.value, iqmpInt.value,
    );
  }

  // --- Traditional RSA (PKCS#1) ---

  private static async parsePkcs1RsaKey(pem: string): Promise<KeyMaterial> {
    const { der } = decodePem(pem);

    // PKCS#1 RSAPrivateKey: SEQUENCE { version, n, e, d, p, q, dp, dq, iqmp }
    if (der[0] !== 0x30) throw new Error('PKCS#1 RSA 格式损坏');
    const bodyStart = derLength(der, 1).end;

    const ver = derReadInteger(der, bodyStart);
    const nInt = derReadInteger(der, ver.end);
    const eInt = derReadInteger(der, nInt.end);
    const dInt = derReadInteger(der, eInt.end);
    const pInt = derReadInteger(der, dInt.end);
    const qInt = derReadInteger(der, pInt.end);
    const dpInt = derReadInteger(der, qInt.end);
    const dqInt = derReadInteger(der, dpInt.end);
    const iqmpInt = derReadInteger(der, dqInt.end);

    return await this.buildRsaKeyMaterial(
      eInt.value, nInt.value, dInt.value,
      pInt.value, qInt.value, iqmpInt.value,
    );
  }

  // --- SEC1 EC ---

  private static async parseSec1EcKey(pem: string): Promise<KeyMaterial> {
    const { der } = decodePem(pem);

    // SEC1 ECPrivateKey: SEQUENCE { version, privateKey, [0] parameters, [1] publicKey }
    if (der[0] !== 0x30) throw new Error('SEC1 EC 格式损坏');
    const seqLen = derLength(der, 1);
    let pos = seqLen.end;
    const bodyEnd = pos + seqLen.length;

    // version INTEGER 1
    const ver = derReadInteger(der, pos); pos = ver.end;

    // privateKey OCTET STRING
    const privKey = derReadOctetString(der, pos); pos = privKey.end;

    let curveOid = '';
    let pubPoint = new Uint8Array();

    // Parse optional tagged fields
    while (pos < bodyEnd) {
      const tag = der[pos];
      if (tag === 0xa0) {
        // [0] parameters: ECParameters { namedCurve OID }
        const li = derLength(der, pos + 1);
        const paramStart = li.end;
        const curveInfo = derReadOid(der, paramStart);
        curveOid = curveInfo.oid;
        pos = paramStart + li.length;
      } else if (tag === 0xa1) {
        // [1] publicKey: BIT STRING (uncompressed EC point)
        const li = derLength(der, pos + 1);
        const bsStart = li.end;
        const bs = derReadBitString(der, bsStart - 1); // re-read from tag position
        pubPoint = bs.value as Uint8Array<ArrayBuffer>;
        pos = bsStart + li.length;
      } else {
        break;
      }
    }

    const sshCurve = EC_CURVES[curveOid];
    if (!sshCurve) throw new Error(`不支持的 EC 曲线 OID: ${curveOid}`);

    // Web Crypto EC import
    const ecParams = this.ecCurveParams(sshCurve);
    const pkcs8 = this.buildEcPKCS8(privKey.value, pubPoint, curveOid);
    const signingKey = await crypto.subtle.importKey('pkcs8', pkcs8, ecParams, false, ['sign']);

    const publicKeyBlob = concat(
      encodeString('ecdsa-sha2-' + sshCurve),
      encodeString(sshCurve),
      encodeString(pubPoint),
    );

    return { signingKey, publicKeyBlob, keyType: 'ecdsa-sha2-' + sshCurve };
  }

  // --- Shared key material builders ---

  private static async buildRsaKeyMaterial(
    e: Uint8Array, n: Uint8Array, d: Uint8Array,
    p: Uint8Array, q: Uint8Array, iqmp: Uint8Array,
  ) {
    const dp = this.modReduce(d, p);
    const dq = this.modReduce(d, q);

    const jwk: JsonWebKey = {
      kty: 'RSA',
      e: this.toBase64Url(e),
      n: this.toBase64Url(n),
      d: this.toBase64Url(d),
      p: this.toBase64Url(p),
      q: this.toBase64Url(q),
      dp: this.toBase64Url(dp),
      dq: this.toBase64Url(dq),
      qi: this.toBase64Url(iqmp),
    };

    const signingKey = crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
      false, ['sign'],
    );

    const publicKeyBlob = concat(
      encodeString('ssh-rsa'),
      encodeString(this.stripLeadingZero(e)),
      encodeString(this.stripLeadingZero(n)),
    );

    return { signingKey: await signingKey, publicKeyBlob, keyType: 'ssh-rsa' };
  }

  private static modReduce(value: Uint8Array, modulus: Uint8Array): Uint8Array {
    return this.bigIntToBytes(this.bytesToBigInt(value) % (this.bytesToBigInt(modulus) - 1n), modulus.length);
  }

  private static bytesToBigInt(bytes: Uint8Array): bigint {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) result = (result << 8n) | BigInt(bytes[i]);
    return result;
  }

  private static bigIntToBytes(value: bigint, minLen: number): Uint8Array {
    if (value === 0n) return new Uint8Array(minLen);
    const hex = value.toString(16);
    const padded = hex.length % 2 ? '0' + hex : hex;
    const bytes = new Uint8Array(padded.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    if (bytes.length < minLen) {
      const out = new Uint8Array(minLen);
      out.set(bytes, minLen - bytes.length);
      return out;
    }
    return bytes;
  }

  private static stripLeadingZero(bytes: Uint8Array): Uint8Array {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    return bytes.slice(start);
  }

  private static toBase64Url(bytes: Uint8Array): string {
    const stripped = this.stripLeadingZero(bytes);
    let binary = '';
    for (let i = 0; i < stripped.length; i++) binary += String.fromCharCode(stripped[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private static buildEd25519PKCS8(seed: Uint8Array): Uint8Array {
    const oid = new Uint8Array([0x06, 0x03, 0x2b, 0x65, 0x70]);
    const seedOctet = new Uint8Array([0x04, seed.length, ...seed]);
    const innerOctet = new Uint8Array([0x04, seedOctet.length, ...seedOctet]);
    const algoSeq = new Uint8Array([0x30, oid.length, ...oid]);
    const version = new Uint8Array([0x02, 0x01, 0x00]);
    const totalLen = version.length + algoSeq.length + innerOctet.length;
    return new Uint8Array([0x30, totalLen, ...version, ...algoSeq, ...innerOctet]);
  }

  private static buildEcPKCS8(privKey: Uint8Array, pubPoint: Uint8Array, curveOid: string): Uint8Array {
    // Build PKCS#8 for EC: SEQUENCE { version(0), algId(SEQUENCE { OID ecPublicKey, OID curve }), privKey OCTET STRING }
    const ecOid = this.encodeOid('1.2.840.10045.2.1'); // id-ecPublicKey
    const curveOidDer = this.encodeOid(curveOid);
    const algIdSeq = this.encodeDerSequence(ecOid, curveOidDer);
    const privOctet = this.encodeDerOctetString(privKey);
    const version = new Uint8Array([0x02, 0x01, 0x00]);
    return this.encodeDerSequence(version, algIdSeq, privOctet);
  }

  private static ecCurveParams(sshCurve: string) {
    switch (sshCurve) {
      case 'nistp256': return { name: 'ECDSA' as const, namedCurve: 'P-256' as const };
      case 'nistp384': return { name: 'ECDSA' as const, namedCurve: 'P-384' as const };
      case 'nistp521': return { name: 'ECDSA' as const, namedCurve: 'P-521' as const };
      default: throw new Error(`不支持的 EC 曲线: ${sshCurve}`);
    }
  }

  // --- DER encoding helpers for PKCS#8 construction ---

  private static encodeDerLength(length: number): Uint8Array {
    if (length < 0x80) return new Uint8Array([length]);
    const bytes: number[] = [];
    let v = length;
    while (v > 0) { bytes.unshift(v & 0xff); v >>= 8; }
    return new Uint8Array([0x80 | bytes.length, ...bytes]);
  }

  private static encodeDerInteger(value: Uint8Array): Uint8Array {
    const v = this.stripLeadingZero(value);
    const content = (v.length > 0 && (v[0] & 0x80)) ? new Uint8Array([0x00, ...v]) : v;
    return new Uint8Array([0x02, ...this.encodeDerLength(content.length), ...content]);
  }

  private static encodeDerOctetString(value: Uint8Array): Uint8Array {
    return new Uint8Array([0x04, ...this.encodeDerLength(value.length), ...value]);
  }

  private static encodeOid(oidStr: string): Uint8Array {
    const parts = oidStr.split('.').map(Number);
    const body: number[] = [parts[0] * 40 + parts[1]];
    for (let i = 2; i < parts.length; i++) {
      let v = parts[i];
      const seg: number[] = [];
      while (v > 0x7f) { seg.unshift(v & 0x7f); v >>= 7; }
      seg.unshift(v);
      for (let j = 0; j < seg.length - 1; j++) seg[j] |= 0x80;
      body.push(...seg);
    }
    return new Uint8Array([0x06, ...this.encodeDerLength(body.length), ...body]);
  }

  private static encodeDerSequence(...items: Uint8Array[]): Uint8Array {
    const body = concat(...items);
    return new Uint8Array([0x30, ...this.encodeDerLength(body.length), ...body]);
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
