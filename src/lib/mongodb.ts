import "server-only";
import { MongoClient, ServerApiVersion } from "mongodb";

const globalWithMongo = global as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  let v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function getMongoUri() {
  const uri = cleanEnv(process.env.MONGODB_URI);
  if (!uri) {
    throw new Error("Defina MONGODB_URI nas variaveis de ambiente.");
  }
  return uri;
}

function getMongoDbName() {
  const name = cleanEnv(process.env.MONGODB_DB_NAME);
  return name.length > 0 ? name : "hots";
}

function createClient() {
  return new MongoClient(getMongoUri(), {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    serverSelectionTimeoutMS: 20_000,
    connectTimeoutMS: 20_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 1,
    minPoolSize: 0,
    maxIdleTimeMS: 10_000,
    retryWrites: true,
    retryReads: true,
  });
}

function resetMongoClientCache() {
  globalWithMongo.mongoClientPromise = undefined;
}

async function connectMongoClient(): Promise<MongoClient> {
  const client = createClient();
  await client.connect();
  await client.db(getMongoDbName()).command({ ping: 1 });
  return client;
}

function getMongoClientPromise(): Promise<MongoClient> {
  if (!globalWithMongo.mongoClientPromise) {
    globalWithMongo.mongoClientPromise = connectMongoClient().catch((err) => {
      resetMongoClientCache();
      throw err;
    });
  }
  return globalWithMongo.mongoClientPromise;
}

export async function getDb() {
  const client = await getMongoClientPromise();
  return client.db(getMongoDbName());
}

export async function getDbSafe() {
  try {
    const db = await getDb();
    return { db, error: null as string | null };
  } catch (firstError) {
    resetMongoClientCache();
    try {
      const db = await getDb();
      return { db, error: null as string | null };
    } catch (secondError) {
      const message =
        secondError instanceof Error
          ? secondError.message
          : firstError instanceof Error
            ? firstError.message
            : "Falha ao conectar no MongoDB.";
      return { db: null, error: message };
    }
  }
}

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
