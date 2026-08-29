#!/usr/bin/env node
/**
 * Založí uživatele pro přihlášení do aplikace, nebo mu změní heslo.
 *
 *   npm run user -- barosk@gmail.com heslo
 *   npm run user                       # zeptá se na obojí interaktivně
 *
 * Heslo se ukládá scryptem se solí – v databázi není v čitelné podobě.
 */
import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, ObjectId } from "mongodb";
import { hashPassword } from "../src/lib/auth/scrypt.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Načte .env, ať skript nepotřebuje žádný další nástroj. */
function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env nemusí existovat – proměnné pak musí přijít z prostředí.
  }
  return { ...env, ...process.env };
}

function buildUri(env) {
  const host = (env.MONGODB_HOST ?? "").replace(/^mongodb(\+srv)?:\/\//, "").replace(/\/+$/, "");
  const params = new URLSearchParams({
    authSource: env.MONGODB_AUTH_SOURCE ?? "admin",
    tls: "true",
    retryWrites: "true",
    w: "majority",
  });
  return `mongodb+srv://${encodeURIComponent(env.MONGODB_USER)}:${encodeURIComponent(
    env.MONGODB_PASSWORD,
  )}@${host}/${encodeURIComponent(env.MONGODB_DATABASE)}?${params}`;
}

async function main() {
  const env = loadEnv();
  for (const key of ["MONGODB_USER", "MONGODB_PASSWORD", "MONGODB_HOST", "MONGODB_DATABASE"]) {
    if (!env[key]) {
      console.error(`Chybí ${key} v .env – bez připojení k databázi uživatele založit nejde.`);
      process.exit(1);
    }
  }
  if (!env.AUTH_SECRET) {
    console.warn("Pozor: v .env chybí AUTH_SECRET, takže přihlašování v aplikaci nepoběží.");
  }

  let [email, password] = process.argv.slice(2);
  if (!email || !password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    email ||= await rl.question("E-mail: ");
    password ||= await rl.question("Heslo: ");
    rl.close();
  }

  email = email.trim().toLowerCase();
  if (!email.includes("@")) {
    console.error("E-mail nevypadá platně.");
    process.exit(1);
  }
  if (password.length < 4) {
    console.error("Heslo musí mít aspoň 4 znaky.");
    process.exit(1);
  }

  const client = new MongoClient(buildUri(env), { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const users = client.db(env.MONGODB_DATABASE).collection("users");
    await users.createIndex({ email: 1 }, { unique: true });

    const passwordHash = await hashPassword(password);
    const existing = await users.findOne({ email });

    if (existing) {
      await users.updateOne({ _id: existing._id }, { $set: { passwordHash } });
      console.log(`Heslo uživatele ${email} bylo změněno.`);
    } else {
      await users.insertOne({
        _id: new ObjectId(),
        email,
        passwordHash,
        createdAt: Date.now(),
      });
      console.log(`Uživatel ${email} byl vytvořen.`);
    }
    console.log(`Uživatelů v databázi: ${await users.countDocuments()}`);
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
