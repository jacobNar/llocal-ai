---
trigger: always_on
---

# Architecture Guidelines
After any major changes to the application including major changes to existing functionality or new functionality, update this file with the latest. Treat this as the master documentation of the application.

## Project Overview
`llocal-ai` is a local desktop application built with **Electron** that leverages **LangChain** and **LangGraph** to create an autonomous agent capable of controlling a web browser to automate tasks. The application is designed to be privacy-focused and run locally (mostly), storing data in a local SQLite database.

## High-Level Architecture

### Core Components
1.  **Electron Main Process**: The backbone of the application. It manages the application lifecycle, window creation, and acts as the bridge between the UI and the heavy-lifting services.
2.  **Browser Automation Service**: A dedicated service wrapper around **Puppeteer**. This allows the agent to "see" and interact with the web just like a human, performing clicks, typing, and navigation.
3.  **Agentic Layer (LangGraph)**: The "brain" of the application. It uses a State Graph to manage the conversation flow, tool execution, and goal verification. It loops through `Call Model -> Execute Tool -> Verify Goal` until the user's request is satisfied.
4.  **Data Layer**: A local **SQLite** database (via `better-sqlite3`) that stores:
    -   Chat history (Conversations/Messages).
    -   Workflows (Recorded sequences of tool actions).
    -   *Vector Embeddings* (via `sqlite-vec`) for RAG functionality.
5.  **RAG (Retrieval-Augmented Generation)**: (In Progress) Functionality to index websites and files, allowing the user to chat with context that isn't in the LLM's training data.

### Workflow Automation
The app allows users to "record" successful agent interactions as **Workflows**. These workflows are saved sequences of tool calls that can be replayed later to repeat a specific task.

---

## File Structure & Responsibilities

The codebase follows a modular architecture separating concerns by domain (Agent, Services, IPC).

### Root (`src/`)
-   **`src/index.ts`**: The application entry point. It initializes all services (Agent, DB, Browser), registers IPC handlers, and creates the main application window. It is kept lightweight.

### Agent Layer (`src/agent/`)
-   **`src/agent/agent-service.ts`**: Contains the core LangGraph logic.
    -   Defines the `AgentState`.
    -   Configures the `StateGraph` (nodes for Agent, Tools, Verifier).
    -   Manages the System Prompt and LLM client initialization.

### Services Layer (`src/services/`)
-   **`src/services/browser-service.ts`**: Manages the Puppeteer browser instance. Ensures a single browser instance is shared and properly initialized/disposed.
-   **`src/services/db.ts`**: The Database Access Object (DAO).
    -   Initializes the SQLite database and `sqlite-vec` extension.
    -   Manages schema creation.
    -   Provides methods for CRUD operations on Conversations, Messages, and Workflows.
    -   Exports a singleton instance via `initDb`/`getDb`.
-   **`src/services/rag-service.ts`**: Manages the Vector Store and Embeddings.
    -   Initializes `OllamaEmbeddings`.
    -   Sets up the `MemoryVectorStore` (to be persisted in SQLite in the future).

### IPC Layer (`src/ipc/`)
This layer handles communication between the Frontend (Renderer) and the Backend (Main).
-   **`src/ipc/chat-handlers.ts`**: Handles chat-related requests (`runQuery`, `getHistory`, `loadConversation`). It orchestrates calls to the Agent and Database.
-   **`src/ipc/workflow-handlers.ts`**: Handles workflow management (`getWorkflows`, `saveWorkflow`, `runWorkflow`). It allows saving a chat session as a repeatable workflow.
-   **`src/ipc/tool-handlers.ts`**: Exposes specific standalone tools to the frontend (e.g., `webCrawlerTool` for RAG indexing).

### Tools (`src/tools/`)
-   **`src/tools/browser-tools.ts`**: LangChain tool definitions for browser interaction (Click, Type, Scroll, Get Elements). These interact with the `browser-service`.
-   **`src/tools/web-crawler-tools.ts`**: Logic for scraping web pages for the RAG system.
-   **`src/tools/response-tool.ts`**: A special tool for the Agent to deliver the final answer to the user.
