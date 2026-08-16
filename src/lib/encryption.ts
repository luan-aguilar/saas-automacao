import crypto from "crypto";

/**
 * Criptografia simétrica (AES-256-GCM) usada para armazenar a API Key da
 * OpenAI de cada cliente. A ENCRYPTION_KEY deve ser uma string hex de 64
 * caracteres (32 bytes) — gere com `openssl rand -hex 32`.
 */

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY ausente ou inválida. Defina uma chave hex de 64 caracteres (32 bytes) no .env."
    );
  }
  return Buffer.from(key, "hex");
}

export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // formato: iv:authTag:cipherText (tudo em hex)
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, authTagHex, dataHex] = payload.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Payload criptografado em formato inválido.");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskKey(plainText: string): string {
  if (plainText.length <= 4) return "****";
  return `sk-...${plainText.slice(-4)}`;
}
