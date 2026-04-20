# TNS Names Manager

A modern, user-friendly web application for managing Oracle Database TNS (Transparent Network Substrate) connection configurations.

## Features

- **File Import**: Upload existing `tnsnames.ora` files to parse and manage your Oracle connections
- **Manual Entry**: Add new database connections through an intuitive form interface
- **Group Organization**: Organize connections into custom groups for better management
- **Multiple Export Formats**: Export your configurations as `tnsnames.ora`, JSON, or YAML
- **Search & Filter**: Quickly find connections by alias, host, service name, or group
- **Alphabetical Sorting**: Sort entries alphabetically for easy navigation

## Getting Started

1. Upload a `tnsnames.ora` file or paste its content
2. Add, edit, or delete connection entries
3. Organize connections into groups
4. Export your configuration in your preferred format

## Tech Stack

- React + TypeScript
- Tailwind CSS
- shadcn/ui components
- Vite

## Usage

### Group Comments

Use `# GROUP: GroupName` comments in your tnsnames.ora file to automatically organize entries into groups:

```ora
# GROUP: Production
PROD_DB =
  (DESCRIPTION =
    (ADDRESS = (PROTOCOL = TCP)(HOST = prod.server.com)(PORT = 1521))
    (CONNECT_DATA =
      (SERVICE_NAME = orcl)
    )
  )

# GROUP: Development
DEV_DB =
  (DESCRIPTION =
    (ADDRESS = (PROTOCOL = TCP)(HOST = dev.server.com)(PORT = 1521))
    (CONNECT_DATA =
      (SERVICE_NAME = orcl)
    )
  )
```

### Supported Formats

The parser handles various tnsnames.ora formats including:
- Standard Oracle TNS format
- Entries with or without opening parenthesis on alias line
- Arbitrary comments (ignored during parsing)
- Custom group definitions

---

Made with Dyad