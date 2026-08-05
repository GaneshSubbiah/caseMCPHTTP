// server.ts
// The one place tools get registered. Right now: exactly ONE tool,
// get_account_summary. When you're ready to add more (get_open_cases,
// create_case, whatever), copy the registerTool block below, change the
// name/description/schema/handler, and add it before "return server".
// Nothing else in this file needs to change to add a tool.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runSoqlQuery } from "./salesforce.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "sf-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "get_account_summary",
    {
      title: "Get Salesforce Account Summary",
      description:
        "Looks up a Salesforce Account by name and returns its Industry, Phone, and Billing City. Use this whenever the user asks about a specific company/account in Salesforce.",
      inputSchema: {
        accountName: z
          .string()
          .min(1, "accountName cannot be empty")
          .describe("The Account Name to search for, e.g. 'Acme Corp'"),
      },
    },
    async ({ accountName }) => {
      // Guard against blank input reaching a wildcard-matching query.
      if (!accountName.trim()) {
        return { content: [{ type: "text", text: "Please provide an account name to search for." }], isError: true };
      }

      // Basic SOQL injection guard - escape single quotes in user input.
      const safeName = accountName.replace(/'/g, "\\'");
      const soql = `SELECT Name, Industry, Phone, BillingCity FROM Account WHERE Name LIKE '%${safeName}%' LIMIT 5`;

      const result = await runSoqlQuery(soql);

      if (!result.records || result.records.length === 0) {
        return { content: [{ type: "text", text: `No Account found matching "${accountName}".` }] };
      }

      const summary = result.records
        .map(
          (r: any) =>
            `${r.Name} - Industry: ${r.Industry ?? "n/a"}, Phone: ${r.Phone ?? "n/a"}, City: ${r.BillingCity ?? "n/a"}`
        )
        .join("\n");

      return { content: [{ type: "text", text: summary }] };
    }
  );

  // ---- Next tool goes here later, e.g. get_open_cases ----

  return server;
}
