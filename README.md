# 🧠 ADHD Planner AI

ADHD-friendly AI personal assistant with proactive check-ins, time-blind scheduling, and dopamine-aware task management.

## ✨ Features

- **⏰ Time-Blind Scheduling** - Visual time blocks, not just clock times
- **🎯 Dopamine-Aware Tasks** - Gamification and micro-rewards
- **💬 Proactive Check-ins** - Gentle nudges via Telegram
- **🔄 Task Chunking** - Auto-breaks big tasks into small wins
- **📱 Apple Reminders Sync** - Native iOS integration
- **🎮 Hyperfocus Mode** - Structured deep work sessions
- **📊 Pattern Recognition** - Learn your productive times

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ADHD Planner AI                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    INPUT LAYER                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐    │   │
│  │  │  Telegram   │  │   Apple     │  │    Voice         │    │   │
│  │  │    Bot      │  │  Reminders  │  │    Input         │    │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘    │   │
│  └─────────┼────────────────┼──────────────────┼──────────────┘   │
│            │                │                  │                   │
│            └────────────────┼──────────────────┘                   │
│                             ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AI BRAIN (Claude)                         │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │              ADHD-Optimized Prompting                │    │   │
│  │  │  • Task decomposition   • Energy-aware scheduling    │    │   │
│  │  │  • Dopamine optimization • Overwhelm detection       │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                    │
│                               ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  TASK MANAGEMENT                             │   │
│  │  ┌────────────┐  ┌─────────────┐  ┌────────────────────┐   │   │
│  │  │   Task     │  │   Time      │  │    Dopamine        │   │   │
│  │  │  Chunker   │  │  Estimator  │  │    Rewards         │   │   │
│  │  └────────────┘  └─────────────┘  └────────────────────┘   │   │
│  └────────────────────────────┬────────────────────────────────┘   │
│                               │                                    │
│                               ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  NOTIFICATION ENGINE                         │   │
│  │  ┌────────────────────────────────────────────────────┐     │   │
│  │  │  Proactive Check-ins                               │     │   │
│  │  │  • "Hey, how's that task going?"                   │     │   │
│  │  │  • "Time to take a break! You've been at it 25min" │     │   │
│  │  │  • "Daily win: You completed 3 tasks today! 🎉"    │     │   │
│  │  └────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ with TypeScript |
| AI | Anthropic Claude API |
| Messaging | Telegram Bot API |
| Native Sync | Apple Reminders (via AppleScript) |
| Database | SQLite |
| Scheduler | node-cron |

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

# Run
npm run dev
```

## ⚙️ Configuration

Create `.env` file:

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Preferences
CHECK_IN_INTERVAL_MINUTES=45
POMODORO_DURATION_MINUTES=25
BREAK_DURATION_MINUTES=5

# Apple Reminders (macOS only)
ENABLE_APPLE_REMINDERS=true
```

## 🚀 Usage

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/add <task>` | Add a new task |
| `/list` | Show today's tasks |
| `/focus` | Start a hyperfocus session |
| `/break` | Take a dopamine break |
| `/done <id>` | Mark task complete |
| `/energy <1-5>` | Log current energy level |
| `/chunk <task>` | Break down a big task |

### Example Interactions

**Adding a task:**
```
You: /add Write project proposal
Bot: 📝 Added "Write project proposal"
     
     That sounds like a big one! Want me to break it down?
     
     🔹 Reply 'yes' to chunk it
     🔹 Or I'll schedule it as-is
```

**Proactive check-in:**
```
Bot: Hey! 👋 It's been 45 minutes.
     
     You were working on: "Write proposal outline"
     
     How's it going?
     ✅ Done!
     🔄 Still working
     😫 Stuck
     ⏸️ Taking a break
```

## 🧠 ADHD-Specific Features

### Time Blindness Support
- Visual progress bars instead of timestamps
- "This takes about 2 episodes of your favorite show" ⏱️
- Gentle reminders that don't feel naggy

### Dopamine System
- 🎮 Points for completing tasks
- 🔥 Streaks for consecutive productive days
- 🎁 Random rewards for maintaining focus
- 🏆 Achievements unlock

### Task Chunking
Automatically breaks down overwhelming tasks:
```
"Write thesis" becomes:
1. ✏️ Open document (2 min)
2. 📝 Write one paragraph (10 min)
3. ☕ Take a break
4. 📝 Write another paragraph (10 min)
...
```

### Energy-Aware Scheduling
- Suggests hard tasks when energy is high
- Offers easier tasks during low energy
- Learns your patterns over time

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

Built with 💜 for the ADHD community
