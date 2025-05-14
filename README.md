**Design with words.**


Control Blender with natural language, right from your browser. Just describe what you want to see or animate—this tool translates your words into actions in Blender.

No coding, no setup, no cloud accounts. Just open the UI, type what you want, and see it happen in Blender. It's simple, direct, and powerful.

You don't need to set up a coding environment or use a complex LLM platform. This is a focused, single-purpose tool for creative control.

---

## What is this?


This project is a local-first, privacy-friendly way to:
- Describe what you want in plain English (for example: "create a red cube", "animate a water simulation", "make a bouncing ball")
- See results in Blender instantly

No cloud, no accounts, and no data leaves your machine while testing locally. You are in control.

How does it work? When you type a request, a language model translates your natural language into Python code that Blender can understand and execute. You never have to see or write code yourself.

---

## How does it work?

```
┌──────────────┐      HTTP/WebSocket      ┌────────────────────┐      TCP      ┌────────────────────┐
│  Your Browser│◀──────────────────────▶│  Node.js Bridge    │◀───────────▶│ Blender MCP Add-on │
└──────────────┘                        └────────────────────┘             └────────────────────┘
      ▲  ▲                                      │
      │  └───────────── Natural Language ───────┘
      │
      └───────────── Python Code ───────────────┘
```

1. Type a prompt in your browser (open `index.html`)
2. The tool relays your request to Blender
3. Blender does what you asked—instantly

---

## Example Prompts

Try prompts like:

- create a red cube
- animate a water simulation
- make a bouncing ball
- add a camera and point it at the cube
- create a glass material and apply it to the selected object
- generate a cityscape with random buildings
- turn the default cube into a donut
- make the monkey spin for 5 seconds

---

## Credits & License

- Powered by [Blender MCP](https://github.com/gradientspace/blender-mcp).
- MIT License.
