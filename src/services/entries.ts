import { Types, type PipelineStage } from 'mongoose';
import { env } from '../config/env.ts';
import {
  EntryModel,
  NOT_DELETED,
  type EntryDirection,
  type EntryUserType,
} from '../models/Entry.ts';
import { LocationModel } from '../models/Location.ts';
import { getActiveLocation } from './locations.ts';
import { resolveEntryDate } from '../utils/entryTime.ts';
import { normaliseNameKey } from '../utils/text.ts';
import { HttpError } from '../utils/response.ts';
import { pageMeta, parsePagination, type PaginationMeta } from '../utils/pagination.ts';
import { isDateString } from '../utils/dates.ts';

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

export type EntrySortField =
  | 'date'
  | 'time'
  | 'name'
  | 'userType'
  | 'direction'
  | 'location'
  | 'receivedAt';

export interface EntryListOptions {
  page?: unknown;
  perPage?: unknown;
  search?: string;
  userType?: EntryUserType;
  direction?: EntryDirection;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: EntrySortField;
  order?: 'asc' | 'desc';
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function entryMatch(options: EntryListOptions): PipelineStage.Match['$match'] {
  const match: PipelineStage.Match['$match'] = { ...NOT_DELETED };
  if (options.locationId) match.locationId = new Types.ObjectId(options.locationId);
  if (options.userType) match.userType = options.userType;
  if (options.direction) match.direction = options.direction;
  if (options.dateFrom || options.dateTo) {
    match.date = {
      ...(options.dateFrom ? { $gte: options.dateFrom } : {}),
      ...(options.dateTo ? { $lte: options.dateTo } : {}),
    };
  }
  const search = options.search?.trim();
  if (search) match.name = { $regex: escapeRegex(search), $options: 'i' };
  return match;
}

function entrySort(options: EntryListOptions): PipelineStage.Sort['$sort'] {
  const direction: 1 | -1 = options.order === 'asc' ? 1 : -1;
  const sortFields: Record<EntrySortField, string> = {
    date: 'date',
    time: 'enteredTime',
    name: 'name',
    userType: 'userType',
    direction: 'direction',
    location: 'location.name',
    receivedAt: 'receivedAt',
  };
  const field = sortFields[options.sort ?? 'date'];
  const sort: PipelineStage.Sort['$sort'] = { [field]: direction };
  if (field !== 'date') sort.date = -1;
  if (field !== 'enteredTime') sort.enteredTime = -1;
  sort._id = -1;
  return sort;
}

function joinedEntryPipeline(
  match: PipelineStage.Match['$match'],
  sort: PipelineStage.Sort['$sort'],
): PipelineStage[] {
  return [
    { $match: match },
    {
      $lookup: {
        from: 'locations',
        localField: 'locationId',
        foreignField: '_id',
        as: 'location',
      },
    },
    { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
    { $sort: sort },
  ];
}

function toEntryRecord(row: EntryRow): EntryRecord {
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

/** Filtered, sorted and paginated non-deleted entries for the admin page. */
export async function listEntries(
  options: EntryListOptions = {},
): Promise<{ entries: EntryRecord[]; meta: PaginationMeta }> {
  const pagination = parsePagination(options);
  const match = entryMatch(options);

  const [rows, total] = await Promise.all([
    EntryModel.aggregate<EntryRow>([
      ...joinedEntryPipeline(match, entrySort(options)),
      { $skip: pagination.skip },
      { $limit: pagination.limit },
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
    entries: rows.map(toEntryRecord),
    meta: pageMeta(total, pagination),
  };
}

/** All matching rows for a server-side CSV export. */
export async function exportEntries(options: EntryListOptions = {}): Promise<EntryRecord[]> {
  const rows = await EntryModel.aggregate<EntryRow>([
    ...joinedEntryPipeline(entryMatch(options), entrySort(options)),
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
  return rows.map(toEntryRecord);
}

/** A single non-deleted entry. */
export async function getEntry(id: string): Promise<EntryRecord> {
  if (!Types.ObjectId.isValid(id)) {
    throw new HttpError(404, 'entry_not_found', 'That entry no longer exists.');
  }

  const rows = await EntryModel.aggregate<EntryRow>([
    ...joinedEntryPipeline(
      { _id: new Types.ObjectId(id), ...NOT_DELETED },
      { _id: -1 },
    ),
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
  if (!row) {
    throw new HttpError(404, 'entry_not_found', 'That entry no longer exists.');
  }

  return toEntryRecord(row);
}

export interface EntryUpdateInput {
  userType?: EntryUserType;
  name?: string;
  direction?: EntryDirection;
  enteredTime?: string;
  date?: string;
  locationId?: string;
  notes?: string;
}

/** Update an entry without changing its original server receipt timestamp. */
export async function updateEntry(
  id: string,
  patch: EntryUpdateInput,
  actingAdminId: string,
): Promise<EntryRecord> {
  if (!Types.ObjectId.isValid(id)) {
    throw new HttpError(404, 'entry_not_found', 'That entry no longer exists.');
  }

  const entry = await EntryModel.findOne({ _id: id, ...NOT_DELETED });
  if (!entry) {
    throw new HttpError(404, 'entry_not_found', 'That entry no longer exists.');
  }

  if (patch.locationId !== undefined) {
    const location = await LocationModel.findById(patch.locationId).select('_id').lean();
    if (!location) {
      throw new HttpError(422, 'validation_error', 'Choose an existing location.', [
        { path: 'locationId', message: 'Choose an existing location.' },
      ]);
    }
    entry.locationId = new Types.ObjectId(patch.locationId);
  }
  if (patch.userType !== undefined) entry.userType = patch.userType;
  if (patch.name !== undefined) entry.name = patch.name.trim();
  if (patch.direction !== undefined) entry.direction = patch.direction;
  if (patch.enteredTime !== undefined) entry.enteredTime = patch.enteredTime;
  if (patch.date !== undefined) {
    if (!isDateString(patch.date)) {
      throw new HttpError(422, 'validation_error', 'Enter a valid calendar date.', [
        { path: 'date', message: 'Enter a valid calendar date.' },
      ]);
    }
    entry.date = patch.date;
  }
  if (patch.notes !== undefined) entry.notes = patch.notes.trim();
  entry.updatedBy = new Types.ObjectId(actingAdminId);

  await entry.save();
  return getEntry(id);
}

/** Soft-delete an entry so the audit history is retained. */
export async function deleteEntry(id: string, actingAdminId: string): Promise<{ deleted: true }> {
  if (!Types.ObjectId.isValid(id)) {
    throw new HttpError(404, 'entry_not_found', 'That entry no longer exists.');
  }
  const result = await EntryModel.updateOne(
    { _id: id, ...NOT_DELETED },
    { $set: { deletedAt: new Date(), deletedBy: new Types.ObjectId(actingAdminId) } },
  );
  if (result.modifiedCount !== 1) {
    throw new HttpError(404, 'entry_not_found', 'That entry no longer exists.');
  }
  return { deleted: true };
}
