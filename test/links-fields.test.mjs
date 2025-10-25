import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.TWENTY_API_KEY ??= 'test-token';
process.env.TWENTY_BASE_URL ??= 'https://api.example.com';
process.env.SCHEMA_PATH = join(__dirname, '..', 'schema');

const { TwentyCRMServer } = await import('../index.js');

test('normalizeLinksValue converts string URL to LINKS structure', () => {
  const server = new TwentyCRMServer({ quiet: true });

  const normalized = server.normalizeLinksValue('https://example.com');

  assert.equal(normalized.primaryLinkUrl, 'https://example.com');
  assert.equal(normalized.primaryLinkLabel, '');
  assert.equal(normalized.secondaryLinks, null);
});

test('normalizeLinksValue preserves existing LINKS structure', () => {
  const server = new TwentyCRMServer({ quiet: true });

  const input = {
    primaryLinkUrl: 'https://example.com',
    primaryLinkLabel: 'Example',
    secondaryLinks: [{ url: 'https://example2.com', label: 'Example 2' }]
  };

  const normalized = server.normalizeLinksValue(input);

  assert.deepEqual(normalized, input);
});

test('sanitizePayload normalizes LINKS fields for companies', () => {
  const server = new TwentyCRMServer({ quiet: true });
  const companySchema = server.objectSchemas.get('companies');
  assert(companySchema, 'companies schema not registered');

  // Test with simple string URL
  const sanitized = server.sanitizePayload({
    name: 'Test Company',
    domainName: 'https://testcompany.com'
  }, companySchema);

  assert.equal(sanitized.name, 'Test Company');
  assert.equal(sanitized.domainName.primaryLinkUrl, 'https://testcompany.com');
  assert.equal(sanitized.domainName.primaryLinkLabel, '');
  assert.equal(sanitized.domainName.secondaryLinks, null);
});

test('sanitizePayload handles LinkedIn link as string', () => {
  const server = new TwentyCRMServer({ quiet: true });
  const companySchema = server.objectSchemas.get('companies');

  const sanitized = server.sanitizePayload({
    name: 'Test Company',
    linkedinLink: 'https://linkedin.com/company/test'
  }, companySchema);

  assert.equal(sanitized.linkedinLink.primaryLinkUrl, 'https://linkedin.com/company/test');
});
