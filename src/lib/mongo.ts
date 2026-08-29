import "server-only";
import { MongoClient, type Db } from "mongodb";

/**
 * Připojení k MongoDB. Přihlašovací údaje se skládají z .env
 * (MONGODB_USER, MONGODB_PASSWORD, MONGODB_HOST, MONGODB_DATABASE)
 * a nikdy neopouštějí server – prohlížeč mluví jen s /api/state.
 */

function buildUri(): string | null {
  const user = process.env.MONGODB_USER;
  const password = process.env.MONGODB_PASSWORD;
  const host = process.env.MONGODB_HOST;
  const database = process.env.MONGODB_DATABASE;

  if (!user || !password || !host || !database) return null;

  // Host se zadává bez schématu; případné schéma v proměnné tolerujeme.
  const cleanHost = host.replace(/^mongodb(\+srv)?:\/\//, "").replace(/\/+$/, "");
  const params = new URLSearchParams({
    authSource: process.env.MONGODB_AUTH_SOURCE ?? "admin",
    tls: "true",
    retryWrites: "true",
    w: "majority",
  });

  return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${cleanHost}/${encodeURIComponent(database)}?${params}`;
}

export function isMongoConfigured(): boolean {
  return buildUri() !== null;
}

/** Který profil se ukládá. Bez přihlašování je jeden sdílený. */
export const PROFILE_ID = process.env.MONGODB_PROFILE ?? "default";

// V dev režimu se moduly při každé změně načítají znovu – bez cache by se hromadila spojení.
const globalForMongo = globalThis as unknown as {
  mongoClientPromise?: Promise<MongoClient>;
};

export async function getDb(): Promise<Db | null> {
  const uri = buildUri();
  if (!uri) return null;

  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 10,
    });
    globalForMongo.mongoClientPromise = client.connect().then(async (connected) => {
      await ensureIndexes(connected.db(process.env.MONGODB_DATABASE));
      return connected;
    });
  }

  const client = await globalForMongo.mongoClientPromise;
  return client.db(process.env.MONGODB_DATABASE);
}

/** Indexy pro dotazy podle profilu. Vytvoření je idempotentní, běží jednou při připojení. */
async function ensureIndexes(db: Db): Promise<void> {
  try {
    await Promise.all([
      db.collection(COLLECTIONS.progress).createIndex({ profileId: 1 }),
      db.collection(COLLECTIONS.sessions).createIndex({ profileId: 1, finishedAt: 1 }),
    ]);
  } catch (error) {
    // Bez indexů se to obejde, jen to bude na velkém objemu pomalejší.
    console.warn("[mongo] indexy se nepodařilo vytvořit:", error);
  }
}

export const COLLECTIONS = {
  progress: "progress",
  profiles: "profiles",
  sessions: "sessions",
} as const;
