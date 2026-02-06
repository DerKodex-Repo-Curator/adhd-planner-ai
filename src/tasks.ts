import Database from 'better-sqlite3';

export interface Task {
  id: number;
  title: string;
  completed: boolean;
  energyRequired: number;
  estimatedMinutes: number;
  createdAt: Date;
  completedAt?: Date;
  parentId?: number;
}

export class TaskManager {
  private db: Database.Database;

  constructor() {
    this.db = new Database('adhd-planner.db');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        energy_required INTEGER DEFAULT 2,
        estimated_minutes INTEGER DEFAULT 15,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        parent_id INTEGER,
        FOREIGN KEY (parent_id) REFERENCES tasks(id)
      )
    `);
  }

  async create(title: string, energyRequired: number = 2, estimatedMinutes: number = 15): Promise<Task> {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (title, energy_required, estimated_minutes)
      VALUES (?, ?, ?)
    `);
    
    const result = stmt.run(title, energyRequired, estimatedMinutes);
    
    return {
      id: result.lastInsertRowid as number,
      title,
      completed: false,
      energyRequired,
      estimatedMinutes,
      createdAt: new Date(),
    };
  }

  async createSubtask(parentId: number, title: string, estimatedMinutes: number = 5): Promise<Task> {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (title, energy_required, estimated_minutes, parent_id)
      VALUES (?, 1, ?, ?)
    `);
    
    const result = stmt.run(title, estimatedMinutes, parentId);
    
    return {
      id: result.lastInsertRowid as number,
      title,
      completed: false,
      energyRequired: 1,
      estimatedMinutes,
      createdAt: new Date(),
      parentId,
    };
  }

  async complete(id: number): Promise<Task | null> {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    
    if (!task) return null;
    
    this.db.prepare(`
      UPDATE tasks SET completed = TRUE, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    return {
      id: task.id,
      title: task.title,
      completed: true,
      energyRequired: task.energy_required,
      estimatedMinutes: task.estimated_minutes,
      createdAt: new Date(task.created_at),
      completedAt: new Date(),
    };
  }

  async getToday(): Promise<Task[]> {
    const tasks = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE DATE(created_at) = DATE('now')
      ORDER BY completed ASC, created_at ASC
    `).all() as any[];

    return tasks.map(this.mapTask);
  }

  async getPending(): Promise<Task[]> {
    const tasks = this.db.prepare(`
      SELECT * FROM tasks 
      WHERE completed = FALSE
      ORDER BY energy_required DESC, created_at ASC
    `).all() as any[];

    return tasks.map(this.mapTask);
  }

  async getById(id: number): Promise<Task | null> {
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return task ? this.mapTask(task) : null;
  }

  private mapTask(row: any): Task {
    return {
      id: row.id,
      title: row.title,
      completed: !!row.completed,
      energyRequired: row.energy_required,
      estimatedMinutes: row.estimated_minutes,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      parentId: row.parent_id,
    };
  }
}
