import { AudioCapture } from './lib/audioCapture';

class OffscreenAudioProcessor {
  private audioCapture: AudioCapture | null = null;

  constructor() {
    this.setupMessageListener();
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.target !== 'offscreen') {
        return;
      }

      this.handleMessage(message, sendResponse);
      return true;
    });
  }

  private async handleMessage(message: any, sendResponse: (response?: any) => void) {
    try {
      switch (message.type) {
        case 'START_RECORDING':
          await this.startRecording(message.data.streamId);
          sendResponse({ success: true });
          break;

        case 'STOP_RECORDING':
          await this.stopRecording();
          sendResponse({ success: true });
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Offscreen error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  private async startRecording(streamId: string) {
    if (this.audioCapture) {
      await this.stopRecording();
    }

    this.audioCapture = new AudioCapture();
    
    await this.audioCapture.start(streamId, (data) => {
      chrome.runtime.sendMessage({
        type: 'AUDIO_DATA',
        data: data
      });
    });
  }

  private async stopRecording() {
    if (this.audioCapture) {
      await this.audioCapture.stop();
      this.audioCapture = null;
    }
  }
}

new OffscreenAudioProcessor();