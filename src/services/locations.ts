import { EntryModel } from '../models/Entry.ts';
import { LocationModel } from '../models/Location.ts';
import { HttpError } from '../utils/response.ts';
import { normaliseNameKey } from '../utils/text.ts';
import { normalisePostcode } from '../utils/postcode.ts';

export interface LocationRecord {
  id: string;
  name: string;
  postcode: string;
  isActive: boolean;
  sortOrder: number;
  entryCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PublicLocationRecord {
  id: string;
  name: string;
}

interface LocationLike {
  _id: unknown;
  name: string;
  postcode: string;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

function toRecord(location: LocationLike, entryCount = 0): LocationRecord {
  return {
    id: String(location._id),
    name: location.name,
    postcode: location.postcode,
    isActive: location.isActive ?? true,
    sortOrder: location.sortOrder ?? 0,
    entryCount,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
  };
}

/** All locations for the admin page, with their entry counts. */
export async function listLocations(): Promise<LocationRecord[]> {
  const counts = await EntryModel.aggregate<{ _id: unknown; count: number }>([
    { $group: { _id: '$locationId', count: { $sum: 1 } } },
  ]);
  const countByLocation = new Map(counts.map((entry) => [String(entry._id), entry.count]));
  const locations = await LocationModel.find()
    .sort({ isActive: -1, sortOrder: 1, name: 1 })
    .lean();

  return locations.map((location) =>
    toRecord(location, countByLocation.get(String(location._id)) ?? 0),
  );
}

/**
 * Active locations for the public form: id and name only, ordered by the
 * administrator's sort order and then by name. No postcode, no counts.
 */
export async function listActiveLocations(): Promise<PublicLocationRecord[]> {
  const locations = await LocationModel.find({ isActive: true })
    .select('name')
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  return locations.map((location) => ({ id: String(location._id), name: location.name }));
}

export async function getActiveLocation(id: string) {
  const location = await LocationModel.findOne({ _id: id, isActive: true }).lean();
  if (!location) {
    throw new HttpError(422, 'invalid_location', 'Choose an active location.');
  }
  return location;
}

interface LocationInput {
  name: string;
  postcode: string;
  isActive?: boolean;
  sortOrder?: number;
}

/** Refuse a duplicate (name, postcode) pair, ignoring case and spacing. */
async function assertLocationIsUnique(
  name: string,
  postcode: string,
  excludeId?: unknown,
): Promise<void> {
  const match: Record<string, unknown> = {
    nameKey: normaliseNameKey(name),
    postcode: normalisePostcode(postcode),
  };
  if (excludeId) match._id = { $ne: excludeId };

  if (await LocationModel.exists(match)) {
    throw new HttpError(
      409,
      'location_exists',
      'A location with that name and postcode already exists.',
    );
  }
}

export async function createLocation(
  input: LocationInput,
  createdBy: string,
): Promise<LocationRecord> {
  const name = input.name.trim();
  const postcode = normalisePostcode(input.postcode);
  await assertLocationIsUnique(name, postcode);

  const location = await LocationModel.create({
    name,
    postcode,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
    createdBy,
  });

  return toRecord(location.toObject() as LocationLike, 0);
}

export async function updateLocation(
  id: string,
  patch: Partial<LocationInput>,
  updatedBy: string,
): Promise<LocationRecord> {
  const location = await LocationModel.findById(id);
  if (!location) {
    throw new HttpError(404, 'location_not_found', 'That location no longer exists.');
  }

  const name = patch.name?.trim() ?? location.name;
  const postcode = normalisePostcode(patch.postcode ?? location.postcode);

  if (name !== location.name || postcode !== location.postcode) {
    await assertLocationIsUnique(name, postcode, location._id);
  }

  location.name = name;
  location.postcode = postcode;
  if (patch.isActive !== undefined) location.isActive = patch.isActive;
  if (patch.sortOrder !== undefined) location.sortOrder = patch.sortOrder;
  location.updatedBy = updatedBy as never;

  await location.save();
  const entryCount = await EntryModel.countDocuments({ locationId: location._id });
  return toRecord(location.toObject() as LocationLike, entryCount);
}

/** A location with history is deactivated instead of deleted. */
export async function deleteLocation(id: string): Promise<{ deleted: boolean }> {
  const location = await LocationModel.findById(id);
  if (!location) {
    throw new HttpError(404, 'location_not_found', 'That location no longer exists.');
  }

  const entryCount = await EntryModel.countDocuments({ locationId: location._id });
  if (entryCount > 0) {
    throw new HttpError(
      409,
      'location_has_entries',
      'This location has entries and cannot be deleted. Deactivate it instead.',
    );
  }

  await location.deleteOne();
  return { deleted: true };
}
