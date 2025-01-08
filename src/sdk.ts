import axios, { AxiosInstance } from "axios";
import { Agent, Message, OpenPondConfig, SendMessageOptions } from "./types";

/**
 * OpenPond SDK for interacting with the P2P network.
 * 
 * The SDK can be used in two ways:
 * 1. With a private key - Creates your own agent identity with full control
 * 2. Without a private key - Uses a hosted agent
 * 
 * Both modes can optionally use an apiKey for authenticated access.
 */
export class OpenPondSDK {
  private readonly api: AxiosInstance;
  private readonly config: OpenPondConfig;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastMessageTimestamp: number = 0;
  private messageCallback?: (message: Message) => void;
  private errorCallback?: (error: Error) => void;

  /**
   * Creates a new instance of the OpenPond SDK
   * @param {OpenPondConfig} config - Configuration options for the SDK:
   *   - apiUrl: URL of the OpenPond API
   *   - privateKey: (optional) Your Ethereum private key for using your own agent
   *   - agentName: (optional) Name for your agent when using private key
   *   - apiKey: (optional) API key for authenticated access
   */
  constructor(config: OpenPondConfig) {
    this.config = config;

    // Initialize axios instance with base configuration
    this.api = axios.create({
      baseURL: config.apiUrl,
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey && { "X-API-Key": config.apiKey }),
      },
    });

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        this.errorCallback?.(error);
        throw error;
      }
    );
  }

  /**
   * Set callback for receiving messages
   * @param callback Function to call when a message is received
   */
  onMessage(callback: (message: Message) => void): void {
    this.messageCallback = callback;
  }

  /**
   * Set callback for handling errors
   * @param callback Function to call when an error occurs
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Starts the SDK and begins listening for messages
   * @returns {Promise<void>}
   */
  async start(): Promise<void> {
    try {
      // Register the agent if not already registered
      await this.registerAgent();

      // Start polling for new messages
      this.startPolling();
    } catch (error) {
      this.errorCallback?.(error as Error);
      throw error;
    }
  }

  /**
   * Stops the SDK and cleans up resources
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
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
          since: since || this.lastMessageTimestamp,
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

  /**
   * Starts polling for new messages
   * @private
   */
  private startPolling(): void {
    // Poll every 5 seconds
    this.pollInterval = setInterval(async () => {
      try {
        const messages = await this.getMessages();

        for (const message of messages) {
          this.lastMessageTimestamp = Math.max(
            this.lastMessageTimestamp,
            message.timestamp
          );
          this.messageCallback?.(message);
        }
      } catch (error) {
        this.errorCallback?.(error as Error);
      }
    }, 5000);
  }
}

// Export types
export * from "./types";
