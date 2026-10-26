import { EntryModel } from '../models/Entry.ts';
import { LocationModel } from '../models/Location.ts';
import { HttpError } from '../utils/response.ts';

export interface LocationRecord {
  id: string;
  name: string;
  isActive: boolean;
  note: string | null;
  entryCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PublicLocationRecord {
  id: string;
  name: string;
}

function toRecord(
  location: {
    _id: unknown;
    name: string;
    isActive?: boolean;
    note?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  },
  entryCount = 0,
): LocationRecord {
  return {
    id: String(location._id),
    name: location.name,
    isActive: location.isActive ?? true,
    note: location.note ?? null,
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
  const locations = await LocationModel.find().sort({ isActive: -1, name: 1 }).lean();

  return locations.map((location) =>
    toRecord(location, countByLocation.get(String(location._id)) ?? 0),
  );
}

/** Only active locations, and only the two fields the public form needs. */
export async function listActiveLocations(): Promise<PublicLocationRecord[]> {
  const locations = await LocationModel.find({ isActive: true })
    .select('name')
    .sort({ name: 1 })
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

export async function createLocation(input: {
  name: string;
  isActive?: boolean;
  note?: string | null;
}): Promise<LocationRecord> {
  const name = input.name.trim();
  if (await LocationModel.exists({ name })) {
    throw new HttpError(409, 'location_name_taken', 'A location with that name already exists.');
  }

  const location = await LocationModel.create({
    name,
    isActive: input.isActive ?? true,
    note: input.note?.trim() || null,
  });

  return toRecord(location.toObject() as never, 0);
}

export async function updateLocation(
  id: string,
  patch: { name?: string; isActive?: boolean; note?: string | null },
): Promise<LocationRecord> {
  const location = await LocationModel.findById(id);
  if (!location) {
    throw new HttpError(404, 'location_not_found', 'That location no longer exists.');
  }

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name !== location.name && (await LocationModel.exists({ name, _id: { $ne: location._id } }))) {
      throw new HttpError(409, 'location_name_taken', 'A location with that name already exists.');
    }
    location.name = name;
  }

  if (patch.isActive !== undefined) location.isActive = patch.isActive;
  if (patch.note !== undefined) location.note = patch.note?.trim() || null;

  await location.save();
  const entryCount = await EntryModel.countDocuments({ locationId: location._id });
  return toRecord(location.toObject() as never, entryCount);
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
