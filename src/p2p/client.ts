import { credentials } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { ChildProcess, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { Logger } from "../../src/utils/logger";
import {
  ListAgentsResponse,
  MessageHandler,
  P2PClientOptions,
  P2PNodeOptions,
} from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves a path relative to @openpond/sdk package in node_modules
 */
function resolvePackagePath(relativePath: string): string {
  // Start from the current file's location
  let currentDir = __dirname;

  // Navigate up until we find node_modules or hit the root
  while (currentDir !== path.parse(currentDir).root) {
    const nodeModulesPath = path.join(
      currentDir,
      "node_modules",
      "@duckai",
      "sdk",
      relativePath
    );
    if (path.basename(currentDir) === "node_modules") {
      // If we're already in node_modules, look for @duckai/sdk
      return path.join(currentDir, "@duckai", "sdk", relativePath);
    } else if (path.basename(path.dirname(currentDir)) === "@duckai") {
      // If we're in the package itself, resolve relative to dist
      return path.join(currentDir, "..", relativePath);
    }

    try {
      // Check if the node_modules path exists
      if (require("fs").existsSync(nodeModulesPath)) {
        return nodeModulesPath;
      }
    } catch (e) {
      // Ignore errors and continue searching
    }

    currentDir = path.dirname(currentDir);
  }

  // Fallback to local dist directory if we can't find node_modules
  return path.join(__dirname, "..", "..", relativePath);
}

export interface AgentInfo {
  agentId: string;
  peerId: string;
  agentName: string;
  connectedSince: number;
}

export class P2PClient {
  private client: any;
  private stream: any;
  private messageHandler?: MessageHandler;
  private connected: boolean = false;
  private readonly timeout: number;
  private nodeProcess?: ChildProcess;
  private readonly protoPath: string;
  private readonly binaryPath: string;

  constructor(private options: P2PClientOptions) {
    this.timeout = options.timeout || 5000;

    // Set default paths that work both in development and when installed as a package
    this.protoPath =
      options.protoPath || resolvePackagePath("dist/proto/p2p.proto");
    this.binaryPath =
      options.binaryPath || resolvePackagePath("dist/node/p2p-node.js");

    Logger.info("p2p", "Initializing P2P client", {
      protoPath: this.protoPath,
      binaryPath: this.binaryPath,
      address: options.address,
    });
  }

  /**
   * Start the P2P node binary and connect to it
   */
  async connect(nodeOptions?: P2PNodeOptions): Promise<void> {
    try {
      // Start P2P node if binary path provided
      await this.startNode(nodeOptions);

      // Wait a bit for gRPC server to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Load proto definition
      const packageDefinition = loadSync(this.protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const { loadPackageDefinition } = await import("@grpc/grpc-js");
      const proto = loadPackageDefinition(packageDefinition) as any;

      // Try to connect with retries
      let retries = 3;
      while (retries > 0) {
        try {
          // Create gRPC client
          this.client = new proto.p2p.P2PNode(
            this.options.address,
            credentials.createInsecure()
          );

          // Extract gRPC port from address
          const grpcPort = parseInt(this.options.address.split(":")[1], 10);

          // Set up connection stream with connect request
          this.stream = this.client.Connect({
            port: grpcPort,
            name: nodeOptions?.agentId || "default-agent",
            privateKey: process.env.PRIVATE_KEY || "",
          });

          // Consider connected as soon as stream is established
          this.connected = true;

          // Set up message handling
          this.stream.on("data", (event: any) => {
            Logger.info("p2p", "Received event from gRPC stream", {
              eventType: event.ready
                ? "ready"
                : event.peerConnected
                ? "peerConnected"
                : event.error
                ? "error"
                : event.message
                ? "message"
                : "unknown",
              hasHandler: !!this.messageHandler,
            });

            if (event.message && this.messageHandler) {
              Logger.info("p2p", "Processing message from gRPC stream", {
                messageId: event.message.messageId,
                from: event.message.from,
                encrypted: event.message.content instanceof Buffer,
                contentLength: event.message.content.length,
              });

              // Pass to handler
              this.messageHandler({
                messageId: event.message.messageId,
                fromAgentId: event.message.from,
                content: event.message.content.toString(),
                timestamp: Number(event.message.timestamp),
              });
            } else if (event.message) {
              Logger.warn("p2p", "Received message but no handler registered", {
                messageId: event.message.messageId,
                from: event.message.from,
              });
            } else {
              Logger.debug("p2p", "Received non-message event", {
                eventType: event.ready
                  ? "ready"
                  : event.peerConnected
                  ? "peerConnected"
                  : event.error
                  ? "error"
                  : "unknown",
                hasHandler: !!this.messageHandler,
              });
            }
          });

          this.stream.on("error", (error: Error) => {
            Logger.error("p2p", "Stream error", {
              error: error instanceof Error ? error.message : String(error),
            });
            this.connected = false;
          });

          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          Logger.warn("p2p", "Connection failed, retrying...", {
            error: error instanceof Error ? error.message : String(error),
            retriesLeft: retries,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      Logger.info("p2p", "Connected to P2P network", {
        address: this.options.address,
        binaryPath: this.options.binaryPath,
      });
    } catch (error) {
      await this.cleanup();
      throw new Error(
        `Failed to connect: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Start the P2P node binary
   */
  private async findNodeExecutable(): Promise<string> {
    try {
      // Try running node --version to find the actual executable
      const { execSync } = require("child_process");
      execSync("node --version"); // Test if node is directly accessible
      return "node"; // If it works, just use 'node' and let PATH handle it
    } catch (error) {
      Logger.warn("p2p", "Could not find node in PATH, trying alternatives", {
        error: error instanceof Error ? error.message : String(error),
      });

      // If that fails, try explicit paths
      const possiblePaths = [
        process.env.NODE, // Explicit NODE env var
        process.execPath, // Current node path
        "/usr/bin/node", // System node
        "/usr/local/bin/node", // Homebrew/custom node
      ].filter(Boolean); // Remove undefined/null entries

      for (const nodePath of possiblePaths) {
        try {
          if (nodePath) {
            require("fs").accessSync(nodePath, require("fs").constants.X_OK);
            Logger.info("p2p", "Found working node executable", {
              path: nodePath,
            });
            return nodePath;
          }
        } catch (e) {
          // Continue to next path
        }
      }

      // If we get here, just return 'node' and hope PATH works
      Logger.warn("p2p", "No node executable found, falling back to 'node'");
      return "node";
    }
  }

  private async startNode(options?: P2PNodeOptions): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (!this.binaryPath) {
        reject(new Error("Binary path not found"));
        return;
      }

      // Extract port from address (e.g. "localhost:50051" -> 50051)
      const grpcPort = parseInt(this.options.address.split(":")[1], 10);

      const nodeExecutable = await this.findNodeExecutable();

      Logger.info("p2p", "Starting P2P node", {
        binaryPath: this.binaryPath,
        options,
        grpcPort,
        nodeExecutable,
      });

      const args = [
        "-p",
        String(grpcPort), // Use gRPC port for the server
        "-n",
        options?.agentId || "default-agent",
        "-k",
        process.env.PRIVATE_KEY || "",
      ];

      try {
        // Verify node executable exists
        require("fs").accessSync(nodeExecutable, require("fs").constants.X_OK);

        Logger.info("p2p", "Spawning p2p node process", {
          binaryPath: this.binaryPath,
          args,
          cwd: path.dirname(this.binaryPath),
          nodeExecutable,
        });

        this.nodeProcess = spawn(nodeExecutable, [this.binaryPath, ...args], {
          stdio: "pipe",
          env: {
            ...process.env,
            NODE_PATH: process.env.NODE_PATH || path.dirname(this.binaryPath),
          },
          cwd: path.dirname(this.binaryPath),
        });

        this.nodeProcess.stdout?.on("data", (data: Buffer) => {
          Logger.debug("p2p", "Node stdout", { data: data.toString() });
        });

        this.nodeProcess.stderr?.on("data", (data: Buffer) => {
          Logger.warn("p2p", "Node stderr", { data: data.toString() });
        });

        this.nodeProcess.on("error", (error: Error) => {
          Logger.error("p2p", "Node process error", { error: error.message });
          reject(error);
        });

        this.nodeProcess.on("exit", (code: number | null) => {
          if (code !== 0) {
            Logger.error("p2p", "Node process exited with error", { code });
            reject(new Error(`P2P node exited with code ${code}`));
          }
        });

        // Give the node some time to start up
        setTimeout(resolve, 1000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send a message to another agent
   */
  async sendMessage(to: string, content: string): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected to P2P network");
    }

    try {
      await new Promise<void>((resolve, reject) => {
        this.client.SendMessage(
          {
            to,
            content: Buffer.from(content),
          },
          (error: Error | null) => {
            if (error) {
              Logger.error("p2p", "Failed to send message", {
                to,
                error: error.message,
              });
              reject(error);
            } else {
              Logger.debug("p2p", "Message sent", { to });
              resolve();
            }
          }
        );
      });
    } catch (error) {
      throw new Error(
        `Failed to send message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Set message handler
   */
  onMessage(handler: MessageHandler): void {
    Logger.info("p2p", "Registering message handler");
    this.messageHandler = handler;
    Logger.info("p2p", "Message handler registered", {
      hasHandler: !!this.messageHandler,
      handlerType: typeof handler,
    });
  }

  /**
   * Disconnect from P2P network
   */
  async disconnect(): Promise<void> {
    Logger.info("p2p", "Disconnecting from P2P network");

    if (this.stream) {
      this.stream.cancel();
    }

    if (this.nodeProcess) {
      this.nodeProcess.kill();
    }

    await this.cleanup();
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    this.connected = false;
    this.stream = null;
    this.client = null;
    this.messageHandler = undefined;

    if (this.nodeProcess) {
      this.nodeProcess.kill();
      this.nodeProcess = undefined;
    }
  }

  /**
   * List all agents in the P2P network
   */
  async listAgents(): Promise<ListAgentsResponse> {
    if (!this.connected || !this.client) {
      throw new Error("Not connected to P2P network");
    }

    try {
      return new Promise<ListAgentsResponse>((resolve, reject) => {
        this.client.ListAgents(
          {},
          (error: Error | null, response: ListAgentsResponse) => {
            if (error) {
              Logger.error("p2p", "Failed to list agents", {
                error: error.message,
              });
              reject(error);
            } else {
              // Add debug logging
              /* Logger.debug("p2p", "Raw ListAgents response", {
                response,
                hasRecords: !!response?.agents,
                recordKeys: response?.agents
                  ? Object.keys(response.agents)
                  : [],
              }); */

              resolve(response);
            }
          }
        );
      });
    } catch (error) {
      throw new Error(
        `Failed to list agents: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
