# Contributing to Twenty CRM MCP Server

Thank you for your interest in contributing! This project aims to provide the best possible integration between Twenty CRM and MCP-compatible AI assistants.

## Development Setup

1. **Fork and clone the repository**:
```bash
git clone https://github.com/your-username/twenty-crm-mcp-server.git
cd twenty-crm-mcp-server
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
```bash
cp .env.example .env
```
Edit `.env` with your Twenty CRM API key and base URL.

4. **Test your setup**:
```bash
npm test
```

## How to Contribute

### Reporting Issues

Before creating an issue, please:

1. **Search existing issues** to avoid duplicates
2. **Use the issue templates** provided
3. **Include relevant details**:
   - Twenty CRM version (cloud/self-hosted)
   - Node.js version
   - Error messages and stack traces
   - Steps to reproduce

### Suggesting Features

We welcome feature suggestions! Please:

1. **Check the roadmap** to see if it's already planned
2. **Open a discussion** before submitting large features
3. **Explain the use case** and expected behavior
4. **Consider backward compatibility**

### Code Contributions

#### Before You Start

1. **Open an issue** to discuss your proposed changes
2. **Check if someone is already working** on similar functionality
3. **Review the codebase** to understand the patterns used

#### Development Guidelines

**Code Style**:
- Use ES modules (`import`/`export`)
- Follow existing naming conventions
- Add JSDoc comments for new functions
- Keep functions focused and small

**Error Handling**:
- Always handle API errors gracefully
- Provide helpful error messages to users
- Log errors with appropriate context

**Testing**:
- Add tests for new functionality
- Ensure existing tests pass
- Test with both cloud and self-hosted Twenty instances

#### Pull Request Process

1. **Create a feature branch**:
```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**:
   - Follow the coding guidelines above
   - Add tests for new functionality
   - Update documentation as needed

3. **Test thoroughly**:
```bash
npm test
npm run lint
```

4. **Commit with clear messages**:
```bash
git commit -m "feat: add support for custom field types"
```

Use conventional commit format:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `refactor:` for code refactoring
- `test:` for test additions/modifications

5. **Push and create PR**:
```bash
git push origin feature/your-feature-name
```

Then create a pull request with:
- **Clear title and description**
- **Reference any related issues**
- **Include testing instructions**
- **Update CHANGELOG.md** if applicable

#### Review Process

- All PRs require at least one approval
- Maintainers will review within 48 hours
- Address feedback promptly
- Keep PRs focused and reasonably sized

## Roadmap

### Planned Features

- **Bulk Operations**: Import/export large datasets
- **Advanced Filtering**: Complex query capabilities
- **Webhook Support**: Real-time notifications
- **Data Enrichment**: Integration with external data sources
- **Workflow Triggers**: Automated actions based on events
- **Performance Optimization**: Caching and rate limiting
- **TypeScript Support**: Full type definitions
- **Additional Object Types**: Support for opportunities, custom objects

### Areas for Contribution

- **Documentation**: Improve examples and tutorials
- **Testing**: Add integration tests and edge cases
- **Performance**: Optimize API calls and response handling
- **Features**: Implement items from the roadmap
- **Bug Fixes**: Address issues and improve stability

## Code of Conduct

### Our Standards

- **Be respectful** and inclusive
- **Focus on constructive feedback**
- **Help others learn and grow**
- **Assume good intentions**

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or inflammatory comments
- Personal attacks
- Publishing private information

## Getting Help

- **GitHub Discussions**: For questions and general discussion
- **Issues**: For bug reports and feature requests
- **Discord**: Join the Twenty CRM community

## Recognition

Contributors will be:
- **Listed in README.md**
- **Credited in release notes**
- **Invited to the contributors team** (for regular contributors)

Thank you for helping make this project better! 🚀