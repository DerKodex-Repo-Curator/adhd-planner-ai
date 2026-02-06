import Anthropic from '@anthropic-ai/sdk';
import { Task } from './tasks';

interface TaskAnalysis {
  needsChunking: boolean;
  timeEstimate: string;
  energyRequired: number;
  encouragement: string;
}

interface TaskChunk {
  title: string;
  time: string;
}

export class ADHDPrompts {
  private client: Anthropic;

  constructor(client: Anthropic) {
    this.client = client;
  }

  async analyzeTask(taskText: string): Promise<TaskAnalysis> {
    const response = await this.client.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You're helping someone with ADHD manage their tasks. Analyze this task:

"${taskText}"

Respond in JSON format:
{
  "needsChunking": true/false (true if task is vague or would take >30 mins),
  "timeEstimate": "X minutes" or "X-Y minutes",
  "energyRequired": 1-5 (1=low effort, 5=high focus needed),
  "encouragement": "A short, friendly encouragement message"
}

Be ADHD-friendly: assume tasks feel bigger than they are, offer reassurance.`
      }]
    });

    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return JSON.parse(text);
    } catch {
      return {
        needsChunking: false,
        timeEstimate: '15-30 minutes',
        energyRequired: 2,
        encouragement: "You've got this! 💪"
      };
    }
  }

  async chunkTask(taskText: string): Promise<TaskChunk[]> {
    const response = await this.client.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You're an ADHD coach. Break down this overwhelming task into tiny, dopamine-friendly steps:

"${taskText}"

Rules for ADHD-friendly chunking:
1. First step should be TINY (2-5 min) - just getting started
2. Each step should be completable in 5-15 minutes
3. Include breaks between hard steps
4. Make steps specific and actionable (not "work on X")
5. Add small wins throughout

Respond in JSON array format:
[
  {"title": "Step description", "time": "X min"},
  ...
]

Include 5-8 steps.`
      }]
    });

    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return JSON.parse(text);
    } catch {
      return [
        { title: "Open the thing you need", time: "2 min" },
        { title: "Do the first small part", time: "10 min" },
        { title: "Take a quick break", time: "5 min" },
        { title: "Do the next part", time: "10 min" },
      ];
    }
  }

  async suggestByEnergy(energyLevel: number, pendingTasks: Task[]): Promise<{ message: string; tasks: string }> {
    const taskList = pendingTasks.map(t => `- ${t.title} (energy: ${t.energyRequired})`).join('\n');

    const response = await this.client.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Someone with ADHD has energy level ${energyLevel}/5 right now.

Their pending tasks:
${taskList}

Suggest which tasks match their current energy.
- Low energy (1-2): Suggest easy, mindless tasks
- Medium energy (3): Balanced tasks
- High energy (4-5): Tackle the hard stuff!

Respond with:
1. A brief, encouraging message about their energy level
2. 2-3 suggested tasks from their list

Format:
{
  "message": "Energy-appropriate encouragement",
  "tasks": "• Task 1\\n• Task 2"
}`
      }]
    });

    try {
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return JSON.parse(text);
    } catch {
      return {
        message: "Let's work with what you've got!",
        tasks: pendingTasks.slice(0, 2).map(t => `• ${t.title}`).join('\n')
      };
    }
  }

  async getUnstuckAdvice(): Promise<string> {
    const tips = [
      "🎯 Try the 2-minute rule: Can you do just 2 minutes of this task? Often starting is the hardest part.",
      "🔄 Switch tasks! Sometimes a different task can get the momentum going.",
      "🎵 Put on some focus music or background noise. Lo-fi beats, anyone?",
      "🚶 Take a 5-minute walk. Movement helps reset your brain!",
      "📝 Write down what's blocking you. Sometimes naming it helps.",
      "☕ Is it a snack/water/coffee situation? Take care of your body first.",
      "🗣️ Talk through the task out loud. Rubber duck debugging works for life too!",
      "⏰ Set a timer for 10 minutes. You can do anything for 10 minutes.",
    ];

    return tips[Math.floor(Math.random() * tips.length)];
  }
}
