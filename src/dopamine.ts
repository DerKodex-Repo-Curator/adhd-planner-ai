/**
 * Dopamine Engine - Gamification & Rewards
 * 
 * ADHD brains need dopamine hits! This module provides:
 * - Points for completing tasks (scaled by difficulty)
 * - Random bonuses (unpredictable = more dopamine)
 * - Streak tracking
 * - Achievements
 * - Time-based bonuses (early bird, night owl, etc.)
 */

import Database from 'better-sqlite3';
import { getDatabasePath, config } from './config.js';
import type { Task } from './tasks.js';

export interface PointsResult {
  earned: number;
  total: number;
  bonuses: Bonus[];
  newAchievements: Achievement[];
}

export interface Bonus {
  type: 'difficulty' | 'early_bird' | 'night_owl' | 'streak' | 'random' | 'first_task' | 'combo';
  points: number;
  message: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  unlockedAt: Date;
}

export interface DopamineStats {
  todayPoints: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  level: number;
  levelProgress: number; // 0-100
  achievements: Achievement[];
  tasksCompletedToday: number;
}

// Points needed per level (exponential growth)
const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500, 10000];

// Achievement definitions
const ACHIEVEMENTS_DEF: Record<string, { name: string; description: string; emoji: string }> = {
  first_task: { name: 'First Steps', description: 'Complete your first task', emoji: '🎯' },
  streak_3: { name: 'On a Roll', description: '3 day streak', emoji: '🔥' },
  streak_7: { name: 'Unstoppable', description: '7 day streak', emoji: '💪' },
  streak_30: { name: 'Legendary', description: '30 day streak', emoji: '👑' },
  points_100: { name: 'Century Club', description: 'Earn 100 points in a day', emoji: '💯' },
  points_500: { name: 'High Scorer', description: 'Earn 500 points in a day', emoji: '🏆' },
  level_5: { name: 'Rising Star', description: 'Reach level 5', emoji: '⭐' },
  level_10: { name: 'Expert Mode', description: 'Reach level 10', emoji: '🌟' },
  early_bird: { name: 'Early Bird', description: 'Complete 5 tasks before 9 AM', emoji: '🌅' },
  night_owl: { name: 'Night Owl', description: 'Complete 5 tasks after 9 PM', emoji: '🦉' },
  chunker: { name: 'Task Breaker', description: 'Break down 10 big tasks', emoji: '🔨' },
  hard_worker: { name: 'Challenge Accepted', description: 'Complete 10 high-energy tasks', emoji: '💎' },
};

export class DopamineEngine {
  private db: Database.Database;

  constructor() {
    this.db = new Database(getDatabasePath());
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS points_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        points INTEGER NOT NULL,
        reason TEXT NOT NULL,
        task_id INTEGER,
        earned_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        emoji TEXT,
        unlocked_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS streaks (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_active_date TEXT,
        early_bird_count INTEGER DEFAULT 0,
        night_owl_count INTEGER DEFAULT 0,
        hard_tasks_count INTEGER DEFAULT 0,
        chunks_created INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_points_earned_at ON points_log(earned_at);
    `);

    // Ensure streaks row exists
    this.db.prepare(`
      INSERT OR IGNORE INTO streaks (id, current_streak, longest_streak)
      VALUES (1, 0, 0)
    `).run();
  }

  /**
   * Award points for completing a task
   */
  awardPoints(task: Task): PointsResult {
    const bonuses: Bonus[] = [];
    let totalEarned = 0;

    // Base points (scaled by energy/difficulty)
    const basePoints = task.energyRequired * config.basePointsPerTask;
    totalEarned += basePoints;

    // Time-based bonuses
    const hour = new Date().getHours();

    if (hour < 9) {
      const earlyBirdBonus = 10;
      totalEarned += earlyBirdBonus;
      bonuses.push({
        type: 'early_bird',
        points: earlyBirdBonus,
        message: '☀️ Early bird bonus!',
      });
      this.incrementCounter('early_bird_count');
    }

    if (hour >= 21) {
      const nightOwlBonus = 5;
      totalEarned += nightOwlBonus;
      bonuses.push({
        type: 'night_owl',
        points: nightOwlBonus,
        message: '🦉 Night owl bonus!',
      });
      this.incrementCounter('night_owl_count');
    }

    // Difficulty bonus
    if (task.energyRequired >= 4) {
      const difficultyBonus = 15;
      totalEarned += difficultyBonus;
      bonuses.push({
        type: 'difficulty',
        points: difficultyBonus,
        message: '💪 Hard task bonus!',
      });
      this.incrementCounter('hard_tasks_count');
    }

    // Streak bonus
    const streak = this.getStreak();
    if (streak.current >= 3) {
      const streakBonus = Math.min(streak.current * 2, 20);
      totalEarned += streakBonus;
      bonuses.push({
        type: 'streak',
        points: streakBonus,
        message: `🔥 ${streak.current}-day streak bonus!`,
      });
    }

    // Check for combo (multiple tasks in short time)
    const recentTasks = this.db.prepare(`
      SELECT COUNT(*) as count FROM points_log
      WHERE earned_at >= datetime('now', '-30 minutes')
    `).get() as { count: number };

    if (recentTasks.count >= 2) {
      const comboBonus = 5 * recentTasks.count;
      totalEarned += comboBonus;
      bonuses.push({
        type: 'combo',
        points: comboBonus,
        message: `⚡ ${recentTasks.count + 1}x combo!`,
      });
    }

    // Random dopamine hit (unpredictability = more dopamine!)
    if (Math.random() < config.randomBonusChance) {
      const randomBonus = Math.floor(Math.random() * config.maxRandomBonus) + 5;
      totalEarned += randomBonus;
      bonuses.push({
        type: 'random',
        points: randomBonus,
        message: '🎰 Lucky bonus!',
      });
    }

    // Save points
    this.db.prepare(`
      INSERT INTO points_log (points, reason, task_id)
      VALUES (?, ?, ?)
    `).run(totalEarned, `Completed: ${task.title}`, task.id);

    // Update streak
    this.updateStreak();

    // Check achievements
    const newAchievements = this.checkAchievements();

    // Get new total
    const stats = this.getStats();

    return {
      earned: totalEarned,
      total: stats.todayPoints,
      bonuses,
      newAchievements,
    };
  }

  /**
   * Update streak tracking
   */
  private updateStreak(): void {
    const streak = this.db.prepare('SELECT * FROM streaks WHERE id = 1').get() as any;
    const today = new Date().toISOString().split('T')[0];

    if (streak.last_active_date === today) {
      return; // Already active today
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let newStreak = 1;
    if (streak.last_active_date === yesterday) {
      newStreak = streak.current_streak + 1;
    }

    const longestStreak = Math.max(newStreak, streak.longest_streak);

    this.db.prepare(`
      UPDATE streaks 
      SET current_streak = ?, longest_streak = ?, last_active_date = ?
      WHERE id = 1
    `).run(newStreak, longestStreak, today);
  }

  /**
   * Check and unlock achievements
   */
  private checkAchievements(): Achievement[] {
    const newAchievements: Achievement[] = [];
    const stats = this.getStats();
    const streak = this.getStreak();
    const counters = this.getCounters();

    const checks: { id: string; condition: boolean }[] = [
      { id: 'first_task', condition: stats.totalPoints > 0 },
      { id: 'streak_3', condition: streak.current >= 3 },
      { id: 'streak_7', condition: streak.current >= 7 },
      { id: 'streak_30', condition: streak.current >= 30 },
      { id: 'points_100', condition: stats.todayPoints >= 100 },
      { id: 'points_500', condition: stats.todayPoints >= 500 },
      { id: 'level_5', condition: stats.level >= 5 },
      { id: 'level_10', condition: stats.level >= 10 },
      { id: 'early_bird', condition: counters.earlyBirdCount >= 5 },
      { id: 'night_owl', condition: counters.nightOwlCount >= 5 },
      { id: 'chunker', condition: counters.chunksCreated >= 10 },
      { id: 'hard_worker', condition: counters.hardTasksCount >= 10 },
    ];

    for (const { id, condition } of checks) {
      if (condition && !this.hasAchievement(id)) {
        const def = ACHIEVEMENTS_DEF[id];
        this.db.prepare(`
          INSERT INTO achievements (id, name, description, emoji)
          VALUES (?, ?, ?, ?)
        `).run(id, def.name, def.description, def.emoji);

        newAchievements.push({
          id,
          ...def,
          unlockedAt: new Date(),
        });
      }
    }

    return newAchievements;
  }

  /**
   * Check if an achievement is already unlocked
   */
  private hasAchievement(id: string): boolean {
    const result = this.db.prepare('SELECT 1 FROM achievements WHERE id = ?').get(id);
    return !!result;
  }

  /**
   * Increment a counter for achievement tracking
   */
  private incrementCounter(counter: string): void {
    this.db.prepare(`UPDATE streaks SET ${counter} = ${counter} + 1 WHERE id = 1`).run();
  }

  /**
   * Record that chunks were created
   */
  recordChunksCreated(count: number): void {
    this.db.prepare(`
      UPDATE streaks SET chunks_created = chunks_created + ? WHERE id = 1
    `).run(count);
  }

  /**
   * Get counter values
   */
  private getCounters(): {
    earlyBirdCount: number;
    nightOwlCount: number;
    hardTasksCount: number;
    chunksCreated: number;
  } {
    const row = this.db.prepare(`
      SELECT early_bird_count, night_owl_count, hard_tasks_count, chunks_created
      FROM streaks WHERE id = 1
    `).get() as any;

    return {
      earlyBirdCount: row.early_bird_count,
      nightOwlCount: row.night_owl_count,
      hardTasksCount: row.hard_tasks_count,
      chunksCreated: row.chunks_created,
    };
  }

  /**
   * Get streak info
   */
  getStreak(): { current: number; longest: number } {
    const row = this.db.prepare(`
      SELECT current_streak, longest_streak FROM streaks WHERE id = 1
    `).get() as any;

    return {
      current: row.current_streak,
      longest: row.longest_streak,
    };
  }

  /**
   * Get complete stats
   */
  getStats(): DopamineStats {
    // Today's points
    const todayResult = this.db.prepare(`
      SELECT COALESCE(SUM(points), 0) as total
      FROM points_log
      WHERE DATE(earned_at) = DATE('now')
    `).get() as { total: number };

    // Total points
    const totalResult = this.db.prepare(`
      SELECT COALESCE(SUM(points), 0) as total FROM points_log
    `).get() as { total: number };

    // Tasks completed today
    const tasksResult = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM points_log
      WHERE DATE(earned_at) = DATE('now') AND task_id IS NOT NULL
    `).get() as { count: number };

    // Streak
    const streak = this.getStreak();

    // Level calculation
    const totalPoints = totalResult.total;
    let level = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (totalPoints >= LEVEL_THRESHOLDS[i]) {
        level = i + 1;
        break;
      }
    }

    // Progress to next level
    const currentThreshold = LEVEL_THRESHOLDS[level - 1] || 0;
    const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const levelProgress = Math.round(
      ((totalPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    );

    // Achievements
    const achievements = this.db.prepare(`
      SELECT * FROM achievements ORDER BY unlocked_at DESC
    `).all() as any[];

    return {
      todayPoints: todayResult.total,
      totalPoints,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      level,
      levelProgress: Math.min(100, Math.max(0, levelProgress)),
      achievements: achievements.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        emoji: a.emoji,
        unlockedAt: new Date(a.unlocked_at),
      })),
      tasksCompletedToday: tasksResult.count,
    };
  }

  /**
   * Get a motivational message based on stats
   */
  getMotivation(): string {
    const stats = this.getStats();
    const messages: string[] = [];

    if (stats.currentStreak >= 7) {
      messages.push(`🔥 ${stats.currentStreak} days strong! You're on fire!`);
    } else if (stats.currentStreak >= 3) {
      messages.push(`🔥 ${stats.currentStreak} day streak! Keep it up!`);
    }

    if (stats.tasksCompletedToday >= 5) {
      messages.push(`🎯 ${stats.tasksCompletedToday} tasks today! You're crushing it!`);
    } else if (stats.tasksCompletedToday >= 3) {
      messages.push(`💪 Already ${stats.tasksCompletedToday} tasks done today!`);
    }

    if (stats.levelProgress >= 80) {
      messages.push(`⭐ Almost level ${stats.level + 1}! Just ${100 - stats.levelProgress}% to go!`);
    }

    if (messages.length === 0) {
      const defaults = [
        "You've got this! 💜",
        'Every task completed is a win!',
        'Small steps, big progress!',
        'Your future self will thank you!',
      ];
      return defaults[Math.floor(Math.random() * defaults.length)];
    }

    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
