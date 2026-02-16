# 🔴 Ares Project

> **The "Lovable-alike" for Developers.** > *Build React applications with the speed of a visual builder and the flexibility of raw code.*

![Project Status](https://img.shields.io/badge/Status-Alpha-red) ![Tech Stack](https://img.shields.io/badge/Tech-React_%7C_Vite_%7C_WebContainers-black)

## 🚀 Mission
Ares Project is designed to solve the biggest problem in low-code tools: **The "Eject" Penalty.** Usually, visual builders generate messy code that you can't maintain. Ares is different. It is a **bi-directional editor**:
1.  **AI Writes Code:** You prompt, it builds.
2.  **You Drag & Drop:** We update the *actual* Tailwind classes in real-time.
3.  **You Write Code:** The visual preview updates instantly.

## ✨ The "Killer Feature": True Visual Editing
Unlike other AI wrappers that just "append code," Ares features a custom-built **Visual Engine** that bridges the gap between pixels and AST (Abstract Syntax Tree).

* **Drag & Drop Persistence:** When you drag a button 50px to the right, we don't just change the CSS inline. We calculate the exact Tailwind class (e.g., `translate-x-[50px]`) and **write it back to your source code** file.
* **Deep Selection:** Click any element to edit its properties. Use `Esc` to select parents.
* **Zero-Lockin:** You can download the `zip` at any time and it's just a standard Vite + React project.

## 🛠 Features

### 🎨 Visual & Interactive
* **Glass Pane Engine:** A sophisticated overlay system that intercepts clicks to allow editing without breaking the website's interactivity.
* **Moveable Integration:** Resize, rotate, and drag elements with professional-grade handles.
* **Context-Aware AI:** Select a specific button and tell the AI "Make this red," and it knows exactly which component to modify.

### ⚡ Powered by WebContainers
* **In-Browser Node.js:** The entire development environment runs inside your browser. No cloud servers required for the build process.
* **Instant Feedback:** Changes compile in milliseconds using Vite.
* **Terminal Access:** Real-time access to the build logs and npm process.

### 🧠 Intelligence
* **Anthropic Integration:** Powered by **Claude 3.5 Sonnet** (via backend proxy) for high-quality React code generation.
* **Heuristic Fallbacks:** "Dumb" logic for instant updates (color changes, text edits) without waiting for the LLM.

## 📦 Architecture

```mermaid
graph TD
    A[User Action] -->|Drag/Resize| B(Visual Overlay)
    B -->|Calculate Delta| C{AST Engine}
    A -->|Chat Prompt| D(AI Orchestrator)
    D -->|Generate Component| C
    C -->|Update String| E[Virtual File System]
    E -->|HMR Update| F[WebContainer Preview]