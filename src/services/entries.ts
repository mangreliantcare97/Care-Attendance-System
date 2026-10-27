import { Types } from 'mongoose';
import { env } from '../config/env.ts';
import {
  EntryModel,
  NOT_DELETED,
  type EntryDirection,
  type EntryUserType,
} from '../models/Entry.ts';
import { getActiveLocation } from './locations.ts';
import { resolveEntryDate } from '../utils/entryTime.ts';
import { normaliseNameKey } from '../utils/text.ts';
import { HttpError } from '../utils/response.ts';
import { pageMeta, parsePagination, type PaginationMeta } from '../utils/pagination.ts';

/** How long the duplicate guard looks back. */
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;

export interface PublicEntryInput {
  userType: EntryUserType;
  name: string;
  direction: EntryDirection;
  time: string;
  locationId: string;
  notes: string;
}

export interface PublicEntryResult {
  id: string;
  name: string;
  direction: EntryDirection;
  time: string;
  date: string;
}

/**
 * Record one public check-in or check-out.
 *
 * The location must exist and be active, the calendar day comes from the
 * server clock in `APP_TIMEZONE`, and a repeat of the same person, direction
 * and location within two minutes is refused as a duplicate.
 */
export async function createPublicEntry(
  input: PublicEntryInput,
  options: { now?: Date } = {},
): Promise<PublicEntryResult> {
  const now = options.now ?? new Date();
  const location = await getActiveLocation(input.locationId);
  const date = resolveEntryDate(input.time, now, env.appTimezone);
  const name = input.name.trim();
  const nameKey = normaliseNameKey(name);

  const duplicate = await EntryModel.exists({
    ...NOT_DELETED,
    userType: input.userType,
    nameKey,
    direction: input.direction,
    locationId: location._id,
    receivedAt: { $gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
  });

  if (duplicate) {
    throw new HttpError(
      409,
      'duplicate_entry',
      'This has already been recorded a moment ago. Please wait a minute before submitting again.',
    );
  }

  const entry = await EntryModel.create({
    userType: input.userType,
    name,
    direction: input.direction,
    enteredTime: input.time,
    date,
    receivedAt: now,
    locationId: location._id,
    notes: input.notes.trim(),
  });

  return {
    id: String(entry._id),
    name: entry.name,
    direction: entry.direction,
    time: entry.enteredTime,
    date: entry.date,
  };
}

interface EntryRow {
  _id: unknown;
  userType: EntryUserType;
  name: string;
  direction: EntryDirection;
  enteredTime: string;
  date: string;
  receivedAt: Date;
  notes: string;
  location?: { _id: unknown; name: string; postcode: string } | null;
}

export interface EntryRecord {
  id: string;
  userType: EntryUserType;
  name: string;
  direction: EntryDirection;
  enteredTime: string;
  date: string;
  receivedAt: Date;
  notes: string;
  location: { id: string; name: string; postcode: string } | null;
}

/** The newest non-deleted entries for the admin page. */
export async function listEntries(options: {
  page?: unknown;
  perPage?: unknown;
  locationId?: string;
}): Promise<{ entries: EntryRecord[]; meta: PaginationMeta }> {
  const pagination = parsePagination(options);
  const match: Record<string, unknown> = { ...NOT_DELETED };
  if (options.locationId) match.locationId = options.locationId;

  const [rows, total] = await Promise.all([
    EntryModel.aggregate<EntryRow>([
      { $match: match },
      { $sort: { date: -1, enteredTime: -1, _id: -1 } },
      { $skip: pagination.skip },
      { $limit: pagination.limit },
      {
        $lookup: {
          from: 'locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'location',
        },
      },
      { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          userType: 1,
          name: 1,
          direction: 1,
          enteredTime: 1,
          date: 1,
          receivedAt: 1,
          notes: 1,
          location: { _id: '$location._id', name: '$location.name', postcode: '$location.postcode' },
        },
      },
    ]),
    EntryModel.countDocuments(match),
  ]);

  return {
    entries: rows.map((row) => ({
      id: String(row._id),
      userType: row.userType,
      name: row.name,
      direction: row.direction,
      enteredTime: row.enteredTime,
      date: row.date,
      receivedAt: row.receivedAt,
      notes: row.notes,
      location: row.location?._id
        ? { id: String(row.location._id), name: row.location.name, postcode: row.location.postcode }
        : null,
    })),
    meta: pageMeta(total, pagination),
  };
}

/** A single non-deleted entry, or null. */
export async function getEntry(id: string): Promise<EntryRecord | null> {
  if (!Types.ObjectId.isValid(id)) return null;

  const rows = await EntryModel.aggregate<EntryRow>([
    { $match: { _id: new Types.ObjectId(id), ...NOT_DELETED } },
    {
      $lookup: {
        from: 'locations',
        localField: 'locationId',
        foreignField: '_id',
        as: 'location',
      },
    },
    { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        userType: 1,
        name: 1,
        direction: 1,
        enteredTime: 1,
        date: 1,
        receivedAt: 1,
        notes: 1,
        location: { _id: '$location._id', name: '$location.name', postcode: '$location.postcode' },
      },
    },
  ]);

  const row = rows[0];
  if (!row) return null;

  return {
    id: String(row._id),
    userType: row.userType,
    name: row.name,
    direction: row.direction,
    enteredTime: row.enteredTime,
    date: row.date,
    receivedAt: row.receivedAt,
    notes: row.notes,
    location: row.location?._id
      ? { id: String(row.location._id), name: row.location.name, postcode: row.location.postcode }
      : null,
  };
}
