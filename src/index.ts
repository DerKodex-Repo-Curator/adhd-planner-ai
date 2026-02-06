/**
 * ADHD Planner AI - Main Entry Point
 * 
 * Built on OpenClaw patterns:
 * - Multi-channel messaging (Telegram)
 * - Claude API for natural language
 * - Memory persistence across sessions
 * - Cron-based proactive check-ins
 * - Tool integration (Apple Reminders)
 * 
 * @see https://github.com/openclaw/openclaw
 */

import { Telegraf, Context } from 'telegraf';
import { message, callbackQuery } from 'telegraf/filters';
import { config } from './config.js';
import { TaskManager } from './tasks.js';
import { MemoryManager } from './memory.js';
import { DopamineEngine } from './dopamine.js';
import { ADHDPrompts } from './prompts.js';
import { AppleRemindersSync } from './apple-reminders.js';
import { CheckInService } from './checkin.js';

// Initialize components
console.log('🧠 ADHD Planner AI starting up...');

const bot = new Telegraf(config.telegramBotToken);
const tasks = new TaskManager();
const memory = new MemoryManager();
const dopamine = new DopamineEngine();
const prompts = new ADHDPrompts();
const reminders = new AppleRemindersSync();
const checkIn = new CheckInService(bot, tasks, memory, dopamine, prompts);

// Initialize Apple Reminders if enabled
reminders.initialize().catch(() => {});

// Middleware: Check if message is from authorized user
bot.use((ctx, next) => {
  if (config.telegramChatId && ctx.chat) {
    if (ctx.chat.id.toString() !== config.telegramChatId) {
      console.log(`Unauthorized access attempt from chat ${ctx.chat.id}`);
      return;
    }
  }
  return next();
});

// ============================================
// COMMANDS
// ============================================

// /start - Welcome message
bot.start(async (ctx) => {
  const prefs = memory.getPreferences();
  
  if (!prefs.completedOnboarding) {
    await ctx.reply(
      `🧠 Hey! I'm your ADHD-friendly planner.\n\n` +
      `I'm here to help you get things done without the overwhelm.\n\n` +
      `Quick tips:\n` +
      `• I'll break big tasks into tiny steps\n` +
      `• I'll check in gently (not naggy!)\n` +
      `• I'll celebrate your wins with you 🎉\n\n` +
      `Try these commands:\n` +
      `/add <task> - Add something to do\n` +
      `/list - See your tasks\n` +
      `/focus - Start a focus session\n` +
      `/energy 1-5 - Log how you're feeling\n\n` +
      `I'll check in on you during work hours - but I'll be gentle! 💜`
    );
    memory.updatePreferences({ completedOnboarding: true });
  } else {
    const stats = dopamine.getStats();
    await ctx.reply(
      `Welcome back! 👋\n\n` +
      `🔥 Streak: ${stats.currentStreak} days\n` +
      `⭐ Level: ${stats.level}\n` +
      `📋 Pending: ${(await tasks.getPending()).length} tasks\n\n` +
      `What would you like to work on?`
    );
  }
});

// /help - Show all commands
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📚 Commands\n\n` +
    `**Tasks**\n` +
    `/add <task> - Add a new task\n` +
    `/list - Show today's tasks\n` +
    `/done <id> - Complete a task\n` +
    `/chunk <task> - Break down a big task\n\n` +
    `**Focus**\n` +
    `/focus [mins] - Start focus session (default 25)\n` +
    `/break [mins] - Take a break (default 5)\n\n` +
    `**Tracking**\n` +
    `/energy <1-5> - Log your energy level\n` +
    `/stats - View your progress\n\n` +
    `**Other**\n` +
    `/help - This message\n\n` +
    `💜 Remember: Progress over perfection!`,
    { parse_mode: 'Markdown' }
  );
});

// /add - Add a new task
bot.command('add', async (ctx) => {
  const taskText = ctx.message.text.replace('/add', '').trim();
  
  if (!taskText) {
    return ctx.reply(
      'What task do you want to add?\n\n' +
      'Try: `/add Write report`',
      { parse_mode: 'Markdown' }
    );
  }

  // Create the task
  const analysis = await prompts.analyzeTask(taskText);
  const task = tasks.create({
    title: taskText,
    energyRequired: analysis.energyRequired,
    estimatedMinutes: analysis.timeEstimateMinutes,
  });

  // Update memory context
  memory.updateContext({
    lastTaskId: task.id,
    lastTaskTitle: task.title,
    lastAction: 'add',
    lastActionTime: new Date().toISOString(),
  });

  // Build response
  let response = `📝 Added: "${task.title}"\n\n`;
  
  if (analysis.needsChunking) {
    response += `🔍 This looks like a bigger task (~${analysis.timeEstimate})\n\n`;
    response += `Want me to break it down into smaller pieces?`;
    
    await ctx.reply(response, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✂️ Yes, chunk it!', callback_data: `chunk_${task.id}` },
          { text: '➡️ Keep as-is', callback_data: 'chunk_no' },
        ]],
      },
    });
  } else {
    response += `${analysis.encouragement}\n`;
    response += `⏱️ ${prompts.formatTimeADHD(analysis.timeEstimateMinutes)} | `;
    response += `🔋${'🔋'.repeat(analysis.energyRequired - 1)}`;
    
    if (analysis.tips.length > 0) {
      response += `\n\n💡 ${analysis.tips[0]}`;
    }
    
    await ctx.reply(response);
  }

  // Sync to Apple Reminders
  if (reminders.isAvailable()) {
    await reminders.add(task);
  }

  // Record activity for streak
  memory.recordActivity();
});

// /list - Show tasks
bot.command('list', async (ctx) => {
  const todayTasks = tasks.getToday();
  const pending = tasks.getPending();
  
  if (todayTasks.length === 0 && pending.length === 0) {
    return ctx.reply(
      `📋 No tasks yet!\n\n` +
      `Either you're all caught up (amazing! 🎉)\n` +
      `Or maybe /add something?`
    );
  }

  const completed = todayTasks.filter(t => t.completed);
  const todayPending = todayTasks.filter(t => !t.completed);
  
  let message = `📋 Your Tasks\n\n`;
  
  if (todayPending.length > 0) {
    message += `**Today** (${todayPending.length} pending)\n`;
    todayPending.forEach((t, i) => {
      const energy = '🔋'.repeat(t.energyRequired);
      message += `${i + 1}. ${t.title} ${energy}\n`;
    });
    message += `\n`;
  }
  
  // Show other pending tasks not from today
  const otherPending = pending.filter(
    t => !todayTasks.some(today => today.id === t.id)
  );
  
  if (otherPending.length > 0) {
    message += `**Earlier** (${otherPending.length} pending)\n`;
    otherPending.slice(0, 5).forEach(t => {
      message += `• ${t.title}\n`;
    });
    if (otherPending.length > 5) {
      message += `...and ${otherPending.length - 5} more\n`;
    }
    message += `\n`;
  }
  
  if (completed.length > 0) {
    message += `**Done Today** ✅\n`;
    completed.forEach(t => {
      message += `• ~~${t.title}~~\n`;
    });
    message += `\n`;
  }
  
  // Add stats
  const stats = dopamine.getStats();
  message += `🎮 ${stats.todayPoints} pts | 🔥 ${stats.currentStreak} day streak`;
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// /done - Complete a task
bot.command('done', async (ctx) => {
  const idStr = ctx.message.text.replace('/done', '').trim();
  
  if (!idStr) {
    const pending = tasks.getPending().slice(0, 5);
    if (pending.length === 0) {
      return ctx.reply("No pending tasks! You're all caught up! 🎉");
    }
    
    let message = 'Which task did you complete?\n\n';
    pending.forEach((t, i) => {
      message += `${i + 1}. ${t.title}\n`;
    });
    message += '\nReply with the number: /done 1';
    return ctx.reply(message);
  }

  // Handle by number (position in today's list) or by ID
  let taskId: number;
  const num = parseInt(idStr);
  
  if (num <= 10) {
    // Treat as position in today's pending list
    const pending = tasks.getToday().filter(t => !t.completed);
    if (num > pending.length || num < 1) {
      return ctx.reply("Hmm, can't find that task. Try /list to see your tasks.");
    }
    taskId = pending[num - 1].id;
  } else {
    taskId = num;
  }

  const task = tasks.complete(taskId);
  
  if (!task) {
    return ctx.reply("Couldn't find that task. Try /list to see your tasks.");
  }

  // Award points
  const points = dopamine.awardPoints(task);
  
  // Build celebration message
  let message = prompts.getCelebration(task.title, points.earned);
  
  if (points.bonuses.length > 0) {
    message += '\n\n';
    points.bonuses.forEach(b => {
      message += `${b.message}\n`;
    });
  }
  
  if (points.newAchievements.length > 0) {
    message += '\n\n🏆 NEW ACHIEVEMENT!\n';
    points.newAchievements.forEach(a => {
      message += `${a.emoji} **${a.name}**: ${a.description}\n`;
    });
  }
  
  // Update memory
  memory.updateContext({
    lastTaskId: task.id,
    lastTaskTitle: task.title,
    lastAction: 'complete',
    lastActionTime: new Date().toISOString(),
  });
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
  
  // Sync to Apple Reminders
  if (reminders.isAvailable()) {
    await reminders.complete(task);
  }
});

// /focus - Start focus session
bot.command('focus', async (ctx) => {
  const args = ctx.message.text.replace('/focus', '').trim();
  const duration = parseInt(args) || config.pomodoroDurationMinutes;
  
  if (checkIn.isInFocusMode(ctx.chat.id)) {
    const remaining = checkIn.getFocusRemaining(ctx.chat.id);
    return ctx.reply(
      `You're already in focus mode! ⏱️\n\n` +
      `${Math.ceil(remaining || 0)} minutes remaining.\n\n` +
      `Keep going! 💪`
    );
  }
  
  // Find current task if one was recently added
  const context = memory.getContext();
  const taskId = context.lastTaskId;
  
  checkIn.startFocusSession(ctx.chat.id, duration, taskId);
  
  await ctx.reply(
    `🎯 Focus Mode: ON\n\n` +
    `Starting a ${duration}-minute session.\n\n` +
    `Quick tips:\n` +
    `• 📱 Phone on silent\n` +
    `• 🖥️ Close extra tabs\n` +
    `• 💧 Water nearby\n\n` +
    `I'll check on you halfway through.\n` +
    `You got this! 💜`
  );
});

// /break - Take a break
bot.command('break', async (ctx) => {
  const args = ctx.message.text.replace('/break', '').trim();
  const duration = parseInt(args) || config.breakDurationMinutes;
  
  // End focus session if active
  if (checkIn.isInFocusMode(ctx.chat.id)) {
    checkIn.endFocusSession(ctx.chat.id, false);
  }
  
  checkIn.startBreak(ctx.chat.id, duration);
  
  const breakIdeas = [
    '🚶 Take a quick walk',
    '💧 Drink some water',
    '🧘 Do some stretches',
    '🎵 Listen to a song',
    '🌿 Look at something green',
    '😮‍💨 Take 5 deep breaths',
    '☕ Get a snack or drink',
    '🪟 Look outside for a minute',
  ];
  
  const idea = breakIdeas[Math.floor(Math.random() * breakIdeas.length)];
  
  await ctx.reply(
    `⏸️ Break Time! (${duration} min)\n\n` +
    `${idea}\n\n` +
    `I'll let you know when it's time to get back.`
  );
});

// /energy - Log energy level
bot.command('energy', async (ctx) => {
  const args = ctx.message.text.replace('/energy', '').trim();
  const level = parseInt(args);
  
  if (isNaN(level) || level < 1 || level > 5) {
    return ctx.reply(
      `How's your energy right now?\n\n` +
      `1 - 😴 Exhausted\n` +
      `2 - 😐 Low\n` +
      `3 - 🙂 Okay\n` +
      `4 - 😊 Good\n` +
      `5 - ⚡ Energized!\n\n` +
      `Reply with: /energy <number>`
    );
  }

  // Log the energy
  memory.logEnergy(level);
  
  // Get task suggestions
  const pending = tasks.getPending();
  const suggestion = await prompts.suggestByEnergy(level, pending);
  
  const energyBar = '⚡'.repeat(level) + '◽'.repeat(5 - level);
  
  let message = `Energy logged: ${energyBar}\n\n`;
  message += `${suggestion.message}\n`;
  
  if (suggestion.tasks) {
    message += `\n**Suggested tasks:**\n${suggestion.tasks}`;
  }
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// /chunk - Break down a task
bot.command('chunk', async (ctx) => {
  const taskText = ctx.message.text.replace('/chunk', '').trim();
  
  if (!taskText) {
    return ctx.reply(
      'What task should I break down?\n\n' +
      'Try: `/chunk Write thesis chapter`',
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.reply('🔍 Breaking this down for you...');
  
  const chunks = await prompts.chunkTask(taskText);
  
  // Store chunks in memory for confirmation
  memory.setPendingChunks(chunks.map(c => ({ title: c.title, time: c.time })));
  memory.updateContext({
    lastAction: 'chunk',
    lastActionTime: new Date().toISOString(),
  });
  
  let message = `📦 "${taskText}" broken into pieces:\n\n`;
  
  chunks.forEach((chunk, i) => {
    const icon = chunk.isBreak ? '☕' : '📝';
    message += `${i + 1}. ${icon} ${chunk.title} (${chunk.time})\n`;
  });
  
  const totalTime = chunks.reduce((sum, c) => sum + c.minutes, 0);
  message += `\n⏱️ Total: ~${totalTime} min\n`;
  
  await ctx.reply(message, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Add all as tasks', callback_data: 'chunks_add_all' },
        { text: '❌ Cancel', callback_data: 'chunks_cancel' },
      ]],
    },
  });
});

// /stats - View progress
bot.command('stats', async (ctx) => {
  const stats = dopamine.getStats();
  const taskStats = tasks.getStats();
  
  const progressBar = (percent: number) => {
    const filled = Math.round(percent / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  };
  
  let message = `📊 Your Stats\n\n`;
  
  // Level and progress
  message += `**Level ${stats.level}** ${progressBar(stats.levelProgress)} ${stats.levelProgress}%\n`;
  message += `Total points: ${stats.totalPoints}\n\n`;
  
  // Today
  message += `**Today**\n`;
  message += `✅ Tasks: ${stats.tasksCompletedToday}\n`;
  message += `🎮 Points: ${stats.todayPoints}\n\n`;
  
  // Streaks
  message += `**Streaks**\n`;
  message += `🔥 Current: ${stats.currentStreak} days\n`;
  message += `👑 Longest: ${stats.longestStreak} days\n\n`;
  
  // Achievements
  if (stats.achievements.length > 0) {
    message += `**Achievements** (${stats.achievements.length})\n`;
    stats.achievements.slice(0, 5).forEach(a => {
      message += `${a.emoji} ${a.name}\n`;
    });
    if (stats.achievements.length > 5) {
      message += `...and ${stats.achievements.length - 5} more!\n`;
    }
  }
  
  // Productivity insights
  if (taskStats.mostProductiveHour !== undefined) {
    message += `\n💡 Most productive hour: ${taskStats.mostProductiveHour}:00`;
  }
  
  await ctx.reply(message, { parse_mode: 'Markdown' });
});

// ============================================
// CALLBACK QUERIES (Button responses)
// ============================================

bot.on(callbackQuery('data'), async (ctx) => {
  const data = ctx.callbackQuery.data;
  
  // Acknowledge the button press
  await ctx.answerCbQuery();
  
  // Chunk confirmation
  if (data.startsWith('chunk_')) {
    const taskId = parseInt(data.replace('chunk_', ''));
    if (taskId) {
      const task = tasks.getById(taskId);
      if (task) {
        await ctx.reply('🔍 Breaking this down...');
        const chunks = await prompts.chunkTask(task.title);
        memory.setPendingChunks(chunks.map(c => ({ title: c.title, time: c.time })));
        
        let message = `📦 "${task.title}" broken into pieces:\n\n`;
        chunks.forEach((chunk, i) => {
          const icon = chunk.isBreak ? '☕' : '📝';
          message += `${i + 1}. ${icon} ${chunk.title} (${chunk.time})\n`;
        });
        
        await ctx.reply(message, {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Add all as tasks', callback_data: 'chunks_add_all' },
              { text: '❌ Cancel', callback_data: 'chunks_cancel' },
            ]],
          },
        });
      }
    }
    return;
  }
  
  if (data === 'chunk_no') {
    await ctx.reply('Got it! Task kept as-is. 👍');
    return;
  }
  
  if (data === 'chunks_add_all') {
    const chunks = memory.consumePendingChunks();
    if (chunks && chunks.length > 0) {
      const context = memory.getContext();
      for (const chunk of chunks) {
        if (!chunk.title.toLowerCase().includes('break')) {
          tasks.create({
            title: chunk.title,
            estimatedMinutes: parseInt(chunk.time) || 10,
            energyRequired: 1,
            parentId: context.lastTaskId,
          });
        }
      }
      dopamine.recordChunksCreated(chunks.length);
      await ctx.reply(`✅ Added ${chunks.length} subtasks! Check /list to see them.`);
    } else {
      await ctx.reply("Hmm, couldn't find the chunks. Try /chunk again?");
    }
    return;
  }
  
  if (data === 'chunks_cancel') {
    memory.consumePendingChunks(); // Clear pending
    await ctx.reply('Cancelled! No tasks added.');
    return;
  }
  
  // Focus/break controls
  if (data.startsWith('focus_')) {
    const action = data.replace('focus_', '');
    if (action === 'done_early') {
      checkIn.endFocusSession(ctx.chat!.id, true);
      await ctx.reply('🎉 Great work! Session ended early. Take a break?');
    } else if (action === 'need_break') {
      checkIn.endFocusSession(ctx.chat!.id, false);
      checkIn.startBreak(ctx.chat!.id, config.breakDurationMinutes);
      await ctx.reply(`⏸️ Taking a ${config.breakDurationMinutes}-minute break. You deserve it!`);
    } else if (action === 'continue') {
      checkIn.startFocusSession(ctx.chat!.id, config.pomodoroDurationMinutes);
      await ctx.reply('🔥 Let\'s go! Another focus session started!');
    } else if (action === 'end') {
      await ctx.reply('Great work today! 💜 See you next time.');
    } else {
      const mins = parseInt(action);
      if (mins) {
        checkIn.startFocusSession(ctx.chat!.id, mins);
        await ctx.reply(`🎯 ${mins}-minute focus session started!`);
      }
    }
    return;
  }
  
  if (data.startsWith('break_')) {
    const mins = parseInt(data.replace('break_', ''));
    if (mins) {
      checkIn.startBreak(ctx.chat!.id, mins);
      await ctx.reply(`☕ ${mins}-minute break started. Enjoy!`);
    }
    return;
  }
  
  // Check-in responses
  if (data.startsWith('checkin_')) {
    const response = await checkIn.handleCheckInResponse(ctx.chat!.id, data);
    await ctx.reply(response);
    return;
  }
  
  if (data === 'show_tasks') {
    // Trigger /list command
    const pending = tasks.getPending();
    if (pending.length === 0) {
      await ctx.reply('No pending tasks! 🎉');
    } else {
      let message = '📋 Pending tasks:\n\n';
      pending.slice(0, 5).forEach((t, i) => {
        message += `${i + 1}. ${t.title}\n`;
      });
      await ctx.reply(message);
    }
    return;
  }
});

// ============================================
// TEXT MESSAGES
// ============================================

bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text.toLowerCase().trim();
  
  // Quick responses for common phrases
  if (['yes', 'yeah', 'yep', 'sure', 'ok'].includes(text)) {
    const context = memory.getContext();
    if (context.awaitingChunkConfirmation) {
      const chunks = memory.consumePendingChunks();
      if (chunks) {
        for (const chunk of chunks) {
          if (!chunk.title.toLowerCase().includes('break')) {
            tasks.create({
              title: chunk.title,
              estimatedMinutes: parseInt(chunk.time) || 10,
              energyRequired: 1,
            });
          }
        }
        return ctx.reply(`✅ Added ${chunks.length} subtasks!`);
      }
    }
  }
  
  if (['done', 'done!', 'finished', '✅'].includes(text)) {
    return ctx.reply('🎉 Awesome! Mark it with /done <task number>');
  }
  
  if (['stuck', 'help', 'ugh', '😫'].includes(text)) {
    const context = memory.getContext();
    const advice = await prompts.getUnstuckAdvice(context.lastTaskTitle);
    return ctx.reply(advice);
  }
  
  if (['hi', 'hello', 'hey'].includes(text)) {
    const stats = dopamine.getStats();
    return ctx.reply(
      `Hey! 👋\n\n` +
      `${dopamine.getMotivation()}\n\n` +
      `What would you like to work on?`
    );
  }
});

// ============================================
// ERROR HANDLING
// ============================================

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('Oops, something went wrong! 😅 Try again?').catch(() => {});
});

// ============================================
// STARTUP
// ============================================

// Start check-in scheduler
checkIn.start();

// Launch bot
bot.launch().then(() => {
  console.log('🧠 ADHD Planner AI is running!');
  console.log(`📱 Telegram bot: @${bot.botInfo?.username}`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down...`);
  checkIn.stop();
  memory.flush();
  tasks.close();
  dopamine.close();
  bot.stop(signal);
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
