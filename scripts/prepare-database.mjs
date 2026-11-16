import nextEnv from "@next/env";
import { MongoClient } from "mongodb";

nextEnv.loadEnvConfig(process.cwd());
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Set MONGODB_URI in .env.local before preparing the database.");

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db("bookified");
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((collection) => collection.name));
  for (const name of ["books", "booksegments", "voicesessions"]) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      console.log(`Created ${db.databaseName}.${name}`);
    } else console.log(`Already exists: ${db.databaseName}.${name}`);
  }
  console.log("Database ready. Existing records were preserved.");
} catch (error) {
  // Connection errors may contain credentials or topology details; keep console output safe.
  console.error(`Database preparation failed (${error instanceof Error ? error.name : "unknown error"}). Check credentials, Atlas network access, and MONGODB_URI.`);
  process.exitCode = 1;
} finally {
  await client.close();
}
