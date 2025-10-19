import { existsSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AUTO_DEFAULT_TOKENS = new Set([
  'now',
  'uuid',
  'incrementalposition',
  'currentuser',
  'autoincrement'
]);

const EMPTY_STRING_TOKENS = new Set(["''", '""']);

function resolveSchemaPath() {
  const candidates = [
    process.env.SCHEMA_PATH,
    join(__dirname, 'schema'),
    join(dirname(__dirname), 'schema'),
    join(dirname(__dirname), 'twenty-crm-schema-export')
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeDefaultValue(value) {
  if (value === null || value === undefined) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (EMPTY_STRING_TOKENS.has(trimmed)) {
      return '';
    }

    const stripped = trimmed.replace(/^['"]|['"]$/g, '');
    if (AUTO_DEFAULT_TOKENS.has(stripped.toLowerCase())) {
      return undefined;
    }

    return stripped;
  }

  if (Array.isArray(value)) {
    const normalizedArray = value
      .map(item => normalizeDefaultValue(item))
      .filter(item => item !== undefined);

    return normalizedArray.length ? normalizedArray : undefined;
  }

  if (typeof value === 'object') {
    const normalizedObject = {};

    for (const [key, val] of Object.entries(value)) {
      const normalizedVal = normalizeDefaultValue(val);
      if (normalizedVal !== undefined) {
        normalizedObject[key] = normalizedVal;
      }
    }

    return Object.keys(normalizedObject).length ? normalizedObject : undefined;
  }

  return value;
}

export class SchemaLoader {
  constructor(options = {}) {
    this.metadata = null;
    this.operations = null;
    this.schemaPath = options.schemaPath || resolveSchemaPath();
    this.fileStats = {
      metadata: null,
      operations: null
    };
  }

  loadSchemas(options = {}) {
    const { force = false } = options;

    if (!this.schemaPath) {
      console.error('Failed to resolve schema path. Set SCHEMA_PATH or place the export under ./schema');
      return false;
    }

    try {
      // Load REST metadata objects
      const metadataPath = join(this.schemaPath, 'rest-metadata-objects.json');
      const metadataStat = statSync(metadataPath);

      const metadataChanged =
        force ||
        !this.fileStats.metadata ||
        this.fileStats.metadata.mtimeMs !== metadataStat.mtimeMs ||
        this.fileStats.metadata.size !== metadataStat.size;

      if (metadataChanged) {
        this.metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
        this.fileStats.metadata = {
          mtimeMs: metadataStat.mtimeMs,
          size: metadataStat.size
        };
      }

      // Load available operations
      const operationsPath = join(this.schemaPath, 'available-operations.json');
      const operationsExists = existsSync(operationsPath);

      if (!operationsExists) {
        this.operations = null;
        this.fileStats.operations = null;
      } else {
        const operationsStat = statSync(operationsPath);
        const operationsChanged =
          force ||
          !this.fileStats.operations ||
          this.fileStats.operations.mtimeMs !== operationsStat.mtimeMs ||
          this.fileStats.operations.size !== operationsStat.size;

        if (operationsChanged) {
          this.operations = JSON.parse(readFileSync(operationsPath, 'utf8'));
          this.fileStats.operations = {
            mtimeMs: operationsStat.mtimeMs,
            size: operationsStat.size
          };
        }
      }

      return true;
    } catch (error) {
      console.error(`Failed to load schema files from ${this.schemaPath}:`, error.message);
      return false;
    }
  }

  hasSchemaChanged() {
    if (!this.schemaPath) {
      return false;
    }

    try {
      const metadataPath = join(this.schemaPath, 'rest-metadata-objects.json');
      const metadataStat = statSync(metadataPath);

      if (!this.metadata || !this.fileStats.metadata) {
        return true;
      }

      if (
        metadataStat.mtimeMs !== this.fileStats.metadata.mtimeMs ||
        metadataStat.size !== this.fileStats.metadata.size
      ) {
        return true;
      }

      const operationsPath = join(this.schemaPath, 'available-operations.json');
      const operationsExists = existsSync(operationsPath);

      if (!operationsExists) {
        return !!this.fileStats.operations;
      }

      const operationsStat = statSync(operationsPath);
      if (!this.fileStats.operations) {
        return true;
      }

      return (
        operationsStat.mtimeMs !== this.fileStats.operations.mtimeMs ||
        operationsStat.size !== this.fileStats.operations.size
      );
    } catch (error) {
      // File might have been removed or permissions changed; trigger reload attempt
      if (this.metadata) {
        return true;
      }
      console.error('Schema change detection failed:', error.message);
      return false;
    }
  }

  getSchemaPath() {
    return this.schemaPath;
  }

  getActiveObjects() {
    if (!this.metadata) return [];

    return this.metadata.data.objects
      .filter(obj => obj.isActive && !obj.isSystem)
      .sort((a, b) => (a.labelPlural || a.namePlural).localeCompare(b.labelPlural || b.namePlural));
  }

  getObjectByName(name) {
    if (!this.metadata || !name) return null;

    const normalized = name.toLowerCase();

    return this.metadata.data.objects.find(obj =>
      obj.isActive && (
        obj.namePlural.toLowerCase() === normalized ||
        obj.nameSingular.toLowerCase() === normalized
      )
    ) || null;
  }

  getObjectFields(name) {
    const object = this.getObjectByName(name);
    if (!object) return [];

    return object.fields.filter(field => {
      if (!field.isActive || field.isSystem) {
        return false;
      }

      if (field.type === 'RELATION') {
        const relationType = field.relation?.type;
        return relationType === 'MANY_TO_ONE' || relationType === 'ONE_TO_ONE';
      }

      return true;
    });
  }

  buildFieldProperty(field) {
    const baseType = this.mapFieldType(field.type);
    const property = {
      type: baseType,
      description: field.label || field.description || undefined
    };

    switch (field.type) {
      case 'FULL_NAME':
        property.type = 'object';
        property.properties = {
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          middleName: { type: 'string', description: 'Middle name' },
          prefix: { type: 'string', description: 'Name prefix (e.g., Dr.)' },
          suffix: { type: 'string', description: 'Name suffix (e.g., Jr.)' }
        };
        property.additionalProperties = false;
        break;
      case 'ADDRESS':
        property.type = 'object';
        property.properties = {
          addressLine1: { type: 'string', description: 'Primary address line' },
          addressLine2: { type: 'string', description: 'Secondary address line' },
          city: { type: 'string', description: 'City or locality' },
          state: { type: 'string', description: 'State or region' },
          postalCode: { type: 'string', description: 'Postal or ZIP code' },
          country: { type: 'string', description: 'Country code or name' }
        };
        property.additionalProperties = false;
        break;
      case 'CURRENCY':
        property.type = 'object';
        property.properties = {
          amount: { type: 'number', description: 'Monetary amount' },
          currency: { type: 'string', description: 'Three-letter currency code (ISO 4217)' }
        };
        property.required = ['amount', 'currency'];
        property.additionalProperties = false;
        break;
      case 'RELATION':
        if (field.relation) {
          const relationType = field.relation.type;
          const targetLabel = field.relation.targetObjectMetadata?.labelSingular
            || field.relation.targetObjectMetadata?.nameSingular
            || 'record';

          if (relationType === 'MANY_TO_ONE' || relationType === 'ONE_TO_ONE') {
            property.type = 'string';
            property.description = `ID of the related ${targetLabel}`;
          } else if (relationType === 'ONE_TO_MANY' || relationType === 'MANY_TO_MANY') {
            property.type = 'array';
            property.items = {
              type: 'string',
              description: `IDs of related ${field.relation.targetObjectMetadata?.labelPlural || targetLabel + 's'}`
            };
          }

          property.relation = {
            type: relationType,
            target: field.relation.targetObjectMetadata?.namePlural,
            targetLabel:
              field.relation.targetObjectMetadata?.labelPlural ||
              field.relation.targetObjectMetadata?.namePlural
          };
        }
        break;
      case 'EMAILS':
      case 'PHONES':
        property.type = 'array';
        property.items = {
          type: 'object',
          properties: {
            value: { type: 'string', description: 'Contact value' },
            type: { type: 'string', description: 'Type label or category' },
            primary: { type: 'boolean', description: 'Whether this is the primary contact value' }
          },
          additionalProperties: true
        };
        break;
      case 'LINKS':
        property.type = 'object';
        property.properties = {
          primary: { type: 'string', description: 'Primary link' },
          secondary: { type: 'string', description: 'Secondary link' },
          additional: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional URLs'
          }
        };
        property.additionalProperties = true;
        break;
      case 'ACTOR':
        property.type = 'object';
        property.properties = {
          id: { type: 'string', description: 'User or system identifier' },
          type: { type: 'string', description: 'Actor type (user, system, integration, etc.)' }
        };
        property.additionalProperties = true;
        break;
      case 'MULTI_SELECT':
        property.type = 'array';
        property.items = { type: 'string' };
        break;
      case 'ARRAY':
        property.type = 'array';
        property.items = { type: 'string' };
        break;
      case 'RAW_JSON':
        property.type = 'object';
        property.additionalProperties = true;
        break;
      default:
        break;
    }

    if (field.options && Array.isArray(field.options)) {
      const values = field.options.map(opt => (typeof opt === 'string' ? opt : opt.value));
      if (property.type === 'array' && property.items) {
        property.items.enum = values;
      } else {
        property.enum = values;
      }
    }

    const normalizedDefault = normalizeDefaultValue(field.defaultValue);
    if (normalizedDefault !== undefined) {
      property.default = normalizedDefault;
    }

    return property;
  }

  generateToolSchema(namePluralOrSingular) {
    const object = this.getObjectByName(namePluralOrSingular);
    if (!object) return null;

    const fields = this.getObjectFields(object.namePlural);
    const properties = {};
    const required = [];
    const relationMetadata = [];

    fields.forEach(field => {
      const prop = this.buildFieldProperty(field);

      properties[field.name] = prop;

      if (field.isNullable === false && field.defaultValue == null) {
        required.push(field.name);
      }

      if (field.type === 'RELATION' && field.relation) {
        const alias = this.getRelationAlias(field);
        const relationType = field.relation.type;

        relationMetadata.push({
          name: field.name,
          alias,
          relationType,
          targetNameSingular: field.relation.targetObjectMetadata?.nameSingular,
          targetNamePlural: field.relation.targetObjectMetadata?.namePlural,
          targetLabelSingular: field.relation.targetObjectMetadata?.labelSingular,
          targetLabelPlural: field.relation.targetObjectMetadata?.labelPlural
        });

        if (alias && !properties[alias]) {
          const aliasProperty = relationType === 'MANY_TO_ONE' || relationType === 'ONE_TO_ONE'
            ? {
                type: 'string',
                description: `ID of the related ${field.relation.targetObjectMetadata?.labelSingular || field.relation.targetObjectMetadata?.nameSingular || field.name}`
              }
            : {
                type: 'array',
                items: { type: 'string' },
                description: `IDs of related ${field.relation.targetObjectMetadata?.labelPlural || field.relation.targetObjectMetadata?.namePlural || field.name}`
              };

          properties[alias] = aliasProperty;
        }
      }
    });

    return {
      nameSingular: object.nameSingular,
      namePlural: object.namePlural,
      labelSingular: object.labelSingular,
      labelPlural: object.labelPlural,
      description: object.description,
      properties,
      required,
      fieldMetadata: fields,
      relationMetadata
    };
  }

  mapFieldType(fieldType) {
    const typeMap = {
      'TEXT': 'string',
      'UUID': 'string',
      'EMAIL': 'string',
      'PHONE': 'string',
      'LINK': 'string',
      'LINKS': 'object',
      'NUMBER': 'number',
      'NUMERIC': 'number',
      'BOOLEAN': 'boolean',
      'DATE_TIME': 'string',
      'DATE': 'string',
      'CURRENCY': 'object',
      'SELECT': 'string',
      'MULTI_SELECT': 'array',
      'RATING': 'string',
      'ADDRESS': 'object',
      'FULL_NAME': 'object',
      'ACTOR': 'object',
      'EMAILS': 'object',
      'PHONES': 'object',
      'ARRAY': 'array',
      'RAW_JSON': 'object',
      'RICH_TEXT': 'string',
      'POSITION': 'number',
      'RELATION': 'string'
    };

    return typeMap[fieldType] || 'string';
  }

  getRelationAlias(field) {
    if (!field?.relation?.type) {
      return null;
    }

    const { type } = field.relation;
    const baseName = field.name;

    if (type === 'MANY_TO_ONE' || type === 'ONE_TO_ONE') {
      if (/(Id)$/i.test(baseName)) {
        return baseName;
      }
      return `${baseName}Id`;
    }

    if (type === 'ONE_TO_MANY' || type === 'MANY_TO_MANY') {
      if (/(Ids)$/i.test(baseName)) {
        return baseName;
      }
      if (baseName.endsWith('s')) {
        return `${baseName}Ids`;
      }
      return `${baseName}Ids`;
    }

    return null;
  }

  getOperations(type = 'all') {
    if (!this.operations) return [];

    const schema = this.operations.data?.__schema;
    if (!schema) return [];

    const requestedTypes = type === 'all' ? ['query', 'mutation'] : [type];
    const results = [];

    for (const currentType of requestedTypes) {
      const fieldList = currentType === 'query'
        ? schema.queryType?.fields
        : schema.mutationType?.fields;

      if (!Array.isArray(fieldList)) continue;

      fieldList.forEach(field => {
        results.push({
          name: field.name,
          type: currentType,
          description: field.description || null
        });
      });
    }

    return results;
  }

  getCoreObjects() {
    // Return the most commonly used objects
    return [
      'people',
      'companies',
      'notes',
      'tasks',
      'opportunities'
    ];
  }
}
