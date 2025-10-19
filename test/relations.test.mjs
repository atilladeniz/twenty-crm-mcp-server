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

test('create_note_for_person orchestrates note and link creation', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, method: options.method, body });

    if (url.endsWith('/rest/notes')) {
      return new Response(JSON.stringify({ data: { id: 'note-xyz' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url.endsWith('/rest/noteTargets')) {
      return new Response(JSON.stringify({ data: { id: 'target-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  };

  try {
    const server = new TwentyCRMServer({ quiet: true });
    const handler = server.globalToolHandlers.get('create_note_for_person');
    assert(handler, 'create_note_for_person handler missing');

    const result = await handler({
      personId: 'person-123',
      note: { title: 'Follow up', bodyV2: 'Call tomorrow' },
      companyId: 'company-456'
    });

    assert.equal(calls.length, 3, 'expected three API calls');
    const [noteCall, personLinkCall, companyLinkCall] = calls;
    assert.equal(noteCall.method, 'POST');
    assert.ok(noteCall.url.endsWith('/rest/notes'));
    assert.equal(noteCall.body.title, 'Follow up');

    assert.equal(personLinkCall.method, 'POST');
    assert.ok(personLinkCall.url.endsWith('/rest/noteTargets'));
    assert.equal(personLinkCall.body.noteId, 'note-xyz');
    assert.equal(personLinkCall.body.personId, 'person-123');
    assert.ok(!('companyId' in personLinkCall.body));

    assert.equal(companyLinkCall.method, 'POST');
    assert.ok(companyLinkCall.url.endsWith('/rest/noteTargets'));
    assert.equal(companyLinkCall.body.noteId, 'note-xyz');
    assert.equal(companyLinkCall.body.companyId, 'company-456');

    assert.ok(result.content[0].text.includes('note-xyz'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
