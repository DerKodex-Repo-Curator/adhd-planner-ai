import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import { TaskManager } from './tasks';

interface FocusSession {
  chatId: number;
  startedAt: Date;
  durationMinutes: number;
  checkInSent: boolean;
}

export class CheckInService {
  private bot: Telegraf;
  private tasks: TaskManager;
  private activeSessions: Map<number, FocusSession> = new Map();

  constructor(bot: Telegraf, tasks: TaskManager) {
    this.bot = bot;
    this.tasks = tasks;
  }

  start() {
    const intervalMinutes = parseInt(process.env.CHECK_IN_INTERVAL_MINUTES || '45');
    
    // Regular check-ins during work hours
    cron.schedule(`*/${intervalMinutes} 9-18 * * 1-5`, () => {
      this.sendCheckIns();
    });

    // Focus session monitoring
    setInterval(() => this.monitorFocusSessions(), 60000); // Every minute
  }

  async sendCheckIns() {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId) return;

    const pending = await this.tasks.getPending();
    
    if (pending.length === 0) {
      // No tasks - gentle encouragement
      await this.bot.telegram.sendMessage(
        chatId,
        `👋 Quick check-in!\n\n` +
        `No pending tasks - nice work! 🎉\n\n` +
        `Ready to add something? /add <task>`
      );
      return;
    }

    // Pick a random pending task to check on
    const task = pending[Math.floor(Math.random() * pending.length)];
    
    const messages = [
      `Hey! 👋 How's it going?\n\nWorking on anything? You've got "${task.title}" on your list.`,
      `Quick check-in! 🙂\n\nStill at "${task.title}"?\n\n✅ Done\n🔄 In progress\n😫 Stuck`,
      `*pokes gently* 👆\n\nJust checking in! Need help with anything?`,
    ];

    const message = messages[Math.floor(Math.random() * messages.length)];
    
    await this.bot.telegram.sendMessage(chatId, message);
  }

  startFocusSession(chatId: number, durationMinutes: number) {
    this.activeSessions.set(chatId, {
      chatId,
      startedAt: new Date(),
      durationMinutes,
      checkInSent: false,
    });
  }

  startBreak(chatId: number, durationMinutes: number) {
    setTimeout(async () => {
      await this.bot.telegram.sendMessage(
        chatId,
        `⏰ Break's over!\n\n` +
        `Ready to get back to it?\n\n` +
        `/focus to start another session\n` +
        `/list to see your tasks`
      );
    }, durationMinutes * 60 * 1000);
  }

  private async monitorFocusSessions() {
    const now = new Date();

    for (const [chatId, session] of this.activeSessions) {
      const elapsed = (now.getTime() - session.startedAt.getTime()) / 1000 / 60;
      const halfway = session.durationMinutes / 2;
      
      // Send halfway check-in
      if (!session.checkInSent && elapsed >= halfway) {
        await this.bot.telegram.sendMessage(
          chatId,
          `⏱️ Halfway there!\n\n` +
          `${Math.ceil(session.durationMinutes - elapsed)} minutes left.\n\n` +
          `You're doing great! Keep going! 💪`
        );
        session.checkInSent = true;
      }

      // Session complete
      if (elapsed >= session.durationMinutes) {
        await this.bot.telegram.sendMessage(
          chatId,
          `🎉 Focus session complete!\n\n` +
          `You stayed focused for ${session.durationMinutes} minutes!\n\n` +
          `Take a break! /break\n` +
          `Or mark something done! /done`
        );
        this.activeSessions.delete(chatId);
      }
    }
  }
}
