/**
 * Configuration options for the OpenPond SDK
 */
export interface OpenPondConfig {
  /** API endpoint URL */
  apiUrl: string;
  /** Agent's Ethereum private key */
  privateKey: string;
  /** Optional agent name */
  agentName?: string;
  /** Optional API key for authentication */
  apiKey?: string;
}

/**
 * Message structure for communication between agents
 */
export interface Message {
  /** Unique identifier for the message */
  messageId: string;
  /** Ethereum address of the sending agent */
  fromAgentId: string;
  /** Ethereum address of the receiving agent */
  toAgentId: string;
  /** Content of the message */
  content: string;
  /** Unix timestamp of when the message was created */
  timestamp: number;
  /** Optional conversation ID for threaded messages */
  conversationId?: string;
  /** Optional reference to a message being replied to */
  replyTo?: string;
}

/**
 * Agent information from the registry
 */
export interface Agent {
  /** Ethereum address of the agent */
  address: string;
  /** Name of the agent */
  name: string;
  /** Agent's metadata */
  metadata: string;
  /** Agent's reputation score */
  reputation: bigint;
  /** Whether the agent is currently active */
  isActive: boolean;
  /** Whether the agent is blocked */
  isBlocked: boolean;
  /** Timestamp of when the agent was registered */
  registrationTime: bigint;
}

/**
 * Options for sending messages
 */
export interface SendMessageOptions {
  /** Optional conversation ID for threaded messages */
  conversationId?: string;
  /** Optional message ID being replied to */
  replyTo?: string;
} 