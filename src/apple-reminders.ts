import { exec } from 'child_process';
import { promisify } from 'util';
import { Task } from './tasks';

const execAsync = promisify(exec);

/**
 * Apple Reminders Sync (macOS only)
 * Uses AppleScript to interact with the Reminders app
 */
export class AppleRemindersSync {
  private listName: string;
  private enabled: boolean;

  constructor(listName: string = 'ADHD Planner') {
    this.listName = listName;
    this.enabled = process.env.ENABLE_APPLE_REMINDERS === 'true';
  }

  async add(task: Task): Promise<boolean> {
    if (!this.enabled) return false;

    const script = `
      tell application "Reminders"
        tell list "${this.listName}"
          make new reminder with properties {name:"${this.escapeString(task.title)}", body:"Added from ADHD Planner AI"}
        end tell
      end tell
    `;

    try {
      await this.runAppleScript(script);
      return true;
    } catch (error) {
      console.error('Failed to add to Apple Reminders:', error);
      return false;
    }
  }

  async complete(task: Task): Promise<boolean> {
    if (!this.enabled) return false;

    const script = `
      tell application "Reminders"
        tell list "${this.listName}"
          set matchingReminders to (every reminder whose name is "${this.escapeString(task.title)}")
          repeat with r in matchingReminders
            set completed of r to true
          end repeat
        end tell
      end tell
    `;

    try {
      await this.runAppleScript(script);
      return true;
    } catch (error) {
      console.error('Failed to complete in Apple Reminders:', error);
      return false;
    }
  }

  async getAll(): Promise<string[]> {
    if (!this.enabled) return [];

    const script = `
      tell application "Reminders"
        tell list "${this.listName}"
          get name of every reminder whose completed is false
        end tell
      end tell
    `;

    try {
      const { stdout } = await this.runAppleScript(script);
      // Parse AppleScript list output
      return stdout
        .replace(/^\{|\}$/g, '')
        .split(',')
        .map(s => s.trim().replace(/^"|"$/g, ''))
        .filter(s => s.length > 0);
    } catch (error) {
      console.error('Failed to get Apple Reminders:', error);
      return [];
    }
  }

  async ensureListExists(): Promise<void> {
    if (!this.enabled) return;

    const script = `
      tell application "Reminders"
        if not (exists list "${this.listName}") then
          make new list with properties {name:"${this.listName}"}
        end if
      end tell
    `;

    try {
      await this.runAppleScript(script);
    } catch (error) {
      console.error('Failed to create Apple Reminders list:', error);
    }
  }

  private async runAppleScript(script: string): Promise<{ stdout: string; stderr: string }> {
    return execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  }

  private escapeString(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  }
}
