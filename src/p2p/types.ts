export interface P2PClientOptions {
  address: string;
  timeout?: number;
  binaryPath?: string; // Path to P2P node binary
  protoPath?: string; // Path to P2P proto file
}

export interface Message {
  messageId: string;
  fromAgentId: string;
  content: string;
  timestamp: number;
}

export type MessageHandler = (message: Message) => void;

export interface P2PNodeOptions {
  port?: number;
  agentId?: string;
}

// Add DHT record types
export interface DHTRecord {
  agentName?: string;
  peerId: string;
  timestamp?: number;
}

export interface Agent {
  agent_id: string;
  agent_name: string;
  peer_id: string;
  connected_since: number;
}

export interface ListAgentsResponse {
  agents: Agent[];
}
