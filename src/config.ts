/**
 * Configuration management with type-safe environment variables
 * 
 * Following OpenClaw patterns: centralized config, validation, sensible defaults
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Load environment variables
dotenvConfig();

// Configuration schema with validation
const ConfigSchema = z.object({
  // Telegram
  telegramBotToken: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  telegramChatId: z.string().optional(),

  // Claude API
  anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  anthropicModel: z.string().default('claude-sonnet-4-20250514'),

  // Check-in settings
  checkInIntervalMinutes: z.number().min(5).max(120).default(45),
  checkInStartHour: z.number().min(0).max(23).default(9),
  checkInEndHour: z.number().min(0).max(23).default(18),
  checkInDays: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),

  // Focus session
  pomodoroDurationMinutes: z.number().min(5).max(90).default(25),
  breakDurationMinutes: z.number().min(1).max(30).default(5),
  pomodorosBeforeLongBreak: z.number().min(1).max(10).default(4),
  longBreakDurationMinutes: z.number().min(5).max(60).default(15),

  // Apple Reminders
  enableAppleReminders: z.boolean().default(false),
  appleRemindersList: z.string().default('ADHD Planner'),

  // Data storage
  dataDir: z.string().default('./data'),

  // Dopamine system
  basePointsPerTask: z.number().min(1).max(100).default(10),
  randomBonusChance: z.number().min(0).max(1).default(0.2),
  maxRandomBonus: z.number().min(1).max(100).default(25),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse and validate configuration from environment variables
 */
function loadConfig(): Config {
  const rawConfig = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL,
    checkInIntervalMinutes: parseInt(process.env.CHECK_IN_INTERVAL_MINUTES || '45'),
    checkInStartHour: parseInt(process.env.CHECK_IN_START_HOUR || '9'),
    checkInEndHour: parseInt(process.env.CHECK_IN_END_HOUR || '18'),
    checkInDays: process.env.CHECK_IN_DAYS
      ? process.env.CHECK_IN_DAYS.split(',').map(d => parseInt(d.trim()))
      : [1, 2, 3, 4, 5],
    pomodoroDurationMinutes: parseInt(process.env.POMODORO_DURATION_MINUTES || '25'),
    breakDurationMinutes: parseInt(process.env.BREAK_DURATION_MINUTES || '5'),
    pomodorosBeforeLongBreak: parseInt(process.env.POMODOROS_BEFORE_LONG_BREAK || '4'),
    longBreakDurationMinutes: parseInt(process.env.LONG_BREAK_DURATION_MINUTES || '15'),
    enableAppleReminders: process.env.ENABLE_APPLE_REMINDERS === 'true',
    appleRemindersList: process.env.APPLE_REMINDERS_LIST,
    dataDir: process.env.DATA_DIR,
    basePointsPerTask: parseInt(process.env.BASE_POINTS_PER_TASK || '10'),
    randomBonusChance: parseFloat(process.env.RANDOM_BONUS_CHANCE || '0.2'),
    maxRandomBonus: parseInt(process.env.MAX_RANDOM_BONUS || '25'),
  };

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error('❌ Configuration error:');
    result.error.issues.forEach(issue => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  // Ensure data directory exists
  if (!existsSync(result.data.dataDir)) {
    mkdirSync(result.data.dataDir, { recursive: true });
    console.log(`📁 Created data directory: ${result.data.dataDir}`);
  }

  return result.data;
}

// Export singleton config
export const config = loadConfig();

// Helper to get database path
export function getDatabasePath(): string {
  return join(config.dataDir, 'adhd-planner.db');
}

// Helper to get memory path
export function getMemoryPath(): string {
  return join(config.dataDir, 'memory.json');
}
