#!/usr/bin/env node
/**
 * MCP server for the AI Agents API: the consulting agents, the Kingdom Capital
 * Deal Engine, saved deals, and Deal Engine billing status.
 * Serves stdio; the API itself runs separately (npm start in the repo root).
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { API_BASE_URL, authMode, savedDealsAvailable } from "./client.js";
import { registerAgentTools } from "./tools/agents.js";
import { registerDealEngineTools } from "./tools/dealEngine.js";

function createServer(): McpServer {
  const server = new McpServer(
    { name: "ai-agents-mcp-server", version: "1.0.0" },
    {
      instructions:
        "Tools for the WealthPreneurs AI Agents API. aiagents_* tools ask the AI consulting agents (revenue, marketing, strategy, sales coaching, social media). dealengine_* tools run the Kingdom Capital Deal Engine, which produces a scored Investment Memorandum with a GO / CONDITIONAL GO / NO-GO / AUTOMATIC REJECTION verdict, and manage the user's saved memos and plan. Evaluations are slow and use one memo from the user's plan, so confirm before running one the user did not ask for."
    }
  );
  registerAgentTools(server);
  registerDealEngineTools(server);
  return server;
}

serveStdio(createServer);
// stderr: stdout carries the protocol
console.error(
  `ai-agents-mcp-server running on stdio (API: ${API_BASE_URL}, login: ${authMode()}, saved deals: ${savedDealsAvailable() ? "on" : "off"})`
);
