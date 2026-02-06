# 🧠 ADHD Planner AI

> **Built on [OpenClaw](https://github.com/openclaw/openclaw)** — An open-source AI agent framework for building intelligent, proactive assistants.

ADHD-friendly AI personal assistant with proactive check-ins, time-blind scheduling, and dopamine-aware task management. This project demonstrates best practices for building AI agents using OpenClaw's patterns: memory persistence, cron scheduling, multi-channel messaging, and tool integration.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **⏰ Time-Blind Scheduling** | Visual time blocks, relative time ("2 episodes long"), not scary clock times |
| **🎯 Dopamine-Aware Tasks** | Gamification, micro-rewards, random bonuses to trigger dopamine |
| **💬 Proactive Check-ins** | Gentle, non-judgmental nudges via Telegram |
| **🔄 Task Chunking** | AI breaks big scary tasks into tiny dopamine hits |
| **📱 Apple Reminders Sync** | Native iOS/macOS integration via CLI |
| **🧠 Memory Persistence** | Remembers context across sessions (like OpenClaw agents) |
| **🎮 Hyperfocus Mode** | Structured deep work with mid-session check-ins |
| **📊 Energy Tracking** | Matches tasks to your current energy level |

## 🏗️ Architecture

This project follows OpenClaw's agent architecture patterns:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ADHD Planner AI                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    INPUT CHANNELS                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │   │
│  │  │  Telegram   │  │   Apple     │  │    Cron Jobs     │    │   │
│  │  │    Bot      │  │  Reminders  │  │   (Proactive)    │    │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘    │   │
│  └─────────┼────────────────┼──────────────────┼──────────────┘   │
│            │                │                  │                   │
│            └────────────────┼──────────────────┘                   │
│                             ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AI BRAIN (Claude)                         │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │              ADHD-Optimized System Prompt                │ │   │
│  │  │  • Encouraging, non-judgmental tone                      │ │   │
│  │  │  • Task decomposition strategies                         │ │   │
│  │  │  • Energy-aware scheduling                               │ │   │
│  │  │  • Overwhelm detection & response                        │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                    │
│  ┌────────────────────────────┼────────────────────────────────┐   │
│  │                    MEMORY LAYER                              │   │
│  │  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐   │   │
│  │  │   SQLite   │  │   Context   │  │    Session         │   │   │
│  │  │   Tasks    │  │   Memory    │  │    State           │   │   │
│  │  └────────────┘  └─────────────┘  └────────────────────┘   │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                    │
│  ┌────────────────────────────┼────────────────────────────────┐   │
│  │                  NOTIFICATION ENGINE                         │   │
│  │  ┌────────────────────────────────────────────────────┐     │   │
│  │  │  Proactive Check-ins (inspired by OpenClaw heartbeats)│   │   │
│  │  │  • "Hey, how's that task going?"                   │     │   │
│  │  │  • "Time to take a break! You've been at it 25min" │     │   │
│  │  │  • "Daily win: You completed 3 tasks today! 🎉"    │     │   │
│  │  └────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 🔧 OpenClaw Integration Patterns

This project demonstrates several OpenClaw patterns:

### 1. Memory Persistence
```typescript
// Like OpenClaw's MEMORY.md pattern - context that survives sessions
const memory = new MemoryManager('./data/memory.json');
await memory.remember('lastTask', { id: 1, title: 'Write docs' });
const context = await memory.getContext(); // Survives restarts
```

### 2. Cron-Based Proactive Behavior
```typescript
// Like OpenClaw's heartbeat system - proactive check-ins
cron.schedule('*/45 9-18 * * 1-5', async () => {
  const pending = await tasks.getPending();
  if (pending.length > 0) {
    await bot.sendMessage(chatId, `How's "${pending[0].title}" going?`);
  }
});
```

### 3. Tool Integration
```typescript
// Like OpenClaw's tool system - integrating external services
const reminders = new AppleRemindersSync();
await reminders.add(task);  // Syncs to native iOS/macOS Reminders
```

### 4. Natural Language Understanding
```typescript
// Claude API for understanding user intent and generating ADHD-friendly responses
const analysis = await prompts.analyzeTask("Write thesis");
// Returns: { needsChunking: true, timeEstimate: "2-4 hours", ... }
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ with TypeScript |
| AI | Anthropic Claude API |
| Messaging | Telegram Bot API (Telegraf) |
| Native Sync | Apple Reminders (AppleScript CLI) |
| Database | SQLite (better-sqlite3) |
| Scheduler | node-cron |
| Memory | JSON file persistence |

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/ran2207/adhd-planner-ai.git
cd adhd-planner-ai

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Initialize database
npm run setup

# Run in development
npm run dev

# Or build and run production
npm run build
npm start
```

## ⚙️ Configuration

Create `.env` file:

```env
# Telegram Bot (get from @BotFather)
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# Claude API (get from console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-...

# Check-in Settings
CHECK_IN_INTERVAL_MINUTES=45
CHECK_IN_START_HOUR=9
CHECK_IN_END_HOUR=18

# Focus Session
POMODORO_DURATION_MINUTES=25
BREAK_DURATION_MINUTES=5

# Apple Reminders (macOS only)
ENABLE_APPLE_REMINDERS=true
APPLE_REMINDERS_LIST=ADHD Planner

# Data Directory
DATA_DIR=./data
```

## 🚀 Usage

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and quick tutorial |
| `/add <task>` | Add a new task (AI analyzes complexity) |
| `/list` | Show today's tasks with progress |
| `/focus [minutes]` | Start a hyperfocus session (default 25m) |
| `/break [minutes]` | Take a dopamine break (default 5m) |
| `/done <id>` | Mark task complete + get rewards |
| `/energy <1-5>` | Log energy and get matched tasks |
| `/chunk <task>` | Break down an overwhelming task |
| `/stats` | View your points, streak, achievements |
| `/help` | Show all commands |

### Example Interactions

**Adding a task:**
```
You: /add Write project proposal

Bot: 📝 Added: "Write project proposal"

     🔍 This looks like a bigger task (~45-60 min)
     
     Want me to break it down into smaller pieces?
     
     [Yes, chunk it] [No, keep as-is]
```

**Proactive check-in (automatic):**
```
Bot: Hey! 👋 It's been 45 minutes.

     You were working on: "Write proposal outline"
     
     How's it going?
     
     [✅ Done!] [🔄 Still at it] [😫 Stuck] [⏸️ Break]
```

**Energy-based suggestions:**
```
You: /energy 2

Bot: Energy logged: ⚡⚡◽◽◽

     Low energy mode activated! 💤
     
     Perfect time for these easier tasks:
     • Reply to emails (🔋🔋)
     • Organize desk (🔋)
     
     Save the hard stuff for when you're feeling it!
```

**Task chunking:**
```
You: /chunk Write thesis chapter

Bot: 📦 Breaking "Write thesis chapter" into pieces:

     1. 📂 Open your document (2 min)
     2. ✏️ Write literally one sentence (5 min)
     3. ☕ Celebrate + quick stretch (3 min)
     4. 📝 Write one paragraph (15 min)
     5. 🎵 Put on focus music (2 min)
     6. 📝 Write another paragraph (15 min)
     7. 🎉 You're making progress! Break time (5 min)
     
     [Add all as tasks] [Just the first 3]
```

## 🧠 ADHD-Specific Features

### Time Blindness Support
- **Visual progress bars** instead of timestamps
- **Relative time**: "This takes about 2 episodes of your favorite show" ⏱️
- **Gentle reminders** that don't feel like nagging
- **No guilt trips** for missed tasks - just reschedule

### Dopamine System
- 🎮 **Points** for completing tasks (scaled by difficulty)
- 🔥 **Streaks** for consecutive productive days
- 🎰 **Random bonuses** (20% chance for surprise points!)
- 🏆 **Achievements** that unlock over time
- ☀️ **Time bonuses** (early bird gets extra points)

### Task Chunking AI
Automatically breaks down overwhelming tasks using Claude:
```
"Write thesis" becomes:
1. ✏️ Open document and read last paragraph (2 min)
2. 📝 Write literally one sentence (5 min)
3. ☕ Mini celebration! Get a snack (3 min)
4. 📝 Write a paragraph (10 min)
5. 🧘 Stretch break (2 min)
6. 📝 Write another paragraph (10 min)
...
```

### Energy-Aware Scheduling
- Asks how you're feeling (1-5 energy)
- **Low energy (1-2)**: Suggests easy, mindless tasks
- **Medium (3)**: Balanced tasks
- **High energy (4-5)**: Tackle the hard stuff!
- Learns your patterns over time

### Context Memory
Like OpenClaw agents, this bot remembers:
- What you were working on
- Your energy patterns
- Your productive times
- Recent conversation context

## 🔐 Privacy & Data

- All data stored locally (SQLite + JSON files)
- No analytics or tracking
- Your tasks never leave your machine (except for Claude API calls)
- API keys stored in `.env` (never committed)

## 🤝 Contributing

This is a demonstration project for OpenClaw patterns. Feel free to:
1. Fork and customize for your needs
2. Submit PRs for ADHD-friendly improvements
3. Open issues for bugs or feature ideas

## 📚 Learn More

- [OpenClaw Documentation](https://github.com/openclaw/openclaw)
- [Building AI Agents](https://docs.anthropic.com/claude/docs)
- [Telegram Bot API](https://core.telegram.org/bots/api)

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

Built with 💜 for the ADHD community

*"Your brain works differently. That's not a bug, it's a feature. This tool just helps you work WITH your brain, not against it."*
