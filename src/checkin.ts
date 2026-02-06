/**
 * Check-In Service - Proactive Notifications
 * 
 * Following OpenClaw's heartbeat patterns:
 * - Scheduled check-ins using cron
 * - Context-aware messages (not just random pokes)
 * - Focus session management
 * - Break reminders
 * 
 * The goal is to be helpful, not annoying!
 */

import { Telegraf } from 'telegraf';
import cron from 'node-cron';
import { config } from './config.js';
import type { TaskManager } from './tasks.js';
import type { MemoryManager } from './memory.js';
import type { DopamineEngine } from './dopamine.js';
import type { ADHDPrompts } from './prompts.js';

interface FocusSession {
  chatId: number;
  startedAt: Date;
  durationMinutes: number;
  halfwayNotified: boolean;
  taskId?: number;
}

interface BreakSession {
  chatId: number;
  endAt: Date;
}

export class CheckInService {
  private bot: Telegraf;
  private tasks: TaskManager;
  private memory: MemoryManager;
  private dopamine: DopamineEngine;
  private prompts: ADHDPrompts;

  private activeFocusSessions: Map<number, FocusSession> = new Map();
  private activeBreaks: Map<number, BreakSession> = new Map();
  private focusCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    bot: Telegraf,
    tasks: TaskManager,
    memory: MemoryManager,
    dopamine: DopamineEngine,
    prompts: ADHDPrompts
  ) {
    this.bot = bot;
    this.tasks = tasks;
    this.memory = memory;
    this.dopamine = dopamine;
    this.prompts = prompts;
  }

  /**
   * Start the check-in scheduler
   */
  start(): void {
    const { checkInIntervalMinutes, checkInStartHour, checkInEndHour, checkInDays } = config;

    // Build cron expression
    // */45 9-18 * * 1-5 = every 45 minutes, 9am-6pm, Mon-Fri
    const daysStr = checkInDays.join(',');
    const cronExpr = `*/${checkInIntervalMinutes} ${checkInStartHour}-${checkInEndHour} * * ${daysStr}`;

    console.log(`⏰ Check-in scheduler: ${cronExpr}`);

    // Schedule periodic check-ins
    cron.schedule(cronExpr, () => {
      this.sendProactiveCheckIn();
    });

    // Start focus session monitoring
    this.focusCheckInterval = setInterval(() => {
      this.monitorFocusSessions();
      this.monitorBreaks();
    }, 30000); // Check every 30 seconds

    // Daily summary (end of work day)
    cron.schedule(`0 ${checkInEndHour} * * ${daysStr}`, () => {
      this.sendDailySummary();
    });

    console.log('✅ Check-in service started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.focusCheckInterval) {
      clearInterval(this.focusCheckInterval);
    }
    console.log('🛑 Check-in service stopped');
  }

  /**
   * Send a proactive check-in message
   */
  private async sendProactiveCheckIn(): Promise<void> {
    const chatId = config.telegramChatId;
    if (!chatId) {
      console.warn('No TELEGRAM_CHAT_ID configured for check-ins');
      return;
    }

    // Don't interrupt focus sessions
    if (this.activeFocusSessions.has(parseInt(chatId))) {
      return;
    }

    try {
      const context = this.memory.getContext();
      const stats = this.dopamine.getStats();
      const streak = this.dopamine.getStreak();

      // Calculate time since last activity
      const lastActionTime = context.lastActionTime 
        ? new Date(context.lastActionTime).getTime()
        : 0;
      const minutesSinceLastActivity = Math.round(
        (Date.now() - lastActionTime) / 1000 / 60
      );

      const message = await this.prompts.generateCheckIn({
        currentTaskTitle: context.lastTaskTitle,
        minutesSinceLastActivity,
        tasksCompletedToday: stats.tasksCompletedToday,
        currentStreak: streak.current,
      });

      await this.bot.telegram.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Done something!', callback_data: 'checkin_done' },
              { text: '🔄 Working', callback_data: 'checkin_working' },
            ],
            [
              { text: '😫 Stuck', callback_data: 'checkin_stuck' },
              { text: '⏸️ Break', callback_data: 'checkin_break' },
            ],
          ],
        },
      });
    } catch (error) {
      console.error('Failed to send check-in:', error);
    }
  }

  /**
   * Handle check-in button responses
   */
  async handleCheckInResponse(chatId: number, response: string): Promise<string> {
    switch (response) {
      case 'checkin_done': {
        const pending = await this.tasks.getPending();
        if (pending.length === 0) {
          return "🎉 Amazing! All tasks done! Add more with /add or enjoy your free time!";
        }
        return "Awesome! 🎉 Mark it complete with /done <number>\n\nOr tell me what you finished!";
      }

      case 'checkin_working': {
        const motivation = this.dopamine.getMotivation();
        return `Great! Keep at it! 💪\n\n${motivation}`;
      }

      case 'checkin_stuck': {
        const context = this.memory.getContext();
        return await this.prompts.getUnstuckAdvice(context.lastTaskTitle);
      }

      case 'checkin_break': {
        return `Taking a break is important! 🧘\n\nStart a proper break with /break\n\nOr just chill - I won't bug you for a bit. 💜`;
      }

      default:
        return "Got it! Let me know if you need anything.";
    }
  }

  /**
   * Start a focus session
   */
  startFocusSession(chatId: number, durationMinutes: number, taskId?: number): void {
    this.activeFocusSessions.set(chatId, {
      chatId,
      startedAt: new Date(),
      durationMinutes,
      halfwayNotified: false,
      taskId,
    });

    this.memory.startFocus(durationMinutes, taskId);
    console.log(`🎯 Focus session started for ${chatId}: ${durationMinutes} minutes`);
  }

  /**
   * End a focus session
   */
  endFocusSession(chatId: number, completed: boolean): void {
    this.activeFocusSessions.delete(chatId);
    this.memory.endFocus(completed);
    console.log(`🎯 Focus session ended for ${chatId}: ${completed ? 'completed' : 'cancelled'}`);
  }

  /**
   * Start a break
   */
  startBreak(chatId: number, durationMinutes: number): void {
    const endAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    this.activeBreaks.set(chatId, { chatId, endAt });
    console.log(`⏸️ Break started for ${chatId}: ${durationMinutes} minutes`);
  }

  /**
   * Monitor active focus sessions
   */
  private async monitorFocusSessions(): Promise<void> {
    const now = new Date();

    for (const [chatId, session] of this.activeFocusSessions) {
      const elapsed = (now.getTime() - session.startedAt.getTime()) / 1000 / 60;
      const halfway = session.durationMinutes / 2;
      const remaining = session.durationMinutes - elapsed;

      // Halfway notification
      if (!session.halfwayNotified && elapsed >= halfway && remaining > 5) {
        session.halfwayNotified = true;
        try {
          await this.bot.telegram.sendMessage(
            chatId,
            `⏱️ Halfway there!\n\n` +
            `${Math.ceil(remaining)} minutes left.\n\n` +
            `You're doing great! Keep going! 💪`,
            {
              reply_markup: {
                inline_keyboard: [[
                  { text: '✅ Done early!', callback_data: 'focus_done_early' },
                  { text: '⏸️ Need a break', callback_data: 'focus_need_break' },
                ]],
              },
            }
          );
        } catch (error) {
          console.error('Failed to send halfway notification:', error);
        }
      }

      // Session complete
      if (elapsed >= session.durationMinutes) {
        const stats = this.dopamine.getStats();
        const pomodorosCompleted = this.memory.getFocusState().pomodorosCompleted + 1;
        const needsLongBreak = pomodorosCompleted % config.pomodorosBeforeLongBreak === 0;

        this.endFocusSession(chatId, true);

        try {
          const breakDuration = needsLongBreak 
            ? config.longBreakDurationMinutes 
            : config.breakDurationMinutes;

          await this.bot.telegram.sendMessage(
            chatId,
            `🎉 Focus session complete!\n\n` +
            `You stayed focused for ${session.durationMinutes} minutes!\n` +
            `🍅 Pomodoros today: ${pomodorosCompleted}\n\n` +
            (needsLongBreak 
              ? `⭐ You've earned a long break! (${breakDuration} min recommended)`
              : `Time for a ${breakDuration}-minute break!`),
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: `☕ Take ${breakDuration}min break`, callback_data: `break_${breakDuration}` },
                    { text: '🔥 Keep going!', callback_data: 'focus_continue' },
                  ],
                  [
                    { text: '✅ Done for now', callback_data: 'focus_end' },
                  ],
                ],
              },
            }
          );
        } catch (error) {
          console.error('Failed to send session complete notification:', error);
        }
      }
    }
  }

  /**
   * Monitor active breaks
   */
  private async monitorBreaks(): Promise<void> {
    const now = new Date();

    for (const [chatId, breakSession] of this.activeBreaks) {
      if (now >= breakSession.endAt) {
        this.activeBreaks.delete(chatId);

        try {
          await this.bot.telegram.sendMessage(
            chatId,
            `⏰ Break's over!\n\n` +
            `Ready to get back to it?\n\n` +
            `${this.dopamine.getMotivation()}`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🎯 Start focus session', callback_data: 'focus_25' },
                    { text: '📋 Show tasks', callback_data: 'show_tasks' },
                  ],
                  [
                    { text: '⏸️ 5 more minutes', callback_data: 'break_5' },
                  ],
                ],
              },
            }
          );
        } catch (error) {
          console.error('Failed to send break end notification:', error);
        }
      }
    }
  }

  /**
   * Send daily summary
   */
  private async sendDailySummary(): Promise<void> {
    const chatId = config.telegramChatId;
    if (!chatId) return;

    try {
      const stats = this.dopamine.getStats();
      const taskStats = this.tasks.getStats();
      const streak = this.dopamine.getStreak();

      // Only send if there was activity today
      if (stats.tasksCompletedToday === 0 && stats.todayPoints === 0) {
        return;
      }

      let message = `📊 Daily Summary\n\n`;
      message += `✅ Tasks completed: ${stats.tasksCompletedToday}\n`;
      message += `🎮 Points earned: ${stats.todayPoints}\n`;
      message += `🔥 Streak: ${streak.current} days\n`;
      message += `⭐ Level: ${stats.level}\n`;

      if (stats.tasksCompletedToday >= 5) {
        message += `\n🏆 Incredible day! You're crushing it!`;
      } else if (stats.tasksCompletedToday >= 3) {
        message += `\n💪 Solid progress today!`;
      } else if (stats.tasksCompletedToday >= 1) {
        message += `\n✨ Progress is progress! Well done.`;
      }

      // Check for new achievements
      if (stats.achievements.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const newToday = stats.achievements.filter(
          a => a.unlockedAt.toISOString().split('T')[0] === today
        );
        if (newToday.length > 0) {
          message += `\n\n🏅 New achievements:\n`;
          newToday.forEach(a => {
            message += `${a.emoji} ${a.name}\n`;
          });
        }
      }

      message += `\n\nSee you tomorrow! 🌙`;

      await this.bot.telegram.sendMessage(chatId, message);

      // Record daily stats
      this.memory.recordDailyStats({
        tasksCompleted: stats.tasksCompletedToday,
        pointsEarned: stats.todayPoints,
        focusMinutes: 0, // Would track from focus sessions
        averageEnergy: this.memory.getPreferences().averageEnergyLevel,
      });
    } catch (error) {
      console.error('Failed to send daily summary:', error);
    }
  }

  /**
   * Check if user is in focus mode
   */
  isInFocusMode(chatId: number): boolean {
    return this.activeFocusSessions.has(chatId);
  }

  /**
   * Get remaining focus time
   */
  getFocusRemaining(chatId: number): number | null {
    const session = this.activeFocusSessions.get(chatId);
    if (!session) return null;

    const elapsed = (Date.now() - session.startedAt.getTime()) / 1000 / 60;
    return Math.max(0, session.durationMinutes - elapsed);
  }
}
