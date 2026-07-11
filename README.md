# vibe-code-runner

**Vibe Code Bot** — An autonomous AI coding agent powered by DeepSeek API.

This agent takes a natural language prompt describing a coding task, explores the target repository, and uses tools to read, write, and modify files until the task is complete.

## Features

- 🤖 **Autonomous coding** — Give it a prompt and it works through the task step by step
- 🛠️ **6 built-in tools** — List directories, read/write files, execute commands, search code, and replace text
- 📁 **Works on any repo** — Point it at any codebase and it will explore and modify it
- 🔄 **Iterative loop** — The agent plans, acts, and verifies, retrying up to a configurable max iterations
- ✅ **Completion detection** — Automatically detects when the agent signals it's done

## Requirements

- [Node.js](https://nodejs.org/) 18+
- A [DeepSeek API key](https://platform.deepseek.com/)

## Installation

```bash
git clone <repo-url>
cd vibe-code-runner
cd agent
npm install
```

## Usage

```bash
export DEEPSEEK_API_KEY="your-api-key-here"

node agent/vibe-agent.js \
  --prompt "Add a README to the project" \
  --repo-dir /path/to/target/repo \
  --max-iters 25
```

### Arguments

| Argument       | Description                                      | Required | Default |
|----------------|--------------------------------------------------|----------|---------|
| `--prompt`     | The coding task description                      | Yes      | —       |
| `--repo-dir`   | Path to the target repository                    | Yes      | —       |
| `--max-iters`  | Maximum number of agent iterations               | No       | `25`    |

### Environment Variables

| Variable            | Description         | Required |
|---------------------|---------------------|----------|
| `DEEPSEEK_API_KEY`  | DeepSeek API key    | Yes      |

## How It Works

1. The agent receives a task prompt and explores the repository structure
2. It calls DeepSeek's chat API with tool definitions
3. The model decides which tools to use (read files, write code, run commands, etc.)
4. Tool results are fed back to the model for the next iteration
5. The loop continues until the agent signals completion or the max iteration limit is reached
6. A result summary is saved to `.vibe-agent-result.json` in the target repo

## Tools Available to the Agent

| Tool               | Description                                        |
|--------------------|----------------------------------------------------|
| `list_directory`   | List files and directories at a given path         |
| `read_file`        | Read file contents with line numbers               |
| `write_file`       | Create or overwrite a file                         |
| `execute_command`  | Run a shell command (npm install, tests, etc.)     |
| `search_code`      | Grep for patterns in the codebase                  |
| `replace_in_file`  | Perform exact string replacement in an existing file |

## Project Structure

```
vibe-code-runner/
├── README.md
└── agent/
    ├── package.json
    └── vibe-agent.js    # The main agent script
```

## License

MIT
