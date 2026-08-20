# Shared Protobuf Definitions

This package contains the Protocol Buffer definitions shared between the frontend and backend.

## Structure

```
shared/
├── proto/
│   ├── packet.proto        # Mesh packet formats
│   ├── crypto.proto        # Encryption types
│   ├── settlement.proto    # Settlement request/response
│   └── mesh.proto          # Mesh coordination messages
├── buf.yaml               # Buf configuration
└── buf.gen.yaml           # Code generation config
```

## Generating Code

```bash
# Install buf
go install github.com/bufbuild/buf/cmd/buf@latest

# Generate code
buf generate
```

## Generated Output

- Go: `gen/go/upimesh/v1/`
- TypeScript: `gen/ts/`

## Adding New Messages

1. Add `.proto` file in `proto/`
2. Run `buf lint` to validate
3. Run `buf generate` to generate code
4. Commit generated files