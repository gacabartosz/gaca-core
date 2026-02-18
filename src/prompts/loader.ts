// Prompt Loader - Load and manage prompt templates

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get prompts directory - relative to project root
const getPromptsDir = (): string => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // Try to find the prompts directory relative to cwd or dist
  const possiblePaths = [
    path.join(process.cwd(), 'src', 'prompts'),
    path.join(process.cwd(), 'dist', 'prompts'),
    currentDir,
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Default to cwd/src/prompts
  return path.join(process.cwd(), 'src', 'prompts');
};

const promptsDir = getPromptsDir();

// Validate prompt name to prevent path traversal
const SAFE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
function validatePromptName(name: string): void {
  if (!SAFE_NAME_REGEX.test(name)) {
    throw new Error(`Invalid prompt name: "${name}". Only alphanumeric characters, hyphens, and underscores are allowed.`);
  }
}

// Cache for loaded prompts
const promptCache: Map<string, string> = new Map();

// Default prompt names
export type DefaultPromptName = 'system' | 'analysis' | 'decision';

/**
 * Load a prompt from file
 * @param name - Prompt name (without .txt extension)
 * @param useCache - Whether to use cached version (default: true)
 * @returns Prompt content
 */
export function loadPrompt(name: string, useCache: boolean = true): string {
  validatePromptName(name);
  if (useCache && promptCache.has(name)) {
    return promptCache.get(name)!;
  }

  // Try default prompts first
  let filePath = path.join(promptsDir, `${name}.txt`);

  // If not found, try custom folder
  if (!fs.existsSync(filePath)) {
    filePath = path.join(promptsDir, 'custom', `${name}.txt`);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt not found: ${name}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  if (useCache) {
    promptCache.set(name, content);
  }

  return content;
}

/**
 * Save a custom prompt
 * @param name - Prompt name (without .txt extension)
 * @param content - Prompt content
 */
export function savePrompt(name: string, content: string): void {
  validatePromptName(name);
  const customDir = path.join(promptsDir, 'custom');

  // Ensure custom directory exists
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, { recursive: true });
  }

  const filePath = path.join(customDir, `${name}.txt`);
  fs.writeFileSync(filePath, content, 'utf-8');

  // Update cache
  promptCache.set(name, content);
}

/**
 * Delete a custom prompt
 * @param name - Prompt name (without .txt extension)
 * @returns true if deleted, false if not found
 */
export function deletePrompt(name: string): boolean {
  validatePromptName(name);
  const filePath = path.join(promptsDir, 'custom', `${name}.txt`);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.unlinkSync(filePath);
  promptCache.delete(name);

  return true;
}

/**
 * List all available prompts
 * @returns Array of prompt names
 */
export function listPrompts(): { name: string; isCustom: boolean }[] {
  const prompts: { name: string; isCustom: boolean }[] = [];

  // Default prompts
  if (fs.existsSync(promptsDir)) {
    const defaultPrompts = fs.readdirSync(promptsDir).filter((f) => f.endsWith('.txt'));
    for (const file of defaultPrompts) {
      prompts.push({ name: file.replace('.txt', ''), isCustom: false });
    }
  }

  // Custom prompts
  const customDir = path.join(promptsDir, 'custom');
  if (fs.existsSync(customDir)) {
    const customPrompts = fs.readdirSync(customDir).filter((f) => f.endsWith('.txt'));
    for (const file of customPrompts) {
      prompts.push({ name: file.replace('.txt', ''), isCustom: true });
    }
  }

  return prompts;
}

/**
 * Clear prompt cache
 */
export function clearPromptCache(): void {
  promptCache.clear();
}

/**
 * Get prompt with variable substitution
 * @param name - Prompt name
 * @param variables - Variables to substitute (e.g., { name: 'John' } for {{name}})
 * @returns Prompt with substituted variables
 */
export function loadPromptWithVariables(name: string, variables: Record<string, string>): string {
  let content = loadPrompt(name);

  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return content;
}
