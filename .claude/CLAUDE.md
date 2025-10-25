# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Twenty CRM MCP Server is a Model Context Protocol (MCP) server that connects Twenty CRM with Claude and other AI assistants. It enables natural language interactions with CRM data through dynamically generated CRUD tools.

**Key Features:**
- Dynamic schema discovery from Twenty CRM exports
- Automatic CRUD tool generation for all active objects
- Live schema reloading without server restart
- Relation field aliasing (e.g., `companyId` instead of nested objects)
- Advanced search across multiple object types
- GraphQL operation introspection

## Development Commands

### Run the server
```bash
node index.js
```

### Run with logging options
```bash
# Quiet mode (suppress schema reload logs)
node index.js --quiet
# OR
MCP_LOG_LEVEL=quiet node index.js

# Verbose mode (extra debug info)
node index.js --verbose
# OR
MCP_LOG_LEVEL=verbose node index.js
```

### Testing
```bash
# Run all tests
npm test

# Run tests with node's test runner directly
node --test
```

### Install dependencies
```bash
npm install
```

## Architecture

### Core Components

**index.js - TwentyCRMServer class**
- Main MCP server implementation using `@modelcontextprotocol/sdk`
- Handles tool registration, request routing, and HTTP communication with Twenty CRM REST API
- Implements CRUD operations (create, get, update, list, delete) for all active objects
- Manages dynamic schema registry with alias resolution
- Provides specialized tools: `search_records`, `create_note_for_person`, metadata inspection tools

**schema-loader.js - SchemaLoader class**
- Loads and parses Twenty CRM schema exports from `./schema` directory
- Watches `rest-metadata-objects.json` and `available-operations.json` for changes
- Generates JSON Schema tool definitions from Twenty field metadata
- Maps Twenty field types to JSON Schema types with proper constraints
- Creates relation field aliases (`companyId`, `noteTargetsIds`, etc.)

### Schema Discovery Flow

1. **Initialization**: SchemaLoader attempts to load from `./schema` directory (or `SCHEMA_PATH` env var)
2. **Metadata Parsing**: Parses `rest-metadata-objects.json` to discover active objects and fields
3. **Schema Generation**: For each active object, generates:
   - Properties map with proper types, descriptions, and validations
   - Required fields list (non-nullable fields without defaults)
   - Relation metadata with cardinality and target info
   - Friendly relation aliases (e.g., `company` relation → `companyId` alias)
4. **Tool Registration**: Creates 5 CRUD tools per object (create, get, update, list, delete)
5. **Live Reload**: On each tool request, checks file modification times and reloads if changed

### Relation Handling

The server transforms relation fields to provide a better API experience:

**Many-to-One / One-to-One relations:**
- Original: `{ company: { id: "abc" } }`
- Alias: `companyId: "abc"` (string)

**One-to-Many / Many-to-Many relations:**
- Original: `{ noteTargets: [{ id: "x" }, { id: "y" }] }`
- Alias: `noteTargetsIds: ["x", "y"]` (array of strings)

The `sanitizePayload` method in index.js:714-767 handles bidirectional conversion, accepting either format.

### Error Handling

`HttpError` class (index.js:14-25) captures full HTTP response details. The `getErrorHint` method (index.js:963-985) provides contextual hints for common HTTP status codes (400, 401, 404, 422, 429, 500).

### Special Tools

**create_note_for_person** (index.js:1128-1182)
- Orchestrates note creation + noteTarget link creation in a single call
- Accepts `personId`, `note` object, optional `companyId`, and `targets` array
- Creates note first, then creates noteTarget records for each target
- Deduplicates targets to avoid duplicate links

**search_records** (index.js:1280-1333)
- Multi-object search with weighted prioritization
- Accepts array of strings or objects with `{ name, limit, weight }`
- Higher weight = searched first
- Returns results keyed by object type with error details for failures

## Schema Export Structure

The `./schema` directory contains:
- **rest-metadata-objects.json**: Complete object and field metadata from Twenty CRM
- **available-operations.json**: GraphQL introspection query results (queries/mutations)
- **core-objects/**: Individual JSON files for core objects (person, company, task, etc.)

The server prefers local schema files but falls back to API metadata endpoints if unavailable.

## Environment Variables

**Required:**
- `TWENTY_API_KEY`: Twenty CRM API key (from Settings → API & Webhooks)

**Optional:**
- `TWENTY_BASE_URL`: Twenty CRM instance URL (default: `https://api.twenty.com`)
- `SCHEMA_PATH`: Custom schema export directory path (default: `./schema`)
- `MCP_LOG_LEVEL`: Logging verbosity (`quiet`, `verbose`)

## Testing Strategy

Tests use Node's built-in test runner (`node:test`) with fixtures. See `test/relations.test.mjs`:

- **Schema generation tests**: Verify relation aliases are created correctly
- **Payload sanitization tests**: Ensure relation objects are normalized to ID/Ids aliases
- **Integration tests**: Mock `globalThis.fetch` to test end-to-end tool orchestration

When writing new tests:
- Set `TWENTY_API_KEY` and `TWENTY_BASE_URL` to test values
- Point `SCHEMA_PATH` to the fixture schema directory
- Mock fetch for HTTP tests to avoid external dependencies
- Use `{ quiet: true }` option when instantiating TwentyCRMServer to suppress logs

## Key Design Patterns

**Fallback Registry**: If schema files are missing, the server registers tools for core objects (people, companies, notes, tasks, opportunities, noteTargets) with minimal schemas to keep basic functionality available.

**Clone Schema Utility** (index.js:35-47): Deep clones objects using `structuredClone` when available, falling back to JSON serialization. Used to prevent mutation of cached schemas.

**Alias Resolution** (index.js:714-731): The `resolveObject` method normalizes input (plural/singular/label) to a canonical plural key, allowing flexible object name references.

**Pagination Extraction** (index.js:1447-1477): Adaptively extracts pagination metadata from various response formats (pageInfo, meta, top-level keys).

## Common Modification Scenarios

**Adding a new field type mapping:**
1. Add the Twenty field type to `mapFieldType` in schema-loader.js:466-498
2. If complex (like ADDRESS, CURRENCY), add structured schema in `buildFieldProperty` (schema-loader.js:239-396)

**Adding a new specialized tool:**
1. Define the tool schema in `buildGlobalTools` (index.js:457-592)
2. Register handler in `globalToolHandlers` Map (index.js:83-90)
3. Implement handler method following the pattern of `createNoteForPerson`

**Modifying CRUD behavior:**
1. Edit `handleCRUDOperation` (index.js:625-712)
2. Update `sanitizePayload` if payload transformation is needed
3. Adjust `buildListPayload` for list operation response formatting

**Changing relation alias format:**
1. Modify `getRelationAlias` in schema-loader.js:500-526
2. Update tests in test/relations.test.mjs to match new format
