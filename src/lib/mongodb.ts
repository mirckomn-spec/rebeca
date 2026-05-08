import "server-only";
import { MongoClient } from "mongodb";

const globalWithMongo = global as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

function getMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Defina MONGODB_URI nas variaveis de ambiente.");
  }
  return uri;
}

/**
 * Reutiliza um único MongoClient e uma única promise de connect por instância
 * warm do runtime (Netlify Functions / Node). Em produção isso evita criar
 * cliente novo a cada invocação e esgotar o pool do Atlas.
 */
function getMongoClientPromise(): Promise<MongoClient> {
  if (!globalWithMongo.mongoClientPromise) {
    const client = new MongoClient(getMongoUri(), {
      serverSelectionTimeoutMS: 15_000,
      maxPoolSize: 10,
    });
    globalWithMongo.mongoClientPromise = client.connect().catch((err) => {
      globalWithMongo.mongoClientPromise = undefined;
      throw err;
    });
  }
  return globalWithMongo.mongoClientPromise;
}

export async function getDb() {
  const client = await getMongoClientPromise();
  return client.db(process.env.MONGODB_DB_NAME ?? "hots");
}

export async function getDbSafe() {
  try {
    const db = await getDb();
    return { db, error: null as string | null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao conectar no MongoDB.";
    return { db: null, error: message };
  }
}

/** Produção (ex.: Vercel) exige MongoDB; não há fallback em disco. */
export class MongoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MongoUnavailableError";
  }
}

export async function getDbRequired() {
  const { db, error } = await getDbSafe();
  if (!db) {
    throw new MongoUnavailableError(
      error ?? "MongoDB indisponivel. Defina MONGODB_URI e verifique a rede.",
    );
  }
  return db;
}
