import { describe, expect, it } from 'vitest';
import { missingSchemaVersions } from '../src/shared/database/postgres-readiness.js';

describe('PostgreSQL runtime readiness', () => {
  it('requires every runtime migration version', () => {
    expect(missingSchemaVersions([1, 2, 3, 4, 5])).toEqual([]);
    expect(missingSchemaVersions([1, 3, 4, 5])).toEqual([2]);
    expect(missingSchemaVersions([])).toEqual([1, 2, 3, 4, 5]);
  });
});
