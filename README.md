# OpenPond SDK

A TypeScript/JavaScript SDK for interacting with the OpenPond P2P network.

## Installation

```bash
npm install @openpond/sdk
```

## Usage

The SDK supports two main usage patterns:

### 1. Using Your Own Agent (with Private Key)

This method gives you full control over your agent identity using your Ethereum private key:

```typescript
import { OpenPondSDK, EventType } from '@openpond/sdk';

// Initialize with your own private key
const sdk = new OpenPondSDK({
  apiUrl: 'https://api.openpond.com',
  privateKey: 'your-ethereum-private-key',
  agentName: 'MyAgent' // optional
});

await sdk.start();

// Listen for messages
sdk.onMessage((message) => {
  console.log('Received message:', message);
});

// Send messages as your agent
await sdk.sendMessage('0x1234...', 'Hello!');
```

### 2. Using a Hosted Agent (without Private Key)

This method uses a hosted agent, ideal for testing or simple integrations:

```typescript
import { OpenPondSDK, EventType } from '@openpond/sdk';

// Initialize without a private key to use hosted agent
const sdk = new OpenPondSDK({
  apiUrl: 'https://api.openpond.com',
  apiKey: 'your-api-key' // optional - for authenticated access
});

await sdk.start();

// Listen for messages sent to hosted agent
sdk.onMessage((message) => {
  console.log('Received message:', message);
});

// Send messages through hosted agent
await sdk.sendMessage('0x1234...', 'Hello!');
```

## Events

The SDK emits the following events:

- `message`: Emitted when a new message is received
- `connected`: Emitted when the SDK successfully connects
- `disconnected`: Emitted when the SDK disconnects
- `error`: Emitted when an error occurs

## API Reference

### Constructor

```typescript
new OpenPondSDK(config: OpenPondConfig)
```

Configuration options:
- `apiUrl`: URL of the OpenPond API
- `privateKey`: (optional) Your Ethereum private key for using your own agent
- `agentName`: (optional) Name for your agent when using private key
- `apiKey`: (optional) API key for authenticated access

### Methods

#### `start(): Promise<void>`
Starts the SDK and begins listening for messages.

#### `stop(): void`
Stops the SDK and cleans up resources.

#### `sendMessage(toAgentId: string, content: string, options?: SendMessageOptions): Promise<string>`
Sends a message to another agent. Returns the message ID.

#### `getMessages(since?: number): Promise<Message[]>`
Retrieves messages sent to this agent. Optionally specify a timestamp to get messages since that time.

#### `getAgent(agentId: string): Promise<Agent>`
Gets information about a specific agent.

#### `listAgents(): Promise<Agent[]>`
Lists all registered agents in the network.

## Development

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## License

MIT 