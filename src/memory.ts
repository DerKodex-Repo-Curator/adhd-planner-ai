/**
 * Memory Manager - Context Persistence Across Sessions
 * 
 * Following OpenClaw patterns (MEMORY.md, daily notes):
 * - Conversation context that survives restarts
 * - User preferences and patterns
 * - Session state (current task, focus mode, etc.)
 * 
 * This is your agent's "long-term memory"
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getMemoryPath } from './config.js';

export interface ConversationContext {
  lastTaskId?: number;
  lastTaskTitle?: string;
  lastAction?: 'add' | 'complete' | 'chunk' | 'focus' | 'break';
  lastActionTime?: string;
  awaitingChunkConfirmation?: boolean;
  pendingChunks?: { title: string; time: string }[];
}

export interface UserPreferences {
  preferredCheckInStyle: 'gentle' | 'direct' | 'minimal';
  averageEnergyLevel: number;
  bestProductiveHours: number[];
  completedOnboarding: boolean;
}

export interface FocusState {
  active: boolean;
  startedAt?: string;
  durationMinutes?: number;
  pomodorosCompleted: number;
  currentTaskId?: number;
}

export interface EnergyLog {
  timestamp: string;
  level: number; // 1-5
}

export interface DailyStats {
  date: string;
  tasksCompleted: number;
  pointsEarned: number;
  focusMinutes: number;
  averageEnergy: number;
}

export interface Memory {
  // Conversation context (short-term)
  context: ConversationContext;

  // User preferences (long-term)
  preferences: UserPreferences;

  // Focus/break state
  focus: FocusState;

  // Energy tracking (recent history)
  energyLogs: EnergyLog[];

  // Daily stats history
  dailyStats: DailyStats[];

  // Streak tracking
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: string;

  // Custom notes (like OpenClaw's memory files)
  notes: Record<string, string>;
}

const DEFAULT_MEMORY: Memory = {
  context: {},
  preferences: {
    preferredCheckInStyle: 'gentle',
    averageEnergyLevel: 3,
    bestProductiveHours: [10, 11, 14, 15],
    completedOnboarding: false,
  },
  focus: {
    active: false,
    pomodorosCompleted: 0,
  },
  energyLogs: [],
  dailyStats: [],
  currentStreak: 0,
  longestStreak: 0,
  notes: {},
};

export class MemoryManager {
  private memory: Memory;
  private filePath: string;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.filePath = getMemoryPath();
    this.memory = this.load();
  }

  /**
   * Load memory from disk
   */
  private load(): Memory {
    if (!existsSync(this.filePath)) {
      console.log('📝 Creating new memory file');
      this.save(DEFAULT_MEMORY);
      return { ...DEFAULT_MEMORY };
    }

    try {
      const data = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      // Merge with defaults for forward compatibility
      return { ...DEFAULT_MEMORY, ...parsed };
    } catch (error) {
      console.error('⚠️ Error loading memory, starting fresh:', error);
      return { ...DEFAULT_MEMORY };
    }
  }

  /**
   * Save memory to disk (debounced)
   */
  private save(memory?: Memory): void {
    const data = memory || this.memory;

    // Debounce saves to avoid excessive disk writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      try {
        writeFileSync(this.filePath, JSON.stringify(data, null, 2));
      } catch (error) {
        console.error('⚠️ Error saving memory:', error);
      }
    }, 100);
  }

  /**
   * Force immediate save
   */
  flush(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    writeFileSync(this.filePath, JSON.stringify(this.memory, null, 2));
  }

  // ============================================
  // Conversation Context
  // ============================================

  getContext(): ConversationContext {
    return this.memory.context;
  }

  updateContext(updates: Partial<ConversationContext>): void {
    this.memory.context = { ...this.memory.context, ...updates };
    this.save();
  }

  clearContext(): void {
    this.memory.context = {};
    this.save();
  }

  /**
   * Set pending chunks for confirmation
   */
  setPendingChunks(chunks: { title: string; time: string }[]): void {
    this.memory.context.awaitingChunkConfirmation = true;
    this.memory.context.pendingChunks = chunks;
    this.save();
  }

  /**
   * Get and clear pending chunks
   */
  consumePendingChunks(): { title: string; time: string }[] | null {
    if (!this.memory.context.awaitingChunkConfirmation) {
      return null;
    }

    const chunks = this.memory.context.pendingChunks || [];
    this.memory.context.awaitingChunkConfirmation = false;
    this.memory.context.pendingChunks = undefined;
    this.save();
    return chunks;
  }

  // ============================================
  // User Preferences
  // ============================================

  getPreferences(): UserPreferences {
    return this.memory.preferences;
  }

  updatePreferences(updates: Partial<UserPreferences>): void {
    this.memory.preferences = { ...this.memory.preferences, ...updates };
    this.save();
  }

  // ============================================
  // Focus State
  // ============================================

  getFocusState(): FocusState {
    return this.memory.focus;
  }

  startFocus(durationMinutes: number, taskId?: number): void {
    this.memory.focus = {
      active: true,
      startedAt: new Date().toISOString(),
      durationMinutes,
      pomodorosCompleted: this.memory.focus.pomodorosCompleted,
      currentTaskId: taskId,
    };
    this.save();
  }

  endFocus(completed: boolean): void {
    if (completed) {
      this.memory.focus.pomodorosCompleted++;
    }
    this.memory.focus.active = false;
    this.memory.focus.startedAt = undefined;
    this.memory.focus.durationMinutes = undefined;
    this.memory.focus.currentTaskId = undefined;
    this.save();
  }

  // ============================================
  // Energy Tracking
  // ============================================

  logEnergy(level: number): void {
    this.memory.energyLogs.push({
      timestamp: new Date().toISOString(),
      level: Math.min(5, Math.max(1, level)),
    });

    // Keep only last 100 entries
    if (this.memory.energyLogs.length > 100) {
      this.memory.energyLogs = this.memory.energyLogs.slice(-100);
    }

    // Update average
    const recent = this.memory.energyLogs.slice(-20);
    const avg = recent.reduce((sum, log) => sum + log.level, 0) / recent.length;
    this.memory.preferences.averageEnergyLevel = Math.round(avg * 10) / 10;

    this.save();
  }

  getRecentEnergy(): EnergyLog[] {
    return this.memory.energyLogs.slice(-10);
  }

  // ============================================
  // Streak Tracking
  // ============================================

  recordActivity(): void {
    const today = new Date().toISOString().split('T')[0];

    if (this.memory.lastActiveDate === today) {
      // Already active today
      return;
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (this.memory.lastActiveDate === yesterday) {
      // Continue streak
      this.memory.currentStreak++;
    } else {
      // Break streak (unless first day)
      this.memory.currentStreak = this.memory.lastActiveDate ? 1 : 1;
    }

    // Update longest
    if (this.memory.currentStreak > this.memory.longestStreak) {
      this.memory.longestStreak = this.memory.currentStreak;
    }

    this.memory.lastActiveDate = today;
    this.save();
  }

  getStreak(): { current: number; longest: number } {
    return {
      current: this.memory.currentStreak,
      longest: this.memory.longestStreak,
    };
  }

  // ============================================
  // Daily Stats
  // ============================================

  recordDailyStats(stats: Omit<DailyStats, 'date'>): void {
    const today = new Date().toISOString().split('T')[0];

    // Update or add today's stats
    const existingIndex = this.memory.dailyStats.findIndex(s => s.date === today);
    if (existingIndex >= 0) {
      this.memory.dailyStats[existingIndex] = { date: today, ...stats };
    } else {
      this.memory.dailyStats.push({ date: today, ...stats });
    }

    // Keep only last 30 days
    if (this.memory.dailyStats.length > 30) {
      this.memory.dailyStats = this.memory.dailyStats.slice(-30);
    }

    this.save();
  }

  getDailyStats(days: number = 7): DailyStats[] {
    return this.memory.dailyStats.slice(-days);
  }

  // ============================================
  // Notes
  // ============================================

  setNote(key: string, value: string): void {
    this.memory.notes[key] = value;
    this.save();
  }

  getNote(key: string): string | undefined {
    return this.memory.notes[key];
  }

  deleteNote(key: string): void {
    delete this.memory.notes[key];
    this.save();
  }

  // ============================================
  // Export/Import
  // ============================================

  export(): Memory {
    return { ...this.memory };
  }

  import(data: Memory): void {
    this.memory = { ...DEFAULT_MEMORY, ...data };
    this.save();
  }
}
