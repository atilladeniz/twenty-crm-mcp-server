# Changelog

## 0.2.0
- Added automatic schema discovery (uses `./schema` export by default, still respects `SCHEMA_PATH`)
- Generate CRUD tools dynamically from exported metadata, including required fields and defaults
- Added helper tools for metadata inspection and GraphQL operation listings
- Improved payload sanitization and filtering for list operations
- Fallback registry keeps core CRUD tools available even without local schema files
- Schema changes auto-reload without restart and enrich complex field schemas (addresses, currency, full name, relations, etc.)
- Relation fields now map to convenient `*Id`/`*Ids` aliases so cross-object links (e.g., person → company) work seamlessly
- Better error reporting with HTTP details, pagination summaries on list responses, and weighted multi-object search support

## 0.1.0
- Initial release with manual tool definitions for core Twenty CRM objects
