/**
 * Apple Reminders Integration (macOS only)
 * 
 * Uses AppleScript via CLI to sync with native Reminders app.
 * This provides native iOS/macOS sync without needing cloud APIs.
 * 
 * Following OpenClaw's tool integration patterns:
 * - Graceful degradation if not on macOS
 * - Error handling with fallbacks
 * - Minimal dependencies
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { config } from './config.js';
import type { Task } from './tasks.js';

const execAsync = promisify(exec);

export interface ReminderItem {
  name: string;
  completed: boolean;
  dueDate?: string;
}

export class AppleRemindersSync {
  private listName: string;
  private enabled: boolean;
  private isMacOS: boolean;

  constructor() {
    this.listName = config.appleRemindersList;
    this.isMacOS = platform() === 'darwin';
    this.enabled = config.enableAppleReminders && this.isMacOS;

    if (config.enableAppleReminders && !this.isMacOS) {
      console.warn('⚠️ Apple Reminders sync enabled but not running on macOS');
    }
  }

  /**
   * Check if Apple Reminders integration is available
   */
  isAvailable(): boolean {
    return this.enabled;
  }

  /**
   * Initialize: ensure the list exists
   */
  async initialize(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      await this.ensureListExists();
      console.log(`✅ Apple Reminders: Connected to list "${this.listName}"`);
      return true;
    } catch (error) {
      console.error('❌ Apple Reminders initialization failed:', error);
      this.enabled = false;
      return false;
    }
  }

  /**
   * Add a task to Apple Reminders
   */
  async add(task: Task): Promise<boolean> {
    if (!this.enabled) return false;

    const body = task.description || `Energy: ${'🔋'.repeat(task.energyRequired)} | Added from ADHD Planner AI`;
    const dueDate = task.dueAt ? this.formatDate(task.dueAt) : '';

    const script = `
      tell application "Reminders"
        tell list "${this.escapeString(this.listName)}"
          set newReminder to make new reminder with properties {name:"${this.escapeString(task.title)}", body:"${this.escapeString(body)}"}
          ${dueDate ? `set due date of newReminder to date "${dueDate}"` : ''}
          return id of newReminder
        end tell
      end tell
    `;

    try {
      const { stdout } = await this.runAppleScript(script);
      console.log(`📱 Added to Apple Reminders: "${task.title}" (${stdout.trim()})`);
      return true;
    } catch (error) {
      console.error('Failed to add to Apple Reminders:', error);
      return false;
    }
  }

  /**
   * Mark a reminder as complete
   */
  async complete(task: Task): Promise<boolean> {
    if (!this.enabled) return false;

    const script = `
      tell application "Reminders"
        tell list "${this.escapeString(this.listName)}"
          set matchingReminders to (every reminder whose name is "${this.escapeString(task.title)}" and completed is false)
          repeat with r in matchingReminders
            set completed of r to true
          end repeat
          return count of matchingReminders
        end tell
      end tell
    `;

    try {
      const { stdout } = await this.runAppleScript(script);
      const count = parseInt(stdout.trim()) || 0;
      if (count > 0) {
        console.log(`✅ Marked complete in Apple Reminders: "${task.title}"`);
      }
      return count > 0;
    } catch (error) {
      console.error('Failed to complete in Apple Reminders:', error);
      return false;
    }
  }

  /**
   * Get all incomplete reminders from the list
   */
  async getAll(): Promise<ReminderItem[]> {
    if (!this.enabled) return [];

    const script = `
      tell application "Reminders"
        tell list "${this.escapeString(this.listName)}"
          set reminderList to {}
          repeat with r in (every reminder whose completed is false)
            set end of reminderList to {name of r, completed of r}
          end repeat
          return reminderList
        end tell
      end tell
    `;

    try {
      const { stdout } = await this.runAppleScript(script);
      return this.parseReminderList(stdout);
    } catch (error) {
      console.error('Failed to get Apple Reminders:', error);
      return [];
    }
  }

  /**
   * Sync: Import reminders from Apple Reminders that aren't in our DB
   */
  async getNewReminders(): Promise<string[]> {
    const reminders = await this.getAll();
    return reminders.map(r => r.name);
  }

  /**
   * Delete a reminder by name
   */
  async delete(taskTitle: string): Promise<boolean> {
    if (!this.enabled) return false;

    const script = `
      tell application "Reminders"
        tell list "${this.escapeString(this.listName)}"
          set matchingReminders to (every reminder whose name is "${this.escapeString(taskTitle)}")
          repeat with r in matchingReminders
            delete r
          end repeat
          return count of matchingReminders
        end tell
      end tell
    `;

    try {
      await this.runAppleScript(script);
      return true;
    } catch (error) {
      console.error('Failed to delete from Apple Reminders:', error);
      return false;
    }
  }

  /**
   * Ensure our list exists in Reminders app
   */
  private async ensureListExists(): Promise<void> {
    const script = `
      tell application "Reminders"
        if not (exists list "${this.escapeString(this.listName)}") then
          make new list with properties {name:"${this.escapeString(this.listName)}"}
        end if
        return name of list "${this.escapeString(this.listName)}"
      end tell
    `;

    await this.runAppleScript(script);
  }

  /**
   * Run AppleScript and return output
   */
  private async runAppleScript(script: string): Promise<{ stdout: string; stderr: string }> {
    // Escape the script for shell
    const escapedScript = script.replace(/'/g, "'\"'\"'");
    return execAsync(`osascript -e '${escapedScript}'`, { timeout: 10000 });
  }

  /**
   * Escape string for AppleScript
   */
  private escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  /**
   * Format date for AppleScript
   */
  private formatDate(date: Date): string {
    // AppleScript expects dates in a specific format
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  /**
   * Parse AppleScript list output
   */
  private parseReminderList(output: string): ReminderItem[] {
    // AppleScript returns lists like: {{name1, false}, {name2, true}}
    try {
      const cleaned = output.trim();
      if (!cleaned || cleaned === '{}') return [];

      // Simple parsing for {{name, completed}, ...}
      const items: ReminderItem[] = [];
      const matches = cleaned.matchAll(/\{([^{}]+)\}/g);

      for (const match of matches) {
        const parts = match[1].split(',').map(s => s.trim());
        if (parts.length >= 2) {
          items.push({
            name: parts[0].replace(/^"|"$/g, ''),
            completed: parts[1] === 'true',
          });
        }
      }

      return items;
    } catch {
      return [];
    }
  }
}
