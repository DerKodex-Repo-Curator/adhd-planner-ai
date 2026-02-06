import Database from 'better-sqlite3';
import { Task } from './tasks';

interface DopamineStats {
  points: number;
  streak: number;
  level: number;
  achievements: string[];
}

interface PointsResult {
  earned: number;
  total: number;
  bonusMessage?: string;
}

export class DopamineEngine {
  private db: Database.Database;

  constructor() {
    this.db = new Database('adhd-planner.db');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dopamine_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        points INTEGER NOT NULL,
        reason TEXT,
        earned_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        description TEXT,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS streaks (
        id INTEGER PRIMARY KEY,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_active_date DATE
      );
    `);

    // Initialize streak record if not exists
    this.db.prepare(`
      INSERT OR IGNORE INTO streaks (id, current_streak, longest_streak)
      VALUES (1, 0, 0)
    `).run();
  }

  awardPoints(task: Task): PointsResult {
    // Base points based on energy required
    let points = task.energyRequired * 10;
    let bonusMessage: string | undefined;

    // Time-based bonuses
    const hour = new Date().getHours();
    if (hour < 10) {
      points += 5;
      bonusMessage = "☀️ Early bird bonus! +5";
    }

    // Difficulty bonus
    if (task.energyRequired >= 4) {
      points += 15;
      bonusMessage = "💪 Hard task bonus! +15";
    }

    // Random dopamine hit (20% chance)
    if (Math.random() < 0.2) {
      const bonus = Math.floor(Math.random() * 20) + 5;
      points += bonus;
      bonusMessage = `🎰 Lucky bonus! +${bonus}`;
    }

    // Save points
    this.db.prepare(`
      INSERT INTO dopamine_points (points, reason)
      VALUES (?, ?)
    `).run(points, `Completed: ${task.title}`);

    // Update streak
    this.updateStreak();

    // Check achievements
    this.checkAchievements();

    const total = this.getTodayStats().points;

    return { earned: points, total, bonusMessage };
  }

  private updateStreak() {
    const streak = this.db.prepare('SELECT * FROM streaks WHERE id = 1').get() as any;
    const today = new Date().toISOString().split('T')[0];
    const lastActive = streak.last_active_date;

    if (lastActive === today) {
      // Already active today
      return;
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    let newStreak = 1;
    if (lastActive === yesterday) {
      // Continue streak
      newStreak = streak.current_streak + 1;
    }

    const longestStreak = Math.max(newStreak, streak.longest_streak);

    this.db.prepare(`
      UPDATE streaks 
      SET current_streak = ?, longest_streak = ?, last_active_date = ?
      WHERE id = 1
    `).run(newStreak, longestStreak, today);
  }

  private checkAchievements() {
    const stats = this.getTodayStats();
    const achievements: { name: string; description: string; condition: boolean }[] = [
      {
        name: "first_task",
        description: "Complete your first task",
        condition: stats.points > 0,
      },
      {
        name: "streak_3",
        description: "3 day streak!",
        condition: stats.streak >= 3,
      },
      {
        name: "streak_7",
        description: "One week streak!",
        condition: stats.streak >= 7,
      },
      {
        name: "points_100",
        description: "Earn 100 points in a day",
        condition: stats.points >= 100,
      },
    ];

    for (const achievement of achievements) {
      if (achievement.condition) {
        this.db.prepare(`
          INSERT OR IGNORE INTO achievements (name, description)
          VALUES (?, ?)
        `).run(achievement.name, achievement.description);
      }
    }
  }

  getTodayStats(): DopamineStats {
    const pointsResult = this.db.prepare(`
      SELECT COALESCE(SUM(points), 0) as total
      FROM dopamine_points
      WHERE DATE(earned_at) = DATE('now')
    `).get() as { total: number };

    const streak = this.db.prepare('SELECT * FROM streaks WHERE id = 1').get() as any;

    const achievements = this.db.prepare(`
      SELECT name FROM achievements
    `).all() as { name: string }[];

    const points = pointsResult.total;
    const level = Math.floor(points / 100) + 1;

    return {
      points,
      streak: streak.current_streak,
      level,
      achievements: achievements.map(a => a.name),
    };
  }
}
