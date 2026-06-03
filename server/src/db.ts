import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'expense-tracker';

let client: MongoClient;
let db: Db;

export async function connectDB() {
  if (db) {
    return db;
  }

  client = new MongoClient(MONGODB_URI, {
    serverApi: '1'
  });

  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

export function getDB() {
  if (!db) {
    throw new Error('MongoDB is not initialized. Call connectDB() first.');
  }
  return db;
}
