# Twenty CRM Schema Export

Dieses Verzeichnis enthält das vollständige Schema-Export von Twenty CRM.

## Dateien

### GraphQL Schema
- **graphql-full-schema.json** - Vollständiges GraphQL Schema mit allen Details
- **graphql-types.json** - Kompakte Liste aller GraphQL Typen
- **available-operations.json** - Liste aller verfügbaren Queries und Mutations

### REST API Metadata
- **rest-metadata-objects.json** - Vollständige REST Metadata für alle Objekte

### Core Objects (detailliert)
- **core-objects/person.json** - Person/Contact Schema
- **core-objects/company.json** - Company Schema
- **core-objects/task.json** - Task Schema
- **core-objects/note.json** - Note Schema
- **core-objects/workspacemember.json** - WorkspaceMember Schema
- **core-objects/opportunity.json** - Opportunity Schema

## Verwendung

### GraphQL Playground
Öffnen Sie https://crm.nevuro.com/graphql im Browser für interaktive Tests.

### REST API
Basis-URL: https://crm.nevuro.com/rest

### Authentifizierung
Alle Requests benötigen einen Bearer Token:
```
Authorization: Bearer YOUR_API_TOKEN
```

## Struktur verstehen

### GraphQL Typen
- **OBJECT** - Normale Objekte (Person, Company, etc.)
- **INPUT_OBJECT** - Input-Typen für Mutations
- **ENUM** - Aufzählungstypen
- **INTERFACE** - Interface-Definitionen
- **SCALAR** - Primitive Typen (String, Int, Boolean, etc.)

### Metadaten
Die REST Metadata API liefert Informationen über:
- Objekttypen und deren Felder
- Feldtypen und Validierungen
- Beziehungen zwischen Objekten
- Custom Fields

## Nützliche Queries

### Alle Personen abrufen
```graphql
query {
  people {
    id
    name { firstName lastName }
    emails { primaryEmail }
  }
}
```

### Firma erstellen
```graphql
mutation {
  createCompany(data: { name: "Beispiel GmbH" }) {
    id
    name
  }
}
```

