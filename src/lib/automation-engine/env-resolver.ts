/**
 * Resolve {{VARIABLE}} placeholders in strings using global variables
 */

interface GlobalVar {
  key: string;
  value: string;
}

/**
 * Replace all {{KEY}} placeholders in a string with their values
 */
export function resolveVars(template: string, vars: GlobalVar[]): string {
  let result = template;
  for (const v of vars) {
    const pattern = new RegExp(`\\{\\{${escapeRegex(v.key)}\\}\\}`, "g");
    result = result.replace(pattern, v.value);
  }
  return result;
}

/**
 * Deep resolve all string values in an object
 */
export function resolveVarsDeep<T>(obj: T, vars: GlobalVar[]): T {
  if (!vars || vars.length === 0) return obj;

  if (typeof obj === "string") {
    return resolveVars(obj, vars) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveVarsDeep(item, vars)) as unknown as T;
  }

  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveVarsDeep(value, vars);
    }
    return result as T;
  }

  return obj;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
