/**
 * ADHD-Optimized AI Prompts
 * 
 * Uses Claude to:
 * - Analyze task complexity
 * - Break down overwhelming tasks (chunking)
 * - Suggest tasks based on energy level
 * - Provide encouraging, non-judgmental support
 * - Detect overwhelm and respond appropriately
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import type { Task } from './tasks.js';

export interface TaskAnalysis {
  needsChunking: boolean;
  timeEstimate: string;
  timeEstimateMinutes: number;
  energyRequired: number;
  encouragement: string;
  tips: string[];
}

export interface TaskChunk {
  title: string;
  time: string;
  minutes: number;
  isBreak: boolean;
}

export interface EnergySuggestion {
  message: string;
  tasks: string;
  taskIds: number[];
}

// System prompt for ADHD-friendly interactions
const ADHD_SYSTEM_PROMPT = `You are an ADHD-friendly task assistant. Your communication style:

1. **Encouraging, not judgmental**: Never shame for incomplete tasks or time taken
2. **Concrete and specific**: Vague advice is useless for ADHD brains
3. **Break things down**: Large tasks feel impossible - make them tiny
4. **Time estimates are hard**: Give ranges and relatable comparisons ("about one episode of TV")
5. **Celebrate small wins**: Every completed step matters
6. **Energy-aware**: Match task suggestions to current energy levels
7. **Understand overwhelm**: When someone is stuck, offer simple next steps

Key ADHD insights:
- Starting is often the hardest part (reduce activation energy)
- Time blindness is real (visual progress > clock times)
- Dopamine matters (make tasks feel rewarding)
- Working memory is limited (write everything down)
- Hyperfocus is a feature, not a bug (but needs boundaries)

Always respond with warmth and understanding. You get it.`;

export class ADHDPrompts {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.model = config.anthropicModel;
  }

  /**
   * Analyze a task for complexity and chunking needs
   */
  async analyzeTask(taskText: string): Promise<TaskAnalysis> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 800,
        system: ADHD_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Analyze this task for someone with ADHD: "${taskText}"

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "needsChunking": true/false (true if vague, complex, or >30 min),
  "timeEstimate": "X-Y minutes" (give a range),
  "timeEstimateMinutes": number (average estimate),
  "energyRequired": 1-5 (1=low focus, 5=intense focus needed),
  "encouragement": "A short, warm encouragement (1 sentence)",
  "tips": ["Tip 1", "Tip 2"] (0-2 specific tips to make this easier)
}`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Task analysis failed:', error);
      return {
        needsChunking: taskText.length > 50, // Simple heuristic fallback
        timeEstimate: '15-30 minutes',
        timeEstimateMinutes: 20,
        energyRequired: 2,
        encouragement: "You've got this! 💪",
        tips: [],
      };
    }
  }

  /**
   * Break down a complex task into ADHD-friendly chunks
   */
  async chunkTask(taskText: string): Promise<TaskChunk[]> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1200,
        system: ADHD_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Break down this overwhelming task into tiny, dopamine-friendly steps: "${taskText}"

Rules for ADHD-friendly chunking:
1. First step should be TINY (2-5 min) - just getting started
2. Each step should be 5-15 minutes max
3. Include short breaks between hard steps
4. Make steps specific and actionable (not "work on X")
5. Add celebration moments throughout
6. 5-8 steps total

Respond with ONLY valid JSON array (no markdown):
[
  {"title": "Step description", "time": "X min", "minutes": number, "isBreak": false},
  {"title": "Quick stretch break", "time": "3 min", "minutes": 3, "isBreak": true},
  ...
]`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Task chunking failed:', error);
      return [
        { title: 'Open/gather what you need', time: '2 min', minutes: 2, isBreak: false },
        { title: 'Do the smallest first part', time: '10 min', minutes: 10, isBreak: false },
        { title: 'Quick break - stretch!', time: '3 min', minutes: 3, isBreak: true },
        { title: 'Continue with next part', time: '10 min', minutes: 10, isBreak: false },
        { title: 'Review and wrap up', time: '5 min', minutes: 5, isBreak: false },
      ];
    }
  }

  /**
   * Suggest tasks based on current energy level
   */
  async suggestByEnergy(energyLevel: number, pendingTasks: Task[]): Promise<EnergySuggestion> {
    if (pendingTasks.length === 0) {
      return {
        message: energyLevel <= 2
          ? "Low energy + no tasks? Perfect time to rest guilt-free! 😴"
          : "All clear! Add some tasks when you're ready.",
        tasks: '',
        taskIds: [],
      };
    }

    const taskList = pendingTasks
      .map(t => `[ID:${t.id}] "${t.title}" (energy: ${t.energyRequired}/5)`)
      .join('\n');

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 600,
        system: ADHD_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Someone with ADHD has energy level ${energyLevel}/5 right now.

Their pending tasks:
${taskList}

Match 2-3 tasks to their current energy level:
- Low energy (1-2): Easy, mindless tasks
- Medium (3): Balanced tasks
- High (4-5): Tackle the hard stuff!

Respond with ONLY valid JSON:
{
  "message": "Brief, encouraging message about their energy level",
  "tasks": "• Task 1\\n• Task 2",
  "taskIds": [id1, id2] (IDs from the list above)
}`
        }]
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (error) {
      console.error('Energy suggestion failed:', error);

      // Fallback: filter by energy
      const appropriate = pendingTasks.filter(t => {
        if (energyLevel <= 2) return t.energyRequired <= 2;
        if (energyLevel === 3) return t.energyRequired <= 3;
        return true;
      }).slice(0, 3);

      const messages: Record<number, string> = {
        1: "Super low energy mode. Let's keep it simple. 😴",
        2: "Low energy - easy wins only today.",
        3: "Solid energy - you can tackle most things!",
        4: "Good energy! Time for the challenging stuff. 💪",
        5: "Full power! Let's crush some hard tasks! ⚡",
      };

      return {
        message: messages[energyLevel] || "Let's do this!",
        tasks: appropriate.map(t => `• ${t.title}`).join('\n'),
        taskIds: appropriate.map(t => t.id),
      };
    }
  }

  /**
   * Get advice when someone is stuck
   */
  async getUnstuckAdvice(taskTitle?: string): Promise<string> {
    const tips = [
      "🎯 **2-minute rule**: Can you do just 2 minutes? Starting is the hardest part.",
      "🔄 **Task switch**: Sometimes a different task gets momentum going.",
      "🎵 **Body doubles**: Put on a 'study with me' video or work alongside someone.",
      "🚶 **Movement break**: 5-minute walk can reset your brain completely.",
      "📝 **Write the block**: What's actually stopping you? Name it to tame it.",
      "☕ **Body check**: Hungry? Thirsty? Tired? Take care of basics first.",
      "🗣️ **Talk it out**: Explain the task out loud. Rubber duck debugging works!",
      "⏰ **Timer trick**: Set 10 minutes. Anyone can do anything for 10 minutes.",
      "✂️ **Smaller still**: If it feels too big, break it down even more.",
      "🎮 **Gamify it**: Race yourself, earn a reward, make it a challenge.",
    ];

    const tip = tips[Math.floor(Math.random() * tips.length)];

    if (taskTitle) {
      return `Stuck on "${taskTitle}"?\n\n${tip}\n\nRemember: Your brain isn't broken, it just needs the right approach. 💜`;
    }

    return `${tip}\n\nYou're not lazy - you're dealing with a tricky brain. That takes courage. 💜`;
  }

  /**
   * Generate a proactive check-in message
   */
  async generateCheckIn(context: {
    currentTaskTitle?: string;
    minutesSinceLastActivity: number;
    tasksCompletedToday: number;
    currentStreak: number;
  }): Promise<string> {
    const { currentTaskTitle, minutesSinceLastActivity, tasksCompletedToday, currentStreak } = context;

    // Different check-in styles based on context
    if (currentTaskTitle && minutesSinceLastActivity < 60) {
      // Recently active on a task
      const messages = [
        `Hey! 👋 How's "${currentTaskTitle}" going?\n\n✅ Done!\n🔄 Still at it\n😫 Stuck\n⏸️ Taking a break`,
        `Quick check! 🙂 "${currentTaskTitle}" still happening?\n\nNo pressure - just curious!`,
        `*gentle poke* 👆\n\nHowzit with "${currentTaskTitle}"?`,
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    }

    if (tasksCompletedToday === 0 && minutesSinceLastActivity > 120) {
      // No tasks completed and long time since activity - be extra gentle
      const messages = [
        "Hey! 🌿 No pressure, but I'm here if you want to tackle something small.\n\nEven just listing one tiny task counts as a win.",
        "👋 Checking in! Remember: some days just showing up is the achievement.\n\nWant me to suggest something easy?",
      ];
      return messages[Math.floor(Math.random() * messages.length)];
    }

    if (tasksCompletedToday >= 3) {
      // Productive day - celebrate!
      return `🎉 You've completed ${tasksCompletedToday} tasks today! That's amazing!\n\nKeep going or take a well-earned break - you've earned it either way.`;
    }

    // Default check-in
    const messages = [
      "👋 Hey! Just checking in. What are you up to?",
      `Quick hello! 🙂 ${currentStreak > 1 ? `Day ${currentStreak} of your streak! ` : ''}Anything I can help with?`,
      "🌟 Productivity check! Working on anything? Or need task suggestions?",
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Generate encouraging celebration for task completion
   */
  getCelebration(taskTitle: string, points: number): string {
    const celebrations = [
      `🎉 YES! "${taskTitle}" is DONE!\n\n+${points} points! Keep that momentum going!`,
      `✨ Crushed it! "${taskTitle}" complete!\n\n+${points} points added to your score!`,
      `🏆 Another one bites the dust!\n\n"${taskTitle}" ✓\n+${points} points!`,
      `💪 Look at you go!\n\n"${taskTitle}" finished! +${points} points!`,
      `🚀 Task destroyed: "${taskTitle}"\n\n+${points} points! You're unstoppable!`,
    ];

    return celebrations[Math.floor(Math.random() * celebrations.length)];
  }

  /**
   * Format time in ADHD-friendly way
   */
  formatTimeADHD(minutes: number): string {
    if (minutes <= 5) return '⚡ Quick! (~5 min)';
    if (minutes <= 15) return '🎵 One song (~15 min)';
    if (minutes <= 25) return '🍅 One pomodoro (~25 min)';
    if (minutes <= 45) return '📺 One episode (~45 min)';
    if (minutes <= 60) return '☕ One hour';
    if (minutes <= 120) return '🎬 One movie (~2 hours)';
    return `📅 ${Math.round(minutes / 60)} hours (break it down!)`;
  }
}
