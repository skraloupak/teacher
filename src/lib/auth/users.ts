import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "../mongo";
import { hashPassword, verifyPassword } from "./password";

export const USERS_COLLECTION = "users";

export type UserDoc = {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: number;
};

/** E-maily porovnáváme bez ohledu na velikost písmen a mezery okolo. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  const db = await getDb();
  if (!db) return null;
  return db.collection<UserDoc>(USERS_COLLECTION).findOne({ email: normalizeEmail(email) });
}

/**
 * Ověří e-mail a heslo. Když uživatel neexistuje, stejně se spočítá hash,
 * aby se z doby odpovědi nedalo poznat, které e-maily jsou zaregistrované.
 */
export async function authenticate(email: string, password: string): Promise<UserDoc | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA");
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

/** Založí uživatele, nebo přepíše heslo, pokud už e-mail existuje. */
export async function upsertUser(email: string, password: string): Promise<"created" | "updated"> {
  const db = await getDb();
  if (!db) throw new Error("MongoDB není nakonfigurované.");

  const users = db.collection<UserDoc>(USERS_COLLECTION);
  await users.createIndex({ email: 1 }, { unique: true });

  const normalized = normalizeEmail(email);
  const passwordHash = await hashPassword(password);
  const existing = await users.findOne({ email: normalized });

  if (existing) {
    await users.updateOne({ _id: existing._id }, { $set: { passwordHash } });
    return "updated";
  }

  await users.insertOne({
    _id: new ObjectId(),
    email: normalized,
    passwordHash,
    createdAt: Date.now(),
  });
  return "created";
}
