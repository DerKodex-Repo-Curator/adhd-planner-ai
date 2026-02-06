/**
 * Task Management with SQLite persistence
 * 
 * ADHD-friendly features:
 * - Energy level tracking
 * - Time estimates (visual, not scary)
 * - Parent/child relationships for chunked tasks
 * - Soft deletes (because ADHD brains need recovery options)
 */

import Database from 'better-sqlite3';
import { getDatabasePath } from './config.js';

export interface Task {
  id: number;
  title: string;
  description?: string;
  completed: boolean;
  energyRequired: number; // 1-5 scale
  estimatedMinutes: number;
  actualMinutes?: number;
  createdAt: Date;
  completedAt?: Date;
  dueAt?: Date;
  parentId?: number;
  position: number; // For ordering
  tags: string[];
  deleted: boolean;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  energyRequired?: number;
  estimatedMinutes?: number;
  dueAt?: Date;
  parentId?: number;
  tags?: string[];
}

export interface TaskStats {
  totalToday: number;
  completedToday: number;
  totalPending: number;
  averageCompletionTime: number;
  mostProductiveHour?: number;
}

export class TaskManager {
  private db: Database.Database;

  constructor() {
    this.db = new Database(getDatabasePath());
    this.db.pragma('journal_mode = WAL'); // Better concurrent access
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER DEFAULT 0,
        energy_required INTEGER DEFAULT 2,
        estimated_minutes INTEGER DEFAULT 15,
        actual_minutes INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        due_at TEXT,
        parent_id INTEGER,
        position INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        deleted INTEGER DEFAULT 0,
        FOREIGN KEY (parent_id) REFERENCES tasks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_deleted ON tasks(deleted);
    `);
  }

  /**
   * Create a new task
   */
  create(input: CreateTaskInput): Task {
    const {
      title,
      description,
      energyRequired = 2,
      estimatedMinutes = 15,
      dueAt,
      parentId,
      tags = [],
    } = input;

    // Get next position
    const posResult = this.db.prepare(`
      SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM tasks WHERE deleted = 0
    `).get() as { next_pos: number };

    const stmt = this.db.prepare(`
      INSERT INTO tasks (title, description, energy_required, estimated_minutes, due_at, parent_id, position, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      title,
      description || null,
      energyRequired,
      estimatedMinutes,
      dueAt?.toISOString() || null,
      parentId || null,
      posResult.next_pos,
      JSON.stringify(tags)
    );

    return {
      id: result.lastInsertRowid as number,
      title,
      description,
      completed: false,
      energyRequired,
      estimatedMinutes,
      createdAt: new Date(),
      dueAt,
      parentId,
      position: posResult.next_pos,
      tags,
      deleted: false,
    };
  }

  /**
   * Create multiple subtasks for chunking
   */
  createSubtasks(parentId: number, chunks: { title: string; estimatedMinutes: number }[]): Task[] {
    const tasks: Task[] = [];

    for (const chunk of chunks) {
      const task = this.create({
        title: chunk.title,
        estimatedMinutes: chunk.estimatedMinutes,
        energyRequired: 1, // Subtasks are low energy by design
        parentId,
      });
      tasks.push(task);
    }

    return tasks;
  }

  /**
   * Mark a task as complete
   */
  complete(id: number): Task | null {
    const task = this.getById(id);
    if (!task) return null;

    const now = new Date();
    const actualMinutes = Math.round(
      (now.getTime() - task.createdAt.getTime()) / 1000 / 60
    );

    this.db.prepare(`
      UPDATE tasks 
      SET completed = 1, completed_at = ?, actual_minutes = ?
      WHERE id = ?
    `).run(now.toISOString(), actualMinutes, id);

    return {
      ...task,
      completed: true,
      completedAt: now,
      actualMinutes,
    };
  }

  /**
   * Uncomplete a task (ADHD-friendly: accidents happen!)
   */
  uncomplete(id: number): Task | null {
    const task = this.getById(id);
    if (!task) return null;

    this.db.prepare(`
      UPDATE tasks SET completed = 0, completed_at = NULL, actual_minutes = NULL WHERE id = ?
    `).run(id);

    return {
      ...task,
      completed: false,
      completedAt: undefined,
      actualMinutes: undefined,
    };
  }

  /**
   * Soft delete a task
   */
  delete(id: number): boolean {
    const result = this.db.prepare(`
      UPDATE tasks SET deleted = 1 WHERE id = ?
    `).run(id);
    return result.changes > 0;
  }

  /**
   * Restore a soft-deleted task
   */
  restore(id: number): boolean {
    const result = this.db.prepare(`
      UPDATE tasks SET deleted = 0 WHERE id = ?
    `).run(id);
    return result.changes > 0;
  }

  /**
   * Get a task by ID
   */
  getById(id: number): Task | null {
    const row = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ? AND deleted = 0
    `).get(id) as any;

    return row ? this.mapTask(row) : null;
  }

  /**
   * Get today's tasks
   */
  getToday(): Task[] {
    const rows = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE DATE(created_at) = DATE('now') AND deleted = 0
      ORDER BY completed ASC, position ASC
    `).all() as any[];

    return rows.map(this.mapTask);
  }

  /**
   * Get all pending tasks
   */
  getPending(): Task[] {
    const rows = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE completed = 0 AND deleted = 0
      ORDER BY energy_required DESC, position ASC
    `).all() as any[];

    return rows.map(this.mapTask);
  }

  /**
   * Get pending tasks filtered by energy level
   */
  getByEnergy(maxEnergy: number): Task[] {
    const rows = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE completed = 0 AND deleted = 0 AND energy_required <= ?
      ORDER BY energy_required DESC, position ASC
    `).all(maxEnergy) as any[];

    return rows.map(this.mapTask);
  }

  /**
   * Get subtasks of a parent task
   */
  getSubtasks(parentId: number): Task[] {
    const rows = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE parent_id = ? AND deleted = 0
      ORDER BY position ASC
    `).all(parentId) as any[];

    return rows.map(this.mapTask);
  }

  /**
   * Get completed tasks from the last N days
   */
  getCompleted(days: number = 7): Task[] {
    const rows = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE completed = 1 AND deleted = 0
        AND DATE(completed_at) >= DATE('now', '-' || ? || ' days')
      ORDER BY completed_at DESC
    `).all(days) as any[];

    return rows.map(this.mapTask);
  }

  /**
   * Get task statistics
   */
  getStats(): TaskStats {
    const today = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
      FROM tasks 
      WHERE DATE(created_at) = DATE('now') AND deleted = 0
    `).get() as { total: number; completed: number };

    const pending = this.db.prepare(`
      SELECT COUNT(*) as count FROM tasks WHERE completed = 0 AND deleted = 0
    `).get() as { count: number };

    const avgTime = this.db.prepare(`
      SELECT AVG(actual_minutes) as avg FROM tasks WHERE completed = 1 AND actual_minutes IS NOT NULL
    `).get() as { avg: number | null };

    const productiveHour = this.db.prepare(`
      SELECT CAST(strftime('%H', completed_at) AS INTEGER) as hour, COUNT(*) as count
      FROM tasks
      WHERE completed = 1 AND completed_at IS NOT NULL
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `).get() as { hour: number; count: number } | undefined;

    return {
      totalToday: today.total,
      completedToday: today.completed,
      totalPending: pending.count,
      averageCompletionTime: avgTime.avg || 0,
      mostProductiveHour: productiveHour?.hour,
    };
  }

  /**
   * Update task position (for reordering)
   */
  updatePosition(id: number, newPosition: number): void {
    this.db.prepare(`
      UPDATE tasks SET position = ? WHERE id = ?
    `).run(newPosition, id);
  }

  /**
   * Update task energy requirement
   */
  updateEnergy(id: number, energy: number): void {
    this.db.prepare(`
      UPDATE tasks SET energy_required = ? WHERE id = ?
    `).run(Math.min(5, Math.max(1, energy)), id);
  }

  /**
   * Map database row to Task object
   */
  private mapTask(row: any): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description || undefined,
      completed: Boolean(row.completed),
      energyRequired: row.energy_required,
      estimatedMinutes: row.estimated_minutes,
      actualMinutes: row.actual_minutes || undefined,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      dueAt: row.due_at ? new Date(row.due_at) : undefined,
      parentId: row.parent_id || undefined,
      position: row.position,
      tags: JSON.parse(row.tags || '[]'),
      deleted: Boolean(row.deleted),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
