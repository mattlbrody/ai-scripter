import { AudioCapture } from './lib/audioCapture';
import { WebSocketClient } from './lib/websocket';
import { SidecarWindow } from './lib/sidecarWindow';
import { StorageManager } from './lib/storage';

class ExtensionBackground {
  private audioCapture: AudioCapture | null = null;
  private wsClient: WebSocketClient | null = null;
  private sidecarWindow: SidecarWindow | null = null;
  private storage: StorageManager;
  private activeCallId: string | null = null;
  private isCapturing = false;

  constructor() {
    this.storage = new StorageManager();
    this.setupListeners();
    this.initializeOffscreenDocument();
  }

  private async initializeOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
        justification: 'Capture tab audio for sales coaching'
      });
    }
  }

  private setupListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.handleTabClosed(tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'complete') {
        this.checkDialerTab(tabId);
      }
    });
  }

  private async handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    try {
      switch (message.type) {
        case 'START_CAPTURE':
          await this.startCapture(message.tabId);
          sendResponse({ success: true });
          break;

        case 'STOP_CAPTURE':
          await this.stopCapture();
          sendResponse({ success: true });
          break;

        case 'CALL_CONNECTED':
          await this.handleCallConnected(message.tabId);
          sendResponse({ success: true });
          break;

        case 'CALL_ENDED':
          await this.handleCallEnded();
          sendResponse({ success: true });
          break;

        case 'AUDIO_DATA':
          this.handleAudioData(message.data);
          break;

        case 'GET_STATUS':
          sendResponse({
            isCapturing: this.isCapturing,
            activeCallId: this.activeCallId
          });
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  private async startCapture(tabId: number) {
    if (this.isCapturing) {
      console.log('Already capturing');
      return;
    }

    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId
      });

      await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        target: 'offscreen',
        data: { streamId }
      });

      const wsUrl = await this.storage.getWebSocketUrl();
      this.wsClient = new WebSocketClient(wsUrl);
      await this.wsClient.connect();

      this.wsClient.on('suggestion', (data) => {
        this.handleSuggestion(data);
      });

      this.isCapturing = true;
      console.log('Audio capture started');
    } catch (error) {
      console.error('Failed to start capture:', error);
      throw error;
    }
  }

  private async stopCapture() {
    if (!this.isCapturing) {
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
        target: 'offscreen'
      });

      if (this.wsClient) {
        await this.wsClient.disconnect();
        this.wsClient = null;
      }

      this.isCapturing = false;
      console.log('Audio capture stopped');
    } catch (error) {
      console.error('Failed to stop capture:', error);
    }
  }

  private async handleCallConnected(tabId: number) {
    this.activeCallId = `call_${Date.now()}`;
    
    await this.startCapture(tabId);
    
    const domain = await this.getTabDomain(tabId);
    this.sidecarWindow = new SidecarWindow(domain);
    await this.sidecarWindow.create();

    if (this.wsClient) {
      this.wsClient.send({
        type: 'CALL_START',
        callId: this.activeCallId,
        timestamp: Date.now()
      });
    }
  }

  private async handleCallEnded() {
    if (this.wsClient && this.activeCallId) {
      this.wsClient.send({
        type: 'CALL_END',
        callId: this.activeCallId,
        timestamp: Date.now()
      });
    }

    await this.stopCapture();
    
    if (this.sidecarWindow) {
      await this.sidecarWindow.close();
      this.sidecarWindow = null;
    }

    this.activeCallId = null;
  }

  private handleAudioData(data: ArrayBuffer) {
    if (!this.wsClient || !this.wsClient.isConnected()) {
      return;
    }

    this.wsClient.sendBinary(data);
  }

  private async handleSuggestion(suggestion: any) {
    if (!this.sidecarWindow) {
      return;
    }

    await this.sidecarWindow.sendMessage({
      type: 'NEW_SUGGESTION',
      data: suggestion
    });
  }

  private async checkDialerTab(tabId: number) {
    const settings = await this.storage.getSettings();
    const tab = await chrome.tabs.get(tabId);
    
    if (!tab.url) return;

    const isDialer = settings.dialerDomains?.some(domain => 
      tab.url!.includes(domain)
    );

    if (isDialer) {
      chrome.tabs.sendMessage(tabId, {
        type: 'INIT_DIALER_DETECTION'
      });
    }
  }

  private async getTabDomain(tabId: number): Promise<string> {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return 'unknown';
    
    try {
      const url = new URL(tab.url);
      return url.hostname;
    } catch {
      return 'unknown';
    }
  }

  private async handleTabClosed(tabId: number) {
    const captureTab = await this.storage.getCaptureTabId();
    if (captureTab === tabId) {
      await this.handleCallEnded();
    }
  }
}

new ExtensionBackground();