# Claude Agent Skills — Technical Reference

> Researched 2026-02-26 from official Anthropic documentation:
> - https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
> - https://platform.claude.com/docs/en/agent-sdk/skills
> - https://platform.claude.com/docs/en/agents-and-tools/agent-skills/quickstart
> - https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

---

## 1. What Are Agent Skills?

Agent Skills are **modular, filesystem-based capabilities** that extend Claude with domain-specific expertise. Each Skill is packaged as a directory containing a `SKILL.md` file with instructions, metadata, and optional bundled resources (scripts, templates, reference docs).

**Key distinction from tools:** Tools are executable functions (Read, Bash, Grep, MCP tools) that Claude invokes to perform actions. Skills are **instructional packages** — they provide Claude with procedural knowledge, workflows, best practices, and bundled scripts that transform a general-purpose agent into a domain specialist. Skills *use* tools to accomplish tasks; they are not tools themselves.

**Key distinction from prompts:** Prompts are conversation-level instructions for one-off tasks. Skills are **reusable, auto-discovered**, and load on-demand — eliminating the need to repeatedly provide the same guidance across conversations.

### What Problems Do Skills Solve?

1. **Repetitive context**: Without Skills, you must re-explain domain knowledge every conversation. Skills encode it once and load automatically.
2. **Token efficiency**: Skills use progressive disclosure — only metadata loads at startup (~100 tokens per Skill). Full instructions load only when triggered.
3. **Consistency**: Bundled scripts provide deterministic operations. Claude executes pre-written code rather than generating it each time.
4. **Specialization**: Skills transform generic Claude into a domain expert (PDF processing, BigQuery analysis, code review, etc.).
5. **Composability**: Multiple Skills can coexist; Claude selects the right one based on task context.

---

## 2. Skill Structure and Definition

Every Skill lives in a directory with a required `SKILL.md` file:

```
.claude/skills/processing-pdfs/
├── SKILL.md              # Required — main instructions + YAML frontmatter
├── FORMS.md              # Optional — additional reference (loaded on demand)
├── REFERENCE.md          # Optional — API reference (loaded on demand)
└── scripts/
    ├── analyze_form.py   # Optional — utility script (executed, not loaded into context)
    └── validate.py       # Optional — validation script
```

### SKILL.md Format

```yaml
---
name: processing-pdfs
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
---

# PDF Processing

## Quick Start

Use pdfplumber to extract text from PDFs:

```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

## Advanced Features

**Form filling**: See [FORMS.md](FORMS.md) for complete guide
**API reference**: See [REFERENCE.md](REFERENCE.md) for all methods
```

### YAML Frontmatter Requirements

| Field | Rules |
|---|---|
| `name` | Required. Max 64 chars. Lowercase letters, numbers, hyphens only. No XML tags. Cannot contain "anthropic" or "claude". |
| `description` | Required. Max 1024 chars. Non-empty. No XML tags. Must describe what the Skill does AND when to use it. Write in third person. |

### Naming Conventions

Prefer gerund form (verb + -ing):
- `processing-pdfs`, `analyzing-spreadsheets`, `managing-databases`, `testing-code`

Avoid vague names: `helper`, `utils`, `tools`, `documents`

---

## 3. Progressive Disclosure — Three Levels of Loading

Skills use a progressive disclosure architecture to minimize token consumption:

| Level | When Loaded | Token Cost | Content |
|---|---|---|---|
| **Level 1: Metadata** | Always (at startup) | ~100 tokens per Skill | `name` and `description` from YAML frontmatter, injected into system prompt |
| **Level 2: Instructions** | When Skill is triggered | Under 5K tokens | SKILL.md body — workflows, instructions, guidance |
| **Level 3: Resources** | As needed | Effectively unlimited | Bundled files read via bash; scripts executed with only output entering context |

**How it works:**

1. **Startup**: System prompt includes all Skills' metadata — e.g., `"PDF Processing - Extract text and tables from PDF files..."`
2. **User request**: "Extract the text from this PDF"
3. **Claude reads**: `bash: read .claude/skills/processing-pdfs/SKILL.md` — instructions enter context
4. **Claude determines**: Form filling not needed, FORMS.md is NOT read
5. **Claude executes**: Uses instructions to complete the task

Scripts are **executed** via bash — their source code never enters the context window. Only the script's output consumes tokens.

---

## 4. Using Skills in the Claude Agent SDK (TypeScript)

### Configuration Requirements

Skills in the Agent SDK are **filesystem-based only** — there is no programmatic API for registering Skills. You must:

1. Create `SKILL.md` files in `.claude/skills/` (project) or `~/.claude/skills/` (user-global)
2. Include `"Skill"` in your `allowedTools` configuration
3. Set `settingSources` to load Skills from the filesystem (this is NOT the default)

### TypeScript API

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Help me process this PDF document",
  options: {
    cwd: "/path/to/project",              // Must contain .claude/skills/
    settingSources: ["user", "project"],   // REQUIRED to load Skills from filesystem
    allowedTools: ["Skill", "Read", "Write", "Bash"]  // "Skill" enables Skill discovery
  }
})) {
  console.log(message);
}
```

### Critical: settingSources Is Required

**By default, the SDK does NOT load any filesystem settings.** Without `settingSources`, Skills will not be discovered even if the files exist:

```typescript
// WRONG — Skills won't be loaded
const options = {
  allowedTools: ["Skill"]
};

// CORRECT — Skills will be loaded
const options = {
  settingSources: ["user", "project"],  // Required!
  allowedTools: ["Skill"]
};
```

### settingSources Values

- `"project"` — Loads Skills from `.claude/skills/` relative to `cwd` (shared via git with team)
- `"user"` — Loads Skills from `~/.claude/skills/` (personal, across all projects)

### Skill Locations

| Location | Scope | Loaded When |
|---|---|---|
| `.claude/skills/*/SKILL.md` | Project-level, shared via git | `settingSources` includes `"project"` |
| `~/.claude/skills/*/SKILL.md` | User-level, personal | `settingSources` includes `"user"` |
| Plugin Skills | Plugin-bundled | Plugin is installed |

### Tool Access Control

The `allowed-tools` frontmatter field in SKILL.md is **only supported in Claude Code CLI**. It does NOT apply when using Skills through the SDK. Control tool access through the main `allowedTools` option:

```typescript
// Skills can only use Read, Grep, and Glob tools
for await (const message of query({
  prompt: "Analyze the codebase structure",
  options: {
    settingSources: ["user", "project"],
    allowedTools: ["Skill", "Read", "Grep", "Glob"]  // Restricted toolset
  }
})) {
  console.log(message);
}
```

### Discovering Available Skills

```typescript
for await (const message of query({
  prompt: "What Skills are available?",
  options: {
    settingSources: ["user", "project"],
    allowedTools: ["Skill"]
  }
})) {
  console.log(message);
}
```

---

## 5. Using Skills in the Claude API (Pre-built Skills)

Anthropic provides four pre-built Agent Skills for document tasks:

| Skill ID | Capability |
|---|---|
| `pptx` | Create presentations, edit slides, analyze content |
| `xlsx` | Create spreadsheets, analyze data, generate reports with charts |
| `docx` | Create documents, edit content, format text |
| `pdf` | Generate formatted PDF documents and reports |

### API Usage (TypeScript)

Pre-built Skills require three beta headers and use the `container` parameter:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  betas: [
    "code-execution-2025-08-25",   // Skills run in code execution container
    "skills-2025-10-02",            // Enables Skills functionality
    "files-api-2025-04-14"          // Required for file upload/download
  ],
  container: {
    skills: [
      {
        type: "anthropic",
        skill_id: "pptx",
        version: "latest"
      }
    ]
  },
  messages: [
    {
      role: "user",
      content: "Create a presentation about renewable energy with 5 slides"
    }
  ],
  tools: [
    {
      type: "code_execution_20250825",
      name: "code_execution"
    }
  ]
});
```

### Skills API Endpoints

- **List Skills**: `GET /v1/skills?source=anthropic` — Lists all Anthropic-managed Skills
- **Custom Skills**: `POST /v1/skills` — Upload custom Skills (organization-wide in API)

```typescript
// List available Anthropic-managed Skills
const skills = await client.beta.skills.list({
  source: "anthropic",
  betas: ["skills-2025-10-02"]
});

for (const skill of skills.data) {
  console.log(`${skill.id}: ${skill.display_title}`);
}
```

---

## 6. Skills vs. Tools vs. Subagents — Comparison

| Aspect | Skills | Tools | Subagents |
|---|---|---|---|
| **What they are** | Instructional packages (SKILL.md + resources) | Executable functions (Read, Bash, MCP tools) | Specialized agent instances with own prompt/tools |
| **How defined** | Filesystem artifacts only (`.claude/skills/`) | Built-in or MCP server config | Programmatic (`agents` option) or filesystem |
| **How invoked** | Auto-discovered by Claude based on task match | Explicitly called by Claude in tool loop | Via `Task` tool delegation |
| **Token model** | Progressive disclosure (metadata -> instructions -> resources) | Per-invocation cost | Full context per subagent execution |
| **Composability** | Multiple Skills coexist; Claude picks relevant ones | Combined via `allowedTools` | Parent delegates to named subagents |
| **Use case** | Domain expertise, workflows, best practices | Concrete actions (read file, run command, search) | Isolated subtasks with specialized focus |

### How Skills Compose with Agents/Subagents

Skills are available to the **main agent and all subagents** that have `"Skill"` in their `allowedTools`. Skills do not "belong" to a specific subagent — they are project-level or user-level resources discovered from the filesystem.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Review the codebase and generate a PDF report",
  options: {
    cwd: "/path/to/project",
    settingSources: ["user", "project"],
    allowedTools: ["Skill", "Read", "Glob", "Grep", "Task"],
    agents: {
      "code-reviewer": {
        description: "Expert code reviewer",
        prompt: "Analyze code quality and suggest improvements.",
        tools: ["Skill", "Read", "Glob", "Grep"]  // Subagent can also use Skills
      }
    }
  }
})) {
  console.log(message);
}
```

### How Skills Relate to MCP Tools

Skills and MCP tools are **complementary, not competing**:

- **MCP tools** provide **actions** — query a database, call an API, interact with a browser
- **Skills** provide **knowledge about when and how** to use those tools effectively

A Skill can reference MCP tools by their fully-qualified names:

```markdown
## BigQuery Analysis

Use the BigQuery:bigquery_schema tool to retrieve table schemas.
Use the BigQuery:execute_query tool to run queries.

Always filter out test accounts: WHERE account_type != 'test'
```

The Skill provides the domain knowledge (which tables, which filters, which patterns); the MCP tool provides the execution capability.

---

## 7. Authoring Best Practices

### Description Writing

The description is critical for Skill selection. Claude uses it to choose the right Skill from potentially 100+ available Skills.

```yaml
# GOOD — specific, includes triggers
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.

# BAD — vague
description: Helps with documents
```

Always write in **third person** (the description is injected into the system prompt):
- Good: "Processes Excel files and generates reports"
- Bad: "I can help you process Excel files"

### Conciseness

Only add context Claude does not already have. Claude is already very smart — challenge each piece of information:
- "Does Claude really need this explanation?"
- "Can I assume Claude knows this?"
- "Does this paragraph justify its token cost?"

Keep SKILL.md body **under 500 lines**. If content exceeds this, split into separate files using progressive disclosure.

### File Organization

Keep references **one level deep** from SKILL.md. Deeply nested references cause Claude to partially read files:

```markdown
# GOOD — one level deep
## Advanced features
**Form filling**: See [FORMS.md](FORMS.md)
**API reference**: See [REFERENCE.md](REFERENCE.md)

# BAD — too deep
See [advanced.md](advanced.md) -> which references [details.md](details.md) -> which has the actual info
```

### Utility Scripts

Pre-made scripts are preferred over Claude-generated code:
- More reliable than generated code
- Save tokens (no code generation in context)
- Ensure consistency across uses
- Scripts are **executed** — their source code never enters context, only output

### Feedback Loops

For quality-critical tasks, implement validate-fix-repeat patterns:

```markdown
## Document Editing Process
1. Make edits to document.xml
2. Validate: `python scripts/validate.py unpacked_dir/`
3. If validation fails: fix issues and re-validate
4. Only proceed when validation passes
5. Rebuild: `python scripts/pack.py unpacked_dir/ output.docx`
```

---

## 8. Cross-Surface Availability

Skills do NOT sync across surfaces:

| Surface | Pre-built Skills | Custom Skills | Sharing Scope |
|---|---|---|---|
| **Claude API** | Yes (via `container.skills`) | Yes (via `/v1/skills` upload) | Organization-wide |
| **Claude Agent SDK** | No (filesystem only) | Yes (`.claude/skills/`) | Project or user level |
| **Claude Code CLI** | No | Yes (`.claude/skills/`) | Project or user level |
| **claude.ai** | Yes (automatic) | Yes (zip upload in Settings) | Individual user only |

### Runtime Environment Constraints

| Surface | Network Access | Package Installation |
|---|---|---|
| **Claude API** | None | Pre-installed packages only |
| **claude.ai** | Varies by settings | Can install from npm/PyPI |
| **Claude Code / Agent SDK** | Full (same as host machine) | Full (but avoid global installs) |

---

## 9. Security Considerations

- Only use Skills from **trusted sources** (self-created or from Anthropic)
- Malicious Skills can direct Claude to invoke tools or execute code in harmful ways
- Skills that fetch data from external URLs are particularly risky
- Thoroughly audit all bundled files: SKILL.md, scripts, images, resources
- Treat installing a Skill like installing software

---

## 10. Relevance to GameForge

### Current State
GameForge uses the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) for its AI agent pipeline (Designer -> Developer -> QA). Skills could be used to:

1. **Encode game design patterns**: A Skill could package Phaser 3 best practices, common game patterns (platformer, shooter, puzzle), and design templates that the Designer agent uses automatically.

2. **Encode development standards**: A Skill could provide the Developer agent with project-specific coding conventions, Phaser API patterns, and the game template structure.

3. **Encode QA test patterns**: A Skill could give the QA agent standardized testing workflows, common failure patterns, and Playwright-based game testing procedures.

### Integration Path
Since GameForge already uses the Agent SDK:

```typescript
// Example: Adding Skills to the orchestrator
for await (const message of query({
  prompt: designerPrompt,
  options: {
    cwd: sessionDir,
    settingSources: ["project"],             // Load project Skills
    allowedTools: ["Skill", "Read", "Write", "Bash"],
    // ... existing agent config
  }
})) {
  // handle messages
}
```

Skills would need to be placed in `.claude/skills/` within the project or session directory.

### Key Consideration
Skills are filesystem-based and auto-discovered — they cannot be registered programmatically. This means domain knowledge must be encoded as SKILL.md files on disk rather than injected through the SDK API. For GameForge's dynamic session-based architecture, Skills would need to either:
- Live in the project root (shared across all sessions)
- Be copied/symlinked into session directories as needed
