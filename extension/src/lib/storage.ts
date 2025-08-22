interface ExtensionSettings {
  wsUrl: string;
  dialerDomains: string[];
  autoStart: boolean;
  captureTabId?: number;
  userId?: string;
  orgId?: string;
  authToken?: string;
}

export class StorageManager {
  private defaultSettings: ExtensionSettings = {
    wsUrl: 'ws://localhost:3001',
    dialerDomains: [],
    autoStart: true
  };

  async getSettings(): Promise<ExtensionSettings> {
    const result = await chrome.storage.local.get('settings');
    return { ...this.defaultSettings, ...(result.settings || {}) };
  }

  async saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await chrome.storage.local.set({ settings: updated });
  }

  async getWebSocketUrl(): Promise<string> {
    const settings = await this.getSettings();
    return settings.wsUrl;
  }

  async setDialerDomains(domains: string[]): Promise<void> {
    await this.saveSettings({ dialerDomains: domains });
  }

  async getCaptureTabId(): Promise<number | undefined> {
    const settings = await this.getSettings();
    return settings.captureTabId;
  }

  async setCaptureTabId(tabId: number | undefined): Promise<void> {
    await this.saveSettings({ captureTabId: tabId });
  }

  async getAuthToken(): Promise<string | undefined> {
    const settings = await this.getSettings();
    return settings.authToken;
  }

  async setAuthToken(token: string | undefined): Promise<void> {
    await this.saveSettings({ authToken: token });
  }

  async setOrgContext(orgId: string, userId: string): Promise<void> {
    await this.saveSettings({ orgId, userId });
  }

  async clearAuth(): Promise<void> {
    await this.saveSettings({
      authToken: undefined,
      userId: undefined,
      orgId: undefined
    });
  }
}