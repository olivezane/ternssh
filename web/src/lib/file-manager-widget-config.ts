export interface FileManagerWidgetConfig {
  followTerminalCwd: boolean;
}

export const DEFAULT_FILE_MANAGER_WIDGET_CONFIG: FileManagerWidgetConfig = {
  followTerminalCwd: false,
};

export function parseFileManagerWidgetConfig(
  configJson: string | null | undefined,
): FileManagerWidgetConfig {
  if (!configJson) return DEFAULT_FILE_MANAGER_WIDGET_CONFIG;

  try {
    const parsed = JSON.parse(configJson) as Partial<FileManagerWidgetConfig>;
    return {
      followTerminalCwd: parsed.followTerminalCwd === true,
    };
  } catch {
    return DEFAULT_FILE_MANAGER_WIDGET_CONFIG;
  }
}

export function serializeFileManagerWidgetConfig(
  config: FileManagerWidgetConfig,
): string {
  return JSON.stringify({
    followTerminalCwd: config.followTerminalCwd === true,
  });
}
