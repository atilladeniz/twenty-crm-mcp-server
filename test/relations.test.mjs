import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.TWENTY_API_KEY ??= 'test-token';
process.env.TWENTY_BASE_URL ??= 'https://api.example.com';
process.env.SCHEMA_PATH = join(__dirname, '..', 'schema');

const { SchemaLoader } = await import('../schema-loader.js');
const { TwentyCRMServer } = await import('../index.js');

test('people schema exposes companyId alias', async () => {
  const loader = new SchemaLoader({ schemaPath: process.env.SCHEMA_PATH });
  assert.ok(loader.loadSchemas({ force: true }), 'Failed to load schemas');

  const schema = loader.generateToolSchema('people');
  assert.ok(schema.properties.companyId, 'companyId alias missing');
  const relation = schema.relationMetadata.find((rel) => rel.name === 'company');
  assert.equal(relation?.alias, 'companyId');
});

test('noteTargets schema exposes noteId and personId aliases', async () => {
  const loader = new SchemaLoader({ schemaPath: process.env.SCHEMA_PATH });
  loader.loadSchemas({ force: true });

  const schema = loader.generateToolSchema('noteTargets');
  assert.ok(schema, 'noteTargets schema missing');
  assert.ok(schema.properties.noteId, 'noteId alias missing');
  assert.ok(schema.properties.personId, 'personId alias missing');
});

test('sanitizePayload maps relation objects to *_Id aliases', () => {
  const server = new TwentyCRMServer({ quiet: true });
  const peopleSchema = server.objectSchemas.get('people');
  assert(peopleSchema, 'people schema not registered');

  const sanitized = server.sanitizePayload({
    company: { id: 'company-123' },
    noteTargets: [{ id: 'nt-1' }, 'nt-2']
  }, peopleSchema);

  assert.equal(sanitized.companyId, 'company-123');
  assert.deepEqual(sanitized.noteTargetsIds, ['nt-1', 'nt-2']);
});

test('sanitizePayload handles noteTarget creation payloads', () => {
  const server = new TwentyCRMServer({ quiet: true });
  const noteTargetSchema = server.objectSchemas.get('notetargets');
  assert(noteTargetSchema, 'noteTargets schema not registered');

  const sanitized = server.sanitizePayload({
    note: { id: 'note-1' },
    personId: 'person-1'
  }, noteTargetSchema);

  assert.equal(sanitized.noteId, 'note-1');
  assert.equal(sanitized.personId, 'person-1');
});
