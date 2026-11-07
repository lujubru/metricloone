import crypto from "node:crypto";

const PREFIX = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/**
 * Clave de 32 bytes derivada de APP_ENCRYPTION_KEY (o NEXTAUTH_SECRET como
 * fallback) para no exigir una clave con formato específico.
 */
function encryptionKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Falta APP_ENCRYPTION_KEY (o NEXTAUTH_SECRET) para cifrar las credenciales de Facebook."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/** Cifra un secreto con AES-256-GCM: `v1:<iv>:<tag>:<ciphertext>` (todo en base64). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Descifra un valor generado con `encryptSecret`. Los valores que no tienen el
 * prefijo se devuelven tal cual (compatibilidad con secretos cargados a mano).
 */
export function decryptSecret(value: string): string {
  if (!value.startsWith(`${PREFIX}:`)) return value;

  const parts = value.split(":");
  if (parts.length !== 4) {
    throw new Error("El secreto cifrado tiene un formato inválido.");
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Token aleatorio para el parámetro `state` del OAuth y las cookies asociadas. */
export function randomToken(): string {
  return crypto.randomBytes(24).toString("hex");
}
