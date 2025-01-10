import axios, { AxiosInstance } from "axios";
import EventSource from "eventsource";
import { Agent, Message, OpenPondConfig, SendMessageOptions } from "./types";

/**
 * OpenPond SDK for interacting with the P2P network.
 */
export class OpenPondSDK {
  private readonly api: AxiosInstance;
  private readonly config: OpenPondConfig;
  private eventSource: EventSource | null = null;
  private messageCallback?: (message: Message) => void;
  private errorCallback?: (error: Error) => void;

  constructor(config: OpenPondConfig) {
    this.config = config;

    this.api = axios.create({
      baseURL: config.apiUrl,
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey && { "X-API-Key": config.apiKey }),
      },
    });

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        this.errorCallback?.(error);
        throw error;
      }
    );
  }

  onMessage(callback: (message: Message) => void): void {
    this.messageCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  async start(): Promise<void> {
    try {
      // Register the agent if not already registered
      await this.registerAgent();

      // Setup SSE connection
      const url = new URL(`${this.config.apiUrl}/messages/stream`);

      // Create headers for Node.js EventSource
      const headers: { [key: string]: string } = {
        Accept: "text/event-stream",
      };

      if (this.config.apiKey) {
        headers["X-API-Key"] = this.config.apiKey;
      }
      if (this.config.privateKey) {
        const timestamp = Date.now().toString();
        const message = `Authenticate to OpenPond API at timestamp ${timestamp}`;
        headers["X-Agent-Id"] = this.config.privateKey;
        headers["X-Timestamp"] = timestamp;
        // TODO: Add signature once we implement signing
        // headers["X-Signature"] = signature;
      }

      // Create EventSource with headers
      this.eventSource = new EventSource(url.toString(), { headers });

      // Setup event handlers
      this.eventSource.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data) as Message;
          // Only process messages intended for us
          if (
            this.config.privateKey &&
            message.toAgentId === this.config.privateKey
          ) {
            this.messageCallback?.(message);
          }
        } catch (error) {
          if (error instanceof Error) {
            this.errorCallback?.(error);
          } else {
            this.errorCallback?.(new Error("Failed to parse message"));
          }
        }
      });

      this.eventSource.addEventListener("error", () => {
        this.errorCallback?.(new Error("EventSource connection error"));
      });
    } catch (error) {
      if (error instanceof Error) {
        this.errorCallback?.(error);
      }
      throw error;
    }
  }

  stop(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Sends a message to another agent
   * @param {string} toAgentId - Recipient's Ethereum address
   * @param {string} content - Message content
   * @param {SendMessageOptions} [options] - Additional message options
   * @returns {Promise<string>} Message ID
   */
  async sendMessage(
    toAgentId: string,
    content: string,
    options?: SendMessageOptions
  ): Promise<string> {
    try {
      const response = await this.api.post("/messages", {
        toAgentId,
        content,
        privateKey: this.config.privateKey,
        ...options,
      });

      return response.data.messageId;
    } catch (error) {
      this.errorCallback?.(error as Error);
      throw error;
    }
  }

  /**
   * Retrieves messages sent to this agent
   * @param {number} [since] - Timestamp to fetch messages from
   * @returns {Promise<Message[]>} Array of messages
   */
  async getMessages(since?: number): Promise<Message[]> {
    try {
      const response = await this.api.get("/messages", {
        params: {
          privateKey: this.config.privateKey,
          since: since || 0,
        },
      });

      return response.data.messages;
    } catch (error) {
      this.errorCallback?.(error as Error);
      throw error;
    }
  }

  /**
   * Gets information about an agent
   * @param {string} agentId - Agent's Ethereum address
   * @returns {Promise<Agent>} Agent information
   */
  async getAgent(agentId: string): Promise<Agent> {
    try {
      const response = await this.api.get(`/agents/${agentId}`);
      return response.data;
    } catch (error) {
      this.errorCallback?.(error as Error);
      throw error;
    }
  }

  /**
   * Lists all registered agents
   * @returns {Promise<Agent[]>} Array of agents
   */
  async listAgents(): Promise<Agent[]> {
    try {
      const response = await this.api.get("/agents");
      return response.data.agents;
    } catch (error) {
      this.errorCallback?.(error as Error);
      throw error;
    }
  }

  /**
   * Registers this agent with the network
   * @private
   */
  private async registerAgent(): Promise<void> {
    try {
      await this.api.post("/agents/register", {
        privateKey: this.config.privateKey,
        name: this.config.agentName,
      });
    } catch (error) {
      // Ignore if already registered
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        return;
      }
      throw error;
    }
  }
}

// Export types
export * from "./types";
