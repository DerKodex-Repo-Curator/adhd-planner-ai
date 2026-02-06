import { Telegraf, Context } from 'telegraf';
import { config } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { TaskManager } from './tasks';
import { CheckInService } from './checkin';
import { DopamineEngine } from './dopamine';
import { AppleRemindersSync } from './apple-reminders';
import { ADHDPrompts } from './prompts';

config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const tasks = new TaskManager();
const checkIn = new CheckInService(bot, tasks);
const dopamine = new DopamineEngine();
const reminders = new AppleRemindersSync();
const prompts = new ADHDPrompts(claude);

// Start command
bot.start(async (ctx) => {
  await ctx.reply(
    `🧠 Hey! I'm your ADHD-friendly planner.\n\n` +
    `I'm here to help you get things done without the overwhelm.\n\n` +
    `Try these commands:\n` +
    `/add <task> - Add a task\n` +
    `/list - See your tasks\n` +
    `/focus - Start a focus session\n` +
    `/done <id> - Complete a task\n\n` +
    `I'll check in on you regularly - but gently! 💜`
  );
});

// Add task
bot.command('add', async (ctx) => {
  const taskText = ctx.message.text.replace('/add', '').trim();
  
  if (!taskText) {
    return ctx.reply('What task do you want to add? Try: /add Write report');
  }

  const task = await tasks.create(taskText);
  
  // Ask Claude if this needs chunking
  const analysis = await prompts.analyzeTask(taskText);
  
  let response = `📝 Added: "${task.title}"\n\n`;
  
  if (analysis.needsChunking) {
    response += `That sounds like a big one! 🐘\n\n`;
    response += `Want me to break it down into smaller pieces?\n`;
    response += `Reply "yes" to chunk it up!`;
  } else {
    response += `${analysis.encouragement}\n`;
    response += `⏱️ Estimated: ${analysis.timeEstimate}`;
  }
  
  await ctx.reply(response);
  
  // Sync to Apple Reminders if enabled
  if (process.env.ENABLE_APPLE_REMINDERS === 'true') {
    await reminders.add(task);
  }
});

// List tasks
bot.command('list', async (ctx) => {
  const allTasks = await tasks.getToday();
  
  if (allTasks.length === 0) {
    return ctx.reply(
      `📋 No tasks for today!\n\n` +
      `Either you're all caught up (amazing! 🎉)\n` +
      `Or maybe /add something?`
    );
  }

  const completed = allTasks.filter(t => t.completed);
  const pending = allTasks.filter(t => !t.completed);
  
  let message = `📋 Today's Tasks\n\n`;
  
  if (pending.length > 0) {
    message += `⏳ To Do:\n`;
    pending.forEach((t, i) => {
      const energy = '🔋'.repeat(t.energyRequired || 2);
      message += `${i + 1}. ${t.title} ${energy}\n`;
    });
    message += `\n`;
  }
  
  if (completed.length > 0) {
    message += `✅ Done:\n`;
    completed.forEach(t => {
      message += `• ${t.title}\n`;
    });
  }
  
  // Add dopamine stats
  const stats = dopamine.getTodayStats();
  message += `\n🎮 Points: ${stats.points} | 🔥 Streak: ${stats.streak} days`;
  
  await ctx.reply(message);
});

// Mark task done
bot.command('done', async (ctx) => {
  const idStr = ctx.message.text.replace('/done', '').trim();
  const id = parseInt(idStr);
  
  if (isNaN(id)) {
    return ctx.reply('Which task? Try: /done 1');
  }

  const task = await tasks.complete(id);
  
  if (!task) {
    return ctx.reply("Hmm, can't find that task. Try /list to see your tasks.");
  }

  // Award dopamine points
  const points = dopamine.awardPoints(task);
  
  const celebrations = [
    `🎉 YES! "${task.title}" is DONE!`,
    `✨ Crushed it! "${task.title}" complete!`,
    `🏆 Another one bites the dust! "${task.title}"`,
    `💪 Look at you go! "${task.title}" finished!`,
  ];
  
  const celebration = celebrations[Math.floor(Math.random() * celebrations.length)];
  
  await ctx.reply(
    `${celebration}\n\n` +
    `+${points.earned} points! 🎮\n` +
    `Total today: ${points.total}\n\n` +
    `${points.bonusMessage || ''}`
  );

  // Sync completion to Apple Reminders
  if (process.env.ENABLE_APPLE_REMINDERS === 'true') {
    await reminders.complete(task);
  }
});

// Start focus session
bot.command('focus', async (ctx) => {
  const duration = parseInt(process.env.POMODORO_DURATION_MINUTES || '25');
  
  await ctx.reply(
    `🎯 Focus Mode: ON\n\n` +
    `Starting a ${duration}-minute session.\n\n` +
    `Quick tips:\n` +
    `• Phone on silent 📱\n` +
    `• One tab only 🖥️\n` +
    `• Water nearby 💧\n\n` +
    `I'll check on you in ${Math.floor(duration / 2)} minutes.\n` +
    `You got this! 💜`
  );

  checkIn.startFocusSession(ctx.chat.id, duration);
});

// Take a break
bot.command('break', async (ctx) => {
  const breakDuration = parseInt(process.env.BREAK_DURATION_MINUTES || '5');
  
  const breakIdeas = [
    '🚶 Take a quick walk',
    '💧 Drink some water',
    '🧘 Do some stretches',
    '🎵 Listen to a song',
    '🌿 Look at something green',
    '😮‍💨 Take 5 deep breaths',
  ];
  
  const idea = breakIdeas[Math.floor(Math.random() * breakIdeas.length)];
  
  await ctx.reply(
    `⏸️ Break Time! (${breakDuration} min)\n\n` +
    `${idea}\n\n` +
    `I'll nudge you when it's time to get back.`
  );

  checkIn.startBreak(ctx.chat.id, breakDuration);
});

// Log energy level
bot.command('energy', async (ctx) => {
  const level = parseInt(ctx.message.text.replace('/energy', '').trim());
  
  if (isNaN(level) || level < 1 || level > 5) {
    return ctx.reply(
      `How's your energy right now?\n\n` +
      `Reply with /energy and a number:\n` +
      `1 - 😴 Exhausted\n` +
      `2 - 😐 Low\n` +
      `3 - 🙂 Okay\n` +
      `4 - 😊 Good\n` +
      `5 - ⚡ Energized!`
    );
  }

  // Get task suggestions based on energy
  const suggestions = await prompts.suggestByEnergy(level, await tasks.getPending());
  
  await ctx.reply(
    `Energy logged: ${'⚡'.repeat(level)}${'◽'.repeat(5 - level)}\n\n` +
    `${suggestions.message}\n\n` +
    `Suggested tasks:\n${suggestions.tasks}`
  );
});

// Chunk a task
bot.command('chunk', async (ctx) => {
  const taskText = ctx.message.text.replace('/chunk', '').trim();
  
  if (!taskText) {
    return ctx.reply('What task should I break down? Try: /chunk Write thesis');
  }

  await ctx.reply('🔍 Breaking this down for you...');
  
  const chunks = await prompts.chunkTask(taskText);
  
  let message = `📦 "${taskText}" broken into pieces:\n\n`;
  
  chunks.forEach((chunk, i) => {
    message += `${i + 1}. ${chunk.title} (${chunk.time})\n`;
  });
  
  message += `\nWant me to add these as separate tasks? Reply "yes"!`;
  
  await ctx.reply(message);
});

// Handle text messages for conversational interaction
bot.on('text', async (ctx) => {
  const text = ctx.message.text.toLowerCase();
  
  // Handle "yes" responses for chunking
  if (text === 'yes') {
    // Get last chunked task from context and add subtasks
    await ctx.reply('Adding those tasks for you... ✨');
    // Implementation would track conversation state
  }
  
  // Handle check-in responses
  if (['done', 'done!', '✅'].includes(text)) {
    await ctx.reply(
      '🎉 Awesome! Mark it with /done <task number>'
    );
  }
  
  if (['stuck', 'help', '😫'].includes(text)) {
    const help = await prompts.getUnstuckAdvice();
    await ctx.reply(help);
  }
});

// Start check-in scheduler
checkIn.start();

// Launch bot
bot.launch().then(() => {
  console.log('🧠 ADHD Planner AI is running!');
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
