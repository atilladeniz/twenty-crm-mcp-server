# Twenty CRM MCP Server

A Model Context Protocol (MCP) server for [Twenty CRM](https://twenty.com), enabling natural language interactions with your CRM data through Claude and other AI assistants.

## Features

- **Complete CRUD Operations**: Create, read, update, and delete people, companies, tasks, and notes
- **Dynamic Schema Discovery**: Automatically adapts to your Twenty CRM configuration and custom fields
- **Advanced Search**: Search across multiple object types with intelligent filtering
- **Metadata Access**: Retrieve schema information and field definitions
- **Natural Language Interface**: Use conversational commands to manage your CRM data

## Installation

### Prerequisites

- Node.js 18 or higher
- A Twenty CRM instance (cloud or self-hosted)
- Claude Desktop or compatible MCP client

### Setup

1. **Clone the repository**:
```bash
git clone https://github.com/your-username/twenty-crm-mcp-server.git
cd twenty-crm-mcp-server
```

2. **Install dependencies**:
```bash
npm install
```

3. **Get your Twenty CRM API key**:
   - Log in to your Twenty CRM workspace
   - Navigate to Settings → API & Webhooks (under Developers)
   - Generate a new API key

4. **Configure Claude Desktop**:

Add the server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "twenty-crm": {
      "command": "node",
      "args": ["/path/to/twenty-crm-mcp-server/index.js"],
      "env": {
        "TWENTY_API_KEY": "your_api_key_here",
        "TWENTY_BASE_URL": "https://api.twenty.com"
      }
    }
  }
}
```

For self-hosted Twenty instances, change `TWENTY_BASE_URL` to your domain.

5. **Restart Claude Desktop** to load the new server.

## Usage

Once configured, you can use natural language to interact with your Twenty CRM:

### People Management
- "List the first 10 people in my CRM"
- "Create a new person named John Doe with email john@example.com"
- "Update Sarah's job title to Senior Developer"
- "Find all people working at tech companies"

### Company Management
- "Show me all companies with more than 100 employees"
- "Create a company called Tech Solutions with domain techsolutions.com"
- "Update Acme Corp's annual revenue to $5M"

### Task Management
- "Create a task to follow up with John next Friday"
- "Show me all overdue tasks"
- "Mark the task 'Call client' as completed"

### Notes & Search
- "Add a note about my meeting with the client today"
- "Search for any records mentioning 'blockchain'"
- "Find all contacts without LinkedIn profiles"

## API Reference

The server provides the following tools:

### People Operations
- `create_person` - Create a new person
- `get_person` - Get person details by ID
- `update_person` - Update person information
- `list_people` - List people with filtering
- `delete_person` - Delete a person

### Company Operations
- `create_company` - Create a new company
- `get_company` - Get company details by ID
- `update_company` - Update company information
- `list_companies` - List companies with filtering
- `delete_company` - Delete a company

### Task Operations
- `create_task` - Create a new task
- `get_task` - Get task details by ID
- `update_task` - Update task information
- `list_tasks` - List tasks with filtering
- `delete_task` - Delete a task

### Note Operations
- `create_note` - Create a new note
- `get_note` - Get note details by ID
- `update_note` - Update note information
- `list_notes` - List notes with filtering
- `delete_note` - Delete a note

### Metadata & Search
- `get_metadata_objects` - Get all object types and schemas
- `get_object_metadata` - Get metadata for specific object
- `search_records` - Search across multiple object types

## Configuration

### Environment Variables

- `TWENTY_API_KEY` (required): Your Twenty CRM API key
- `TWENTY_BASE_URL` (optional): Twenty CRM base URL (defaults to `https://api.twenty.com`)

### Custom Fields

The server automatically discovers and supports custom fields in your Twenty CRM instance. No configuration changes needed when you add new fields.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development

1. **Clone the repo**:
```bash
git clone https://github.com/mhenry3164/twenty-crm-mcp-server.git
cd twenty-crm-mcp-server
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your API key
```

4. **Test the server**:
```bash
npm test
```

## Troubleshooting

### Common Issues

**Authentication Error**: Verify your API key is correct and has appropriate permissions.

**Connection Failed**: Check that your `TWENTY_BASE_URL` is correct (especially for self-hosted instances).

**Field Not Found**: The server automatically discovers fields. If you're getting field errors, try getting the metadata first: "Show me the available fields for people"

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Twenty CRM](https://twenty.com) for providing an excellent open-source CRM
- [Anthropic](https://anthropic.com) for the Model Context Protocol
- The MCP community for inspiration and examples

## Links

- [Twenty CRM Documentation](https://twenty.com/developers)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Claude Desktop](https://claude.ai/desktop)

---

