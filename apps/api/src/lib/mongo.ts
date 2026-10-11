import { MongoClient, ObjectId } from 'mongodb';
import { config } from '../config.js';
import { AppError } from './errors.js';

// One pooled client for the whole process; the driver connects lazily on first use.
// Writes go through the native driver because Prisma's MongoDB connector needs a replica set for writes.
const client = new MongoClient(config.databaseUrl);

export const db = () => client.db();

export const closeMongo = () => client.close();

export function toObjectId(id: string, field = 'id'): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new AppError(400, 'INVALID_ID', `Invalid ${field}`);
  return new ObjectId(id);
}
