#!/usr/bin/env node

/**
 * Vibe Code Agent - Autonomous coding agent powered by DeepSeek API.
 *
 * Usage:
 *   node vibe-agent.js --prompt "your task" --repo-dir /path/to/repo [--max-iters 25]
 *
 * Env vars:
 *   DEEPSEEK_API_KEY - DeepSeek API key
 */

import OpenAI from "openai";
import { readFile, writeFile, mkdir } from "fs/promises";
import { execSync, exec } from "child_process";
import { readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { promisify } from "util";
import { existsSync } from "fs";

const execAsync = promisify(exec);

// ── CLI args ──────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { prompt: "", repoDir: "", maxIters: 25 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--prompt" && args[i + 1]) opts.prompt = args[++i];
    else if (args[i] === "--repo-dir" && args[i + 1]) opts.repoDir = args[++i];
    else if (args[i] === "--max-iters" && args[i + 1]) opts.maxIters = parseInt(args[++i]);
  }
  return opts;
}

// ── DeepSeek client ───────────────────────────────────────────

const deepseek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY || "",
});

// ── Tools ─────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List files and directories at a given path. Use to explore the repo structure.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from repo root. Use '.' for root." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file. Returns the file content with line numbers.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from repo root." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Use this to create new files or completely rewrite existing ones.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from repo root." },
          content: { type: "string", description: "The full content to write to the file." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Execute a shell command in the repo directory. Use for: npm install, npm test, git status, building, running linters, etc. Returns stdout and stderr.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The shell command to execute." },
          timeout_ms: { type: "number", description: "Timeout in ms. Default 60000 (1 min). Max 300000 (5 min)." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description: "Search for a pattern in the codebase using grep. Returns matching file paths and line content.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Pattern to search for (regex supported)." },
          path: { type: "string", description: "Directory to search in. Default '.' for entire repo." },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_in_file",
      description: "Perform exact string replacement in an existing file. More precise than write_file for small edits.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from repo root." },
          old_str: { type: "string", description: "The exact text to replace." },
          new_str: { type: "string", description: "The replacement text." },
        },
        required: ["path", "old_str", "new_str"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for documentation, API references, or solutions. Returns top results with titles, URLs, and snippets. Use this to find current documentation or debug errors.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query. Be specific, e.g. 'React useEffect cleanup function example 2025'." },
          max_results: { type: "number", description: "Max results (default 5, max 10)." },
        },
        required: ["query"],
      },
    },
  },
];

// ── Tool implementations ──────────────────────────────────────

async function toolListDirectory(repoDir, { path: dirPath }) {
  const fullPath = resolve(repoDir, dirPath || ".");
  if (!existsSync(fullPath)) return JSON.stringify({ error: `Directory not found: ${dirPath}` });

  const entries = readdirSync(fullPath, { withFileTypes: true });
  const items = entries
    .filter((e) => !e.name.startsWith(".git") && !e.name.startsWith("node_modules"))
    .map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
      size: e.isFile() ? statSync(join(fullPath, e.name)).size : undefined,
    }))
    .slice(0, 100); // limit to 100 entries

  return JSON.stringify({ path: dirPath || ".", entries: items, count: items.length });
}

async function toolReadFile(repoDir, { path: filePath }) {
  const fullPath = resolve(repoDir, filePath);
  if (!existsSync(fullPath)) return JSON.stringify({ error: `File not found: ${filePath}` });

  try {
    const content = await readFile(fullPath, "utf-8");
    const lines = content.split("\n");
    const numbered = lines.map((line, i) => `${String(i + 1).padStart(4, " ")}| ${line}`).join("\n");

    // Truncate very large files
    if (lines.length > 500) {
      return JSON.stringify({
        path: filePath,
        total_lines: lines.length,
        content: numbered.split("\n").slice(0, 500).join("\n") + `\n... (truncated, ${lines.length - 500} more lines)`,
        warning: `File truncated at 500 lines. Use read_file with specific line ranges for large files.`,
      });
    }
    return JSON.stringify({ path: filePath, total_lines: lines.length, content: numbered });
  } catch (e) {
    return JSON.stringify({ error: `Failed to read ${filePath}: ${e.message}` });
  }
}

async function toolWriteFile(repoDir, { path: filePath, content }) {
  const fullPath = resolve(repoDir, filePath);
  const dir = join(fullPath, "..");

  try {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(fullPath, content, "utf-8");
    const lines = content.split("\n").length;
    return JSON.stringify({ ok: true, path: filePath, lines, size_bytes: Buffer.byteLength(content) });
  } catch (e) {
    return JSON.stringify({ error: `Failed to write ${filePath}: ${e.message}` });
  }
}

async function toolExecuteCommand(repoDir, { command, timeout_ms = 60000 }) {
  const timeout = Math.min(timeout_ms, 300000);
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: repoDir,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return JSON.stringify({ ok: true, stdout: stdout.substring(0, 10000), stderr: stderr ? stderr.substring(0, 5000) : "", exit_code: 0 });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      stdout: e.stdout ? e.stdout.substring(0, 5000) : "",
      stderr: e.stderr ? e.stderr.substring(0, 5000) : "",
      exit_code: e.code || 1,
      error: e.message?.substring(0, 500),
    });
  }
}

async function toolSearchCode(repoDir, { pattern, path: searchPath = "." }) {
  const fullPath = resolve(repoDir, searchPath);
  try {
    const { stdout } = await execAsync(
      `grep -rn --include="*.{js,ts,jsx,tsx,py,rb,go,rs,java,css,html,json,md,yml,yaml}" "${pattern.replace(/"/g, '\\"')}" "${fullPath}" 2>/dev/null | head -50 || true`,
      { timeout: 10000, maxBuffer: 1024 * 1024 }
    );
    const lines = stdout.trim().split("\n").filter(Boolean);
    return JSON.stringify({ pattern, matches: lines.length, results: lines.slice(0, 50) });
  } catch (e) {
    return JSON.stringify({ error: `Search failed: ${e.message}` });
  }
}

async function toolReplaceInFile(repoDir, { path: filePath, old_str, new_str }) {
  const fullPath = resolve(repoDir, filePath);
  if (!existsSync(fullPath)) return JSON.stringify({ error: `File not found: ${filePath}` });

  try {
    const content = await readFile(fullPath, "utf-8");
    if (!content.includes(old_str)) {
      return JSON.stringify({ error: "old_str not found in file. The text must match exactly including whitespace." });
    }

    // Replace only the first occurrence
    const newContent = content.replace(old_str, new_str);
    if (content === newContent) {
      return JSON.stringify({ error: "No changes made (old_str matches but replacement produced identical content)." });
    }

    await writeFile(fullPath, newContent, "utf-8");
    return JSON.stringify({ ok: true, path: filePath, replaced: true });
  } catch (e) {
    return JSON.stringify({ error: `Failed to edit ${filePath}: ${e.message}` });
  }
}

async function toolWebSearch({ query, max_results = 5 }) {
  try {
    const limit = Math.min(max_results, 10);
    // Use DuckDuckGo HTML search (free, no API key)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "vibe-code-agent/1.0" },
    });
    const html = await response.text();

    // Parse results from HTML
    const results = [];
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*<\/[^>]*>)*[^<]*)<\/a>/g;

    const links = [...html.matchAll(linkRegex)];
    const snippets = [...html.matchAll(snippetRegex)];

    for (let i = 0; i < Math.min(links.length, limit); i++) {
      results.push({
        title: links[i][2].replace(/<[^>]*>/g, "").trim(),
        url: links[i][1],
        snippet: snippets[i] ? snippets[i][1].replace(/<[^>]*>/g, "").trim() : "",
      });
    }

    if (results.length === 0) {
      return JSON.stringify({ query, results: [], note: "No results found. Try a different query." });
    }

    return JSON.stringify({ query, count: results.length, results });
  } catch (e) {
    return JSON.stringify({ error: `Web search failed: ${e.message}` });
  }
}

// ── Tool dispatcher ───────────────────────────────────────────

async function executeTool(repoDir, toolCall) {
  const name = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments || "{}");
  console.log(`  [tool] ${name}(${JSON.stringify(args).substring(0, 120)})`);

  switch (name) {
    case "list_directory": return toolListDirectory(repoDir, args);
    case "read_file": return toolReadFile(repoDir, args);
    case "write_file": return toolWriteFile(repoDir, args);
    case "execute_command": return toolExecuteCommand(repoDir, args);
    case "search_code": return toolSearchCode(repoDir, args);
    case "replace_in_file": return toolReplaceInFile(repoDir, args);
    case "web_search": return toolWebSearch(args);
    default: return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ── System prompt ─────────────────────────────────────────────

function systemPrompt(repoStructure) {
  return `You are an expert software engineer and coding agent. You work in a real codebase and have tools to read, write, and execute code.

You are given a coding task and must complete it fully. Work step by step:
1. First, explore and understand the codebase structure and relevant files
2. Plan your approach
3. Implement the changes using the tools
4. Verify everything works by running appropriate commands (build, test, lint)
5. If something fails, debug and fix it

Rules:
- Use the EXACT file paths and function signatures that exist in the codebase
- When writing new files, follow the existing code style and conventions
- Use web_search to look up documentation, API references, or error solutions when you're unsure
- Always verify your changes compile/run before declaring done
- For npm/Node.js projects, npm install before running
- For Python projects, pip install before running
- Write COMPLETE code - never use placeholder comments like "// TODO" or "// implement later"
- If you can't complete the task, explain exactly what's missing
- When you're DONE, output a summary starting with "✅ DONE:" followed by what was accomplished

Repo structure:
${repoStructure}`;
}

// ── Main agent loop ───────────────────────────────────────────

async function runAgent(prompt, repoDir, maxIters = 25) {
  console.log("=".repeat(60));
  console.log("Vibe Code Agent - Starting");
  console.log("=".repeat(60));
  console.log(`Repo: ${repoDir}`);
  console.log(`Prompt: ${prompt}`);
  console.log(`Max iterations: ${maxIters}`);
  console.log("=".repeat(60));

  // Get initial repo structure
  const repoStructure = await toolListDirectory(repoDir, { path: "." });
  console.log(`\nRepo structure:\n${repoStructure}\n`);

  const messages = [
    { role: "system", content: systemPrompt(repoStructure) },
    { role: "user", content: prompt },
  ];

  let summary = "";
  let prDescription = "";

  for (let i = 0; i < maxIters; i++) {
    console.log(`\n--- Iteration ${i + 1}/${maxIters} ---`);

    try {
      const response = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 8000,
      });

      const msg = response.choices[0].message;
      messages.push(msg);

      // If the model returns text content (no tool calls), it's done
      if (msg.content && !msg.tool_calls) {
        console.log(`\n[agent response]:\n${msg.content}\n`);
        summary = msg.content;

        // Check for done marker
        if (msg.content.includes("✅ DONE:") || msg.content.includes("✅ DONE")) {
          console.log("\nAgent signaled completion.");
          break;
        }

        // If no tool calls and not explicit done, ask if truly done
        messages.push({
          role: "user",
          content: "Have you completed the task? If yes, start your response with '✅ DONE:'. If not, what remaining actions are needed? You can use tools to take those actions.",
        });
        continue;
      }

      // If model has tool calls, execute them
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const result = await executeTool(repoDir, toolCall);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
        continue;
      }

      // Fallback - model returned nothing useful
      console.log("Model returned neither content nor tool calls, retrying...");
      messages.push({
        role: "user",
        content: "Please continue with your task. Use tools to explore and modify the codebase.",
      });

    } catch (error) {
      console.error(`Error in iteration ${i + 1}:`, error.message);

      if (error.status === 429) {
        console.log("Rate limited. Waiting 5 seconds...");
        await new Promise((r) => setTimeout(r, 5000));
        messages.pop(); // Remove the failed message
        i--; // Retry this iteration
        continue;
      }

      // For other errors, report and break
      summary = `Error: ${error.message}`;
      break;
    }
  }

  // Build PR description from the conversation
  prDescription = `## Vibe Code Bot - AI-Generated Changes\n\n**Prompt:** ${prompt}\n\n### Summary\n${summary.substring(0, 2000)}`;

  console.log("\n" + "=".repeat(60));
  console.log("Agent run complete");
  console.log("=".repeat(60));

  return { summary, prDescription };
}

// ── CLI entry ─────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (!opts.prompt) {
    console.error("Error: --prompt is required");
    process.exit(1);
  }

  if (!opts.repoDir) {
    console.error("Error: --repo-dir is required");
    process.exit(1);
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("Error: DEEPSEEK_API_KEY environment variable is required");
    process.exit(1);
  }

  if (!existsSync(opts.repoDir)) {
    console.error(`Error: Repo directory not found: ${opts.repoDir}`);
    process.exit(1);
  }

  const result = await runAgent(opts.prompt, opts.repoDir, opts.maxIters);

  // Write result summary for the workflow to read
  await writeFile(
    join(opts.repoDir, ".vibe-agent-result.json"),
    JSON.stringify(result, null, 2)
  );

  console.log(`\nResult saved to .vibe-agent-result.json`);
  console.log(`Summary: ${result.summary.substring(0, 300)}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
