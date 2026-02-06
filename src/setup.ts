/**
 * Setup Script - Initialize the ADHD Planner AI
 * 
 * Run this once after installation to:
 * - Create data directory
 * - Initialize database
 * - Verify configuration
 * - Set up Apple Reminders list (if enabled)
 */

import { existsSync, mkdirSync } from 'fs';
import { config, getDatabasePath, getMemoryPath } from './config.js';
import { TaskManager } from './tasks.js';
import { DopamineEngine } from './dopamine.js';
import { MemoryManager } from './memory.js';
import { AppleRemindersSync } from './apple-reminders.js';

console.log('🧠 ADHD Planner AI - Setup\n');

// 1. Check data directory
console.log('📁 Checking data directory...');
if (!existsSync(config.dataDir)) {
  mkdirSync(config.dataDir, { recursive: true });
  console.log(`   Created: ${config.dataDir}`);
} else {
  console.log(`   Exists: ${config.dataDir}`);
}

// 2. Initialize database
console.log('\n💾 Initializing database...');
try {
  const tasks = new TaskManager();
  const dopamine = new DopamineEngine();
  console.log(`   Database: ${getDatabasePath()}`);
  tasks.close();
  dopamine.close();
  console.log('   ✅ Database initialized');
} catch (error) {
  console.error('   ❌ Database initialization failed:', error);
  process.exit(1);
}

// 3. Initialize memory
console.log('\n🧠 Initializing memory...');
try {
  const memory = new MemoryManager();
  console.log(`   Memory file: ${getMemoryPath()}`);
  memory.flush();
  console.log('   ✅ Memory initialized');
} catch (error) {
  console.error('   ❌ Memory initialization failed:', error);
}

// 4. Check Telegram configuration
console.log('\n📱 Checking Telegram configuration...');
if (config.telegramBotToken && config.telegramBotToken !== 'your-bot-token-here') {
  console.log('   ✅ Bot token configured');
  if (config.telegramChatId) {
    console.log(`   ✅ Chat ID: ${config.telegramChatId}`);
  } else {
    console.log('   ⚠️ TELEGRAM_CHAT_ID not set (bot will respond to anyone)');
  }
} else {
  console.log('   ⚠️ TELEGRAM_BOT_TOKEN not configured');
  console.log('   Get one from @BotFather on Telegram');
}

// 5. Check Claude API
console.log('\n🤖 Checking Claude API...');
if (config.anthropicApiKey && config.anthropicApiKey.startsWith('sk-ant-')) {
  console.log('   ✅ API key configured');
  console.log(`   Model: ${config.anthropicModel}`);
} else {
  console.log('   ⚠️ ANTHROPIC_API_KEY not configured');
  console.log('   Get one from console.anthropic.com');
}

// 6. Apple Reminders (if on macOS)
console.log('\n🍎 Checking Apple Reminders...');
const reminders = new AppleRemindersSync();
if (reminders.isAvailable()) {
  try {
    await reminders.initialize();
    console.log(`   ✅ Connected to list: "${config.appleRemindersList}"`);
  } catch (error) {
    console.log('   ⚠️ Could not connect to Apple Reminders');
    console.log('   Make sure the Reminders app has necessary permissions');
  }
} else {
  if (config.enableAppleReminders) {
    console.log('   ⚠️ Enabled but not on macOS - will be disabled');
  } else {
    console.log('   ℹ️ Disabled (set ENABLE_APPLE_REMINDERS=true to enable)');
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('Setup Complete!\n');

console.log('Check-in schedule:');
console.log(`  Every ${config.checkInIntervalMinutes} minutes`);
console.log(`  Between ${config.checkInStartHour}:00 and ${config.checkInEndHour}:00`);
console.log(`  Days: ${config.checkInDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`);

console.log('\nFocus settings:');
console.log(`  Pomodoro: ${config.pomodoroDurationMinutes} minutes`);
console.log(`  Break: ${config.breakDurationMinutes} minutes`);
console.log(`  Long break after: ${config.pomodorosBeforeLongBreak} pomodoros`);

console.log('\nTo start the bot:');
console.log('  npm run dev    # Development (with hot reload)');
console.log('  npm start      # Production\n');
