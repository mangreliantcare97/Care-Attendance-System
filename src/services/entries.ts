import { EntryModel, type EntryDirection } from '../models/Entry.ts';
import { getActiveLocation } from './locations.ts';
import { pageMeta, parsePagination, type PaginationMeta } from '../utils/pagination.ts';

export interface EntryRecord {
  id: string;
  name: string;
  direction: EntryDirection;
  occurredAt: Date;
  location: { id: string; name: string } | null;
}

/** Create one public check-in/out after confirming the location is active. */
export async function createEntry(input: {
  name: string;
  locationId: string;
  direction: EntryDirection;
}): Promise<EntryRecord> {
  const location = await getActiveLocation(input.locationId);
  const entry = await EntryModel.create({
    name: input.name.trim(),
    locationId: location._id,
    direction: input.direction,
  });

  return {
    id: String(entry._id),
    name: entry.name,
    direction: entry.direction,
    occurredAt: entry.occurredAt,
    location: { id: String(location._id), name: location.name },
  };
}

interface EntryRow {
  _id: unknown;
  name: string;
  direction: EntryDirection;
  occurredAt: Date;
  location?: { _id: unknown; name: string } | null;
}

/** The newest entries for the admin page. */
export async function listEntries(options: {
  page?: unknown;
  perPage?: unknown;
  locationId?: string;
}): Promise<{ entries: EntryRecord[]; meta: PaginationMeta }> {
  const pagination = parsePagination(options);
  const match = options.locationId ? { locationId: options.locationId } : {};

  const [rows, total] = await Promise.all([
    EntryModel.aggregate<EntryRow>([
      { $match: match },
      { $sort: { occurredAt: -1, _id: -1 } },
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
          name: 1,
          direction: 1,
          occurredAt: 1,
          location: { _id: '$location._id', name: '$location.name' },
        },
      },
    ]),
    EntryModel.countDocuments(match),
  ]);

  return {
    entries: rows.map((row) => ({
      id: String(row._id),
      name: row.name,
      direction: row.direction,
      occurredAt: row.occurredAt,
      location: row.location?._id
        ? { id: String(row.location._id), name: row.location.name }
        : null,
    })),
    meta: pageMeta(total, pagination),
  };
}
