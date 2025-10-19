#!/usr/bin/env node

import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SchemaLoader } from "./schema-loader.js";

class HttpError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "HttpError";
    this.status = details.status;
    this.statusText = details.statusText;
    this.body = details.body;
    this.endpoint = details.endpoint;
    this.method = details.method;
    this.headers = details.headers;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const defaultSchemaPath = join(__dirname, "schema");
if (!process.env.SCHEMA_PATH && existsSync(defaultSchemaPath)) {
  process.env.SCHEMA_PATH = defaultSchemaPath;
}

class TwentyCRMServer {
  constructor() {
    this.server = new Server(
      {
        name: "twenty-crm",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.apiKey = process.env.TWENTY_API_KEY;
    this.baseUrl = process.env.TWENTY_BASE_URL || "https://api.twenty.com";

    if (!this.apiKey) {
      throw new Error("TWENTY_API_KEY environment variable is required");
    }

    this.schemaLoader = new SchemaLoader();
    const loaded = this.schemaLoader.loadSchemas();
    if (!loaded) {
      console.error("Warning: Could not load schemas, using fallback mode");
    }

    this.objectSchemas = new Map();
    this.objectAliases = new Map();
    this.supportedObjects = [];

    this.rebuildRegistry();

    this.globalToolHandlers = new Map([
      ["get_metadata_objects", async () => this.getMetadataObjects()],
      ["get_object_metadata", async (args = {}) => this.getObjectMetadata(args.objectName)],
      ["get_local_object_schema", async (args = {}) => this.getLocalObjectSchema(args.objectName)],
      ["get_available_operations", async (args = {}) => this.getAvailableOperations(args)],
      ["search_records", async (args = {}) => this.searchRecords(args)]
    ]);

    this.setupToolHandlers();
  }

  async makeRequest(endpoint, method = "GET", data = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    };

    if (data && ["POST", "PUT", "PATCH"].includes(method)) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorBodyText = await response.text();
        let parsedBody = null;

        if (errorBodyText) {
          try {
            parsedBody = JSON.parse(errorBodyText);
          } catch {
            parsedBody = errorBodyText;
          }
        }

        throw new HttpError(`HTTP ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          body: parsedBody,
          endpoint,
          method,
          headers: Object.fromEntries(response.headers.entries())
        });
      }

      if (response.status === 204) {
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return await response.json();
      }

      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (error) {
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  rebuildRegistry() {
    this.objectSchemas.clear();
    this.objectAliases.clear();
    this.supportedObjects = [];

    if (this.schemaLoader.metadata) {
      this.buildObjectRegistry();
      if (this.supportedObjects.length === 0) {
        this.buildFallbackRegistry();
      }
    } else {
      this.buildFallbackRegistry();
    }

    this.tools = this.generateToolsFromSchema();
  }

  refreshSchemaIfChanged() {
    if (!this.schemaLoader.metadata) {
      const loaded = this.schemaLoader.loadSchemas({ force: true });
      if (loaded) {
        this.rebuildRegistry();
      }
      return;
    }

    if (!this.schemaLoader.hasSchemaChanged()) {
      return;
    }

    const reloaded = this.schemaLoader.loadSchemas({ force: true });
    if (!reloaded) {
      return;
    }

    this.rebuildRegistry();
  }

  buildObjectRegistry() {
    const coreObjects = this.schemaLoader.getCoreObjects();
    for (const namePlural of coreObjects) {
      const schema = this.schemaLoader.generateToolSchema(namePlural);
      if (!schema) continue;
      this.registerObjectSchema(schema);
    }
  }

  buildFallbackRegistry() {
    const fallbackObjects = this.schemaLoader.getCoreObjects();
    for (const namePlural of fallbackObjects) {
      const nameSingular = this.getFallbackSingular(namePlural);
      const labelSingular = nameSingular.charAt(0).toUpperCase() + nameSingular.slice(1);
      const labelPlural = namePlural.charAt(0).toUpperCase() + namePlural.slice(1);

      this.registerObjectSchema({
        nameSingular,
        namePlural,
        labelSingular,
        labelPlural,
        description: `Generic ${labelPlural.toLowerCase()} operations`,
        properties: {},
        required: [],
        fieldMetadata: [],
        relationMetadata: []
      });
    }
  }

  registerObjectSchema(schema) {
    if (!schema?.namePlural || !schema?.nameSingular) {
      return;
    }

    const pluralKey = schema.namePlural.toLowerCase();
    if (this.objectSchemas.has(pluralKey)) {
      return;
    }

    this.objectSchemas.set(pluralKey, schema);
    this.objectAliases.set(pluralKey, pluralKey);
    this.objectAliases.set(schema.nameSingular.toLowerCase(), pluralKey);

    if (schema.labelSingular) {
      this.objectAliases.set(schema.labelSingular.toLowerCase(), pluralKey);
    }
    if (schema.labelPlural) {
      this.objectAliases.set(schema.labelPlural.toLowerCase(), pluralKey);
    }

    this.supportedObjects.push(schema);
  }

  getFallbackSingular(namePlural) {
    switch (namePlural) {
      case "people":
        return "person";
      case "companies":
        return "company";
      case "opportunities":
        return "opportunity";
      default:
        return namePlural.endsWith("s") ? namePlural.slice(0, -1) : namePlural;
    }
  }

  generateToolsFromSchema() {
    const tools = [];

    for (const schema of this.supportedObjects) {
      const {
        nameSingular,
        namePlural,
        labelSingular,
        labelPlural,
        description,
        required = []
      } = schema;

      const createProperties = this.buildWritableProperties(schema);
      const createRequired = required.filter(fieldName => fieldName in createProperties);

      const idProperty = {
        id: {
          type: "string",
          description: `${labelSingular || nameSingular} ID`
        }
      };

      const baseLabelSingular = (labelSingular || nameSingular).toLowerCase();
      const baseLabelPlural = (labelPlural || namePlural).toLowerCase();

      const createDescription = description
        ? `Create a new ${baseLabelSingular} (${description.trim()})`
        : `Create a new ${baseLabelSingular} in Twenty CRM`;

      const filterProperties = Object.fromEntries(
        Object.entries(createProperties).map(([fieldName, definition]) => [fieldName, { ...definition }])
      );

      tools.push({
        name: `create_${nameSingular}`,
        description: createDescription,
        inputSchema: {
          type: "object",
          properties: createProperties,
          required: createRequired,
          additionalProperties: true
        }
      });

      tools.push({
        name: `get_${nameSingular}`,
        description: `Get a ${baseLabelSingular} by ID`,
        inputSchema: {
          type: "object",
          properties: idProperty,
          required: ["id"]
        }
      });

      tools.push({
        name: `update_${nameSingular}`,
        description: `Update an existing ${baseLabelSingular}`,
        inputSchema: {
          type: "object",
          properties: { ...idProperty, ...createProperties },
          required: ["id"],
          additionalProperties: true
        }
      });

      tools.push({
        name: `list_${namePlural}`,
        description: `List ${baseLabelPlural} with optional filters`,
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of results to return (default: 20)",
              default: 20
            },
            offset: {
              type: "number",
              description: "Number of results to skip before starting the page (default: 0)",
              default: 0
            },
            search: {
              type: "string",
              description: `Search term applied to ${baseLabelPlural}`
            },
            filters: {
              type: "object",
              description: `Additional key/value filters supported by the ${namePlural} REST endpoint`,
              properties: filterProperties,
              additionalProperties: true
            }
          },
          additionalProperties: true
        }
      });

      tools.push({
        name: `delete_${nameSingular}`,
        description: `Delete a ${baseLabelSingular}`,
        inputSchema: {
          type: "object",
          properties: idProperty,
          required: ["id"]
        }
      });
    }

    return [...tools, ...this.buildGlobalTools()];
  }

  buildWritableProperties(schema) {
    const properties = schema.properties || {};
    const fieldMetadata = schema.fieldMetadata || [];
    const readOnlyNames = new Set([
      "createdAt",
      "updatedAt",
      "deletedAt",
      "createdBy",
      "updatedBy",
      "searchVector",
      "position"
    ]);

    const fieldMap = new Map(fieldMetadata.map(field => [field.name, field]));
    const writable = {};

    for (const [name, definition] of Object.entries(properties)) {
      if (readOnlyNames.has(name)) continue;

      const field = fieldMap.get(name);
      if (field && field.type === "POSITION") continue;

      writable[name] = { ...definition };
    }

    if (Object.keys(writable).length === 0) {
      const fallback = {};
      for (const [name, definition] of Object.entries(properties)) {
        fallback[name] = { ...definition };
      }
      return fallback;
    }

    return writable;
  }

  buildGlobalTools() {
    const defaultSearchObjects = this.getDefaultSearchObjects();

    return [
      {
        name: "get_metadata_objects",
        description: "List active object metadata from the local schema export (API fallback)",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_object_metadata",
        description: "Inspect metadata for a specific object (local schema first, API fallback)",
        inputSchema: {
          type: "object",
          properties: {
            objectName: { type: "string", description: "Object name (plural or singular)" }
          },
          required: ["objectName"]
        }
      },
      {
        name: "get_local_object_schema",
        description: "Return the generated tool schema for an object based on the local export",
        inputSchema: {
          type: "object",
          properties: {
            objectName: { type: "string", description: "Object name (plural or singular)" }
          },
          required: ["objectName"]
        }
      },
      {
        name: "get_available_operations",
        description: "List GraphQL operations detected in the exported schema files",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["all", "query", "mutation"],
              description: "Filter by GraphQL operation type",
              default: "all"
            },
            nameContains: {
              type: "string",
              description: "Optional substring filter applied to operation names"
            },
            limit: {
              type: "number",
              description: "Limit the number of returned operations"
            }
          }
        }
      },
      {
        name: "search_records",
        description: "Search REST records across supported objects",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query string" },
            objectTypes: {
              type: "array",
              description: "Object types to search; accepts strings or objects with { name, limit, weight }",
              items: {
                anyOf: [
                  { type: "string" },
                  {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Object name (plural or singular)" },
                      limit: { type: "number", description: "Override per-object result limit" },
                      weight: { type: "number", description: "Priority weight; higher values searched first" }
                    },
                    required: ["name"],
                    additionalProperties: false
                  }
                ]
              },
              default: defaultSearchObjects
            },
            limit: {
              type: "number",
              description: "Number of results per object type",
              default: 10
            }
          },
          required: ["query"]
        }
      }
    ];
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.refreshSchemaIfChanged();
      return { tools: this.tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.refreshSchemaIfChanged();
      const { name } = request.params;
      const args = request.params.arguments ?? {};

      try {
        const specialHandler = this.globalToolHandlers.get(name);
        if (specialHandler) {
          return await specialHandler(args);
        }

        const match = name.match(/^(create|get|update|list|delete)_(.+)$/);

        if (match) {
          const [, operation, objectName] = match;
          return await this.handleCRUDOperation(operation, objectName, args);
        }

        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        return this.buildErrorContent(error);
      }
    });
  }

  async handleCRUDOperation(operation, objectName, args = {}) {
    const resolved = this.resolveObject(objectName);
    if (!resolved) {
      throw new Error(`Unsupported object "${objectName}" in the current schema`);
    }

    const { schema } = resolved;
    const labelSingular = schema.labelSingular || schema.nameSingular;
    const labelPlural = schema.labelPlural || schema.namePlural;
    const endpointName = schema.namePlural;

    switch (operation) {
      case "create": {
        const payload = this.sanitizePayload(args, schema);
        const created = await this.makeRequest(`/rest/${endpointName}`, "POST", payload);
        return this.buildContent(`Created ${labelSingular}`, created);
      }
      case "get": {
        if (!args.id) {
          throw new Error(`Missing "id" for ${labelSingular} retrieval`);
        }
        const item = await this.makeRequest(`/rest/${endpointName}/${args.id}`);
        return this.buildContent(`${labelSingular} details`, item);
      }
      case "update": {
        const { id, ...updateData } = args;
        if (!id) {
          throw new Error(`Missing "id" for ${labelSingular} update`);
        }
        const payload = this.sanitizePayload(updateData, schema);
        const updated = await this.makeRequest(`/rest/${endpointName}/${id}`, "PUT", payload);
        return this.buildContent(`Updated ${labelSingular}`, updated);
      }
      case "list": {
        const {
          limit = 20,
          offset = 0,
          search,
          filters = {},
          ...inlineFilters
        } = args;

        const query = new URLSearchParams();
        const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 20;
        const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;

        query.set("limit", String(safeLimit));
        query.set("offset", String(safeOffset));

        if (search) {
          query.set("search", search);
        }

        const mergedFilters = { ...inlineFilters };
        if (filters && typeof filters === "object" && !Array.isArray(filters)) {
          Object.assign(mergedFilters, filters);
        }

        for (const [key, value] of Object.entries(mergedFilters)) {
          if (value === undefined || value === null || value === "") continue;

          if (Array.isArray(value)) {
            value.forEach(item => {
              if (item !== undefined && item !== null && item !== "") {
                query.append(key, String(item));
              }
            });
          } else {
            query.set(key, String(value));
          }
        }

        const queryString = query.toString();
        const endpoint = `/rest/${endpointName}${queryString ? `?${queryString}` : ""}`;
        const list = await this.makeRequest(endpoint);
        return this.buildContent(`${labelPlural} list`, this.buildListPayload(list));
      }
      case "delete": {
        if (!args.id) {
          throw new Error(`Missing "id" for ${labelSingular} deletion`);
        }
        await this.makeRequest(`/rest/${endpointName}/${args.id}`, "DELETE");
        return this.buildContent(`Deleted ${labelSingular} ${args.id}`);
      }
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  resolveObject(objectName) {
    if (!objectName) {
      return null;
    }

    const normalized = objectName.toString().trim().toLowerCase();
    const pluralKey = this.objectAliases.get(normalized);
    if (!pluralKey) {
      return null;
    }

    const schema = this.objectSchemas.get(pluralKey);
    if (!schema) {
      return null;
    }

    return { schema, pluralKey };
  }

  sanitizePayload(payload, schema) {
    if (!payload || typeof payload !== "object") {
      return {};
    }

    const { byName, byAlias } = this.getRelationInfo(schema);
    const sanitized = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;

      if (byName.has(key)) {
        const relation = byName.get(key);
        const normalized = this.normalizeRelationValue(value, relation);
        Object.assign(sanitized, normalized);
        continue;
      }

      if (byAlias.has(key)) {
        const relation = byAlias.get(key);
        const normalized = this.normalizeRelationAliasValue(value, relation);
        if (normalized !== undefined) {
          sanitized[key] = normalized;
        }
        continue;
      }

      sanitized[key] = value;
    }

    if ("id" in sanitized) {
      delete sanitized.id;
    }

    return sanitized;
  }

  getRelationInfo(schema) {
    const byName = new Map();
    const byAlias = new Map();

    if (!schema?.relationMetadata) {
      return { byName, byAlias };
    }

    schema.relationMetadata.forEach(relation => {
      byName.set(relation.name, relation);
      if (relation.alias) {
        byAlias.set(relation.alias, relation);
      }
    });

    return { byName, byAlias };
  }

  normalizeRelationValue(value, relation) {
    const alias = relation.alias || relation.name;
    if (!alias) {
      return {};
    }

    const cardinality = this.getRelationCardinality(relation.relationType);

    if (cardinality === "single") {
      const id = this.extractSingleRelationId(value);
      if (id === undefined) {
        return {};
      }
      return { [alias]: id };
    }

    const ids = this.extractMultipleRelationIds(value);
    if (ids === undefined) {
      return {};
    }

    return { [alias]: ids };
  }

  normalizeRelationAliasValue(value, relation) {
    const cardinality = this.getRelationCardinality(relation.relationType);

    if (cardinality === "single") {
      return this.extractSingleRelationId(value);
    }

    return this.extractMultipleRelationIds(value);
  }

  getRelationCardinality(relationType) {
    if (relationType === "MANY_TO_ONE" || relationType === "ONE_TO_ONE") {
      return "single";
    }
    if (relationType === "ONE_TO_MANY" || relationType === "MANY_TO_MANY") {
      return "multiple";
    }
    return null;
  }

  extractSingleRelationId(value) {
    if (value === null) {
      return null;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (value && typeof value === "object") {
      if (typeof value.id === "string" && value.id.trim().length) {
        return value.id.trim();
      }
      if (typeof value.value === "string" && value.value.trim().length) {
        return value.value.trim();
      }
    }

    return undefined;
  }

  extractMultipleRelationIds(value) {
    const explicitClear =
      value === null ||
      (Array.isArray(value) && value.length === 0) ||
      (value && typeof value === "object" && Array.isArray(value.ids) && value.ids.length === 0);

    if (value === null) {
      return [];
    }

    const collectIds = (candidate) => {
      const single = this.extractSingleRelationId(candidate);
      return single === undefined || single === null ? null : single;
    };

    let candidates;
    let candidateCount = 0;

    if (Array.isArray(value)) {
      candidates = value;
      candidateCount = candidates.length;
    } else if (typeof value === "string" || typeof value === "number") {
      candidates = [value];
      candidateCount = 1;
    } else if (value && typeof value === "object") {
      if (Array.isArray(value.ids)) {
        candidates = value.ids;
        candidateCount = candidates.length;
      } else if (value.id !== undefined) {
        candidates = [value.id];
        candidateCount = 1;
      } else {
        candidates = [];
      }
    } else {
      candidates = [];
    }

    const ids = [];
    candidates.forEach(candidate => {
      const normalized = collectIds(candidate);
      if (typeof normalized === "string" && normalized.length) {
        ids.push(normalized);
      }
    });

    if (ids.length === 0) {
      return explicitClear ? [] : undefined;
    }

    return Array.from(new Set(ids));
  }

  buildContent(message, data) {
    const segments = [];
    if (message) {
      segments.push(message);
    }

    if (data !== undefined) {
      const serialized = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      if (serialized) {
        segments.push(serialized);
      }
    }

    return {
      content: [
        {
          type: "text",
          text: segments.join("\n")
        }
      ]
    };
  }

  buildErrorContent(error) {
    if (error instanceof HttpError) {
      const payload = {
        status: error.status,
        statusText: error.statusText,
        endpoint: error.endpoint,
        method: error.method,
        body: error.body,
        headers: error.headers
      };

      return this.buildContent(
        `HTTP error ${error.status} on ${error.method} ${error.endpoint}`,
        payload
      );
    }

    return this.buildContent(`Error: ${error.message}`);
  }

  async getMetadataObjects() {
    if (this.schemaLoader.metadata) {
      const objects = this.schemaLoader.getActiveObjects().map(obj => ({
        nameSingular: obj.nameSingular,
        namePlural: obj.namePlural,
        labelSingular: obj.labelSingular,
        labelPlural: obj.labelPlural,
        isCustom: obj.isCustom,
        description: obj.description
      }));

      return this.buildContent("Active objects from local schema", { objects });
    }

    const result = await this.makeRequest("/rest/metadata/objects");
    return this.buildContent("Metadata objects", result);
  }

  getLocalObjectMetadata(objectName) {
    if (!this.schemaLoader.metadata || !objectName) {
      return null;
    }

    const resolved = this.resolveObject(objectName);
    if (resolved) {
      return this.schemaLoader.getObjectByName(resolved.schema.namePlural);
    }

    return this.schemaLoader.getObjectByName(objectName);
  }

  async getObjectMetadata(objectName) {
    if (!objectName) {
      throw new Error("objectName is required");
    }

    const metadata = this.getLocalObjectMetadata(objectName);

    if (metadata) {
      const fieldSummaries = metadata.fields.map(field => ({
        name: field.name,
        type: field.type,
        label: field.label,
        description: field.description,
        isNullable: field.isNullable,
        isCustom: field.isCustom,
        isSystem: field.isSystem,
        defaultValue: field.defaultValue
      }));

      const schema = this.resolveObject(metadata.namePlural)?.schema;
      const payload = {
        nameSingular: metadata.nameSingular,
        namePlural: metadata.namePlural,
        labelSingular: metadata.labelSingular,
        labelPlural: metadata.labelPlural,
        description: metadata.description,
        required: schema?.required ?? [],
        fields: fieldSummaries
      };

      return this.buildContent(`Metadata for ${metadata.labelSingular || metadata.nameSingular}`, payload);
    }

    const result = await this.makeRequest(`/rest/metadata/objects/${objectName}`);
    return this.buildContent(`Metadata for ${objectName}`, result);
  }

  async getLocalObjectSchema(objectName) {
    if (!objectName) {
      throw new Error("objectName is required");
    }

    let schema = this.resolveObject(objectName)?.schema;

    if (!schema) {
      const generated = this.schemaLoader.generateToolSchema(objectName);
      if (generated) {
        const pluralKey = generated.namePlural.toLowerCase();
        const alreadyKnown = this.objectSchemas.has(pluralKey);
        if (!alreadyKnown) {
          this.registerObjectSchema(generated);
          this.tools = this.generateToolsFromSchema();
        }
        schema = generated;
      }
    }

    if (!schema) {
      throw new Error(`Unknown object "${objectName}" in local schema export`);
    }

    const payload = {
      nameSingular: schema.nameSingular,
      namePlural: schema.namePlural,
      labelSingular: schema.labelSingular,
      labelPlural: schema.labelPlural,
      description: schema.description,
      required: schema.required,
      properties: schema.properties
    };

    return this.buildContent(`Local schema for ${schema.labelSingular || schema.nameSingular}`, payload);
  }

  async getAvailableOperations(params = {}) {
    const { type = "all", nameContains, limit } = params;
    const allowedTypes = new Set(["all", "query", "mutation"]);
    const normalizedType = typeof type === "string" ? type.toLowerCase() : "all";
    const effectiveType = allowedTypes.has(normalizedType) ? normalizedType : "all";

    const operations = this.schemaLoader.getOperations(effectiveType);
    if (!operations.length) {
      throw new Error("No GraphQL operations found in the local schema export");
    }

    const filtered = operations.filter(operation => {
      if (!nameContains) return true;
      return operation.name.toLowerCase().includes(nameContains.toLowerCase());
    });

    const limited = typeof limit === "number" && limit > 0
      ? filtered.slice(0, limit)
      : filtered;

    return this.buildContent("Available operations", { operations: limited });
  }

  getDefaultSearchObjects() {
    if (this.supportedObjects.length > 0) {
      return this.supportedObjects.map(schema => schema.namePlural);
    }

    return ["people", "companies"];
  }

  async searchRecords(params = {}) {
    const { query, objectTypes, limit = 10 } = params;

    if (!query) {
      throw new Error("query is required");
    }

    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 10;
    const requests = this.normalizeSearchObjectTypes(objectTypes, safeLimit);

    const results = {};
    const processed = new Set();

    for (const request of requests) {
      const resolved = this.resolveObject(request.name);
      if (!resolved) {
        results[request.originalName] = { error: "Unsupported object type" };
        continue;
      }

      const { schema } = resolved;
      const endpointName = schema.namePlural;

      if (processed.has(endpointName)) {
        continue;
      }
      processed.add(endpointName);

      try {
        const endpoint = `/rest/${endpointName}?search=${encodeURIComponent(query)}&limit=${request.limit}`;
        const response = await this.makeRequest(endpoint);
        results[endpointName] = {
          limit: request.limit,
          weight: request.weight,
          data: this.buildListPayload(response)
        };
      } catch (error) {
        results[endpointName] = {
          limit: request.limit,
          weight: request.weight,
          error: error instanceof HttpError ? {
            status: error.status,
            body: error.body
          } : error.message
        };
      }
    }

    if (processed.size === 0) {
      results._error = "No supported object types available for search";
    }

    return this.buildContent(`Search results for "${query}"`, results);
  }

  normalizeSearchObjectTypes(objectTypes, defaultLimit) {
    const configured = Array.isArray(objectTypes) && objectTypes.length
      ? objectTypes
      : this.getDefaultSearchObjects();

    const normalized = [];

    configured.forEach(entry => {
      if (typeof entry === "string") {
        normalized.push({
          name: entry,
          originalName: entry,
          limit: defaultLimit,
          weight: 1
        });
      } else if (entry && typeof entry === "object") {
        const name = (entry.name || entry.object || entry.type);
        if (!name) {
          return;
        }

        const limit = Number.isFinite(Number(entry.limit)) ? Number(entry.limit) : defaultLimit;
        const weight = Number.isFinite(Number(entry.weight)) ? Number(entry.weight) : 1;

        normalized.push({
          name,
          originalName: name,
          limit,
          weight
        });
      }
    });

    const deduped = new Map();
    normalized.forEach(entry => {
      const key = entry.name.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, entry);
        return;
      }

      const existing = deduped.get(key);
      deduped.set(key, {
        ...existing,
        limit: Math.max(existing.limit, entry.limit),
        weight: Math.max(existing.weight, entry.weight)
      });
    });

    return Array.from(deduped.values()).sort((a, b) => {
      if (b.weight !== a.weight) {
        return b.weight - a.weight;
      }
      return a.name.localeCompare(b.name);
    });
  }

  buildListPayload(response) {
    const items = this.extractRecords(response);
    const pagination = this.extractPagination(response);

    const payload = {};

    if (items !== undefined) {
      payload.items = items;
      payload.summary = {
        count: Array.isArray(items) ? items.length : undefined
      };
    }

    if (pagination) {
      payload.pagination = pagination;
      payload.summary = {
        ...(payload.summary || {}),
        total: this.resolveTotalFromPagination(pagination),
        hasNextPage: this.resolveHasNextFromPagination(pagination)
      };
    }

    if (!payload.items && typeof response === "object" && response !== null) {
      payload.raw = response;
    } else if (!payload.items) {
      return response;
    } else {
      payload.raw = response;
    }

    return payload;
  }

  extractRecords(response) {
    if (Array.isArray(response)) {
      return response;
    }

    if (response && typeof response === "object") {
      if (Array.isArray(response.data)) {
        return response.data;
      }

      if (Array.isArray(response.items)) {
        return response.items;
      }

      if (Array.isArray(response.records)) {
        return response.records;
      }
    }

    return undefined;
  }

  extractPagination(response) {
    if (!response || typeof response !== "object") {
      return null;
    }

    if (response.pageInfo && typeof response.pageInfo === "object") {
      return response.pageInfo;
    }

    if (response.meta && typeof response.meta === "object") {
      const meta = response.meta;
      if (meta.pagination || meta.page || meta.total || meta.count) {
        return meta.pagination || meta.page || meta;
      }
    }

    const paginationKeys = ["nextCursor", "prevCursor", "hasNextPage", "hasPreviousPage", "total", "totalCount"];
    const containsPaginationKeys = paginationKeys.some(key => key in response);

    if (containsPaginationKeys) {
      const pagination = {};
      paginationKeys.forEach(key => {
        if (key in response) {
          pagination[key] = response[key];
        }
      });
      return pagination;
    }

    return null;
  }

  resolveTotalFromPagination(pagination) {
    const totalKeys = ["totalCount", "total", "totalItems", "count"];
    for (const key of totalKeys) {
      if (pagination && typeof pagination[key] === "number") {
        return pagination[key];
      }
    }
    return undefined;
  }

  resolveHasNextFromPagination(pagination) {
    if (!pagination || typeof pagination !== "object") {
      return undefined;
    }

    if (typeof pagination.hasNextPage === "boolean") {
      return pagination.hasNextPage;
    }

    if (typeof pagination.hasMore === "boolean") {
      return pagination.hasMore;
    }

    if ("nextCursor" in pagination) {
      return Boolean(pagination.nextCursor);
    }

    return undefined;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Twenty CRM MCP server (optimized) running on stdio");
  }
}

const server = new TwentyCRMServer();
server.run().catch(console.error);
