export class SidecarWindow {
  private windowId: number | null = null;
  private domain: string;
  private lastPosition: { left?: number; top?: number; width?: number; height?: number } = {};

  constructor(domain: string) {
    this.domain = domain;
  }

  async create(): Promise<void> {
    const savedPosition = await this.getSavedPosition();
    
    const displayInfo = await chrome.system.display.getInfo();
    const primaryDisplay = displayInfo[0];
    
    const defaultWidth = 400;
    const defaultHeight = 300;
    const defaultLeft = primaryDisplay.bounds.width - defaultWidth - 20;
    const defaultTop = 20;

    const createData: chrome.windows.CreateData = {
      url: chrome.runtime.getURL('sidecar.html'),
      type: 'popup',
      width: savedPosition.width || defaultWidth,
      height: savedPosition.height || defaultHeight,
      left: savedPosition.left || defaultLeft,
      top: savedPosition.top || defaultTop,
      focused: false
    };

    const window = await chrome.windows.create(createData);
    this.windowId = window.id!;

    chrome.windows.onBoundsChanged.addListener(this.handleBoundsChanged.bind(this));
  }

  private async handleBoundsChanged(window: chrome.windows.Window) {
    if (window.id !== this.windowId) return;

    this.lastPosition = {
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height
    };

    await this.savePosition(this.lastPosition);
  }

  async sendMessage(message: any): Promise<void> {
    if (!this.windowId) return;

    const tabs = await chrome.tabs.query({ windowId: this.windowId });
    if (tabs.length > 0) {
      await chrome.tabs.sendMessage(tabs[0].id!, message);
    }
  }

  async close(): Promise<void> {
    if (this.windowId) {
      try {
        await chrome.windows.remove(this.windowId);
      } catch (error) {
        console.error('Failed to close sidecar window:', error);
      }
      this.windowId = null;
    }
  }

  private async getSavedPosition(): Promise<typeof this.lastPosition> {
    const key = `sidecar_position_${this.domain}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || {};
  }

  private async savePosition(position: typeof this.lastPosition): Promise<void> {
    const key = `sidecar_position_${this.domain}`;
    await chrome.storage.local.set({ [key]: position });
  }

  isOpen(): boolean {
    return this.windowId !== null;
  }

  async focus(): Promise<void> {
    if (this.windowId) {
      await chrome.windows.update(this.windowId, { focused: true });
    }
  }
}