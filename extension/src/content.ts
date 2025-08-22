class DialerDetector {
  private callConnectedSelectors = [
    '[data-call-status="connected"]',
    '.call-timer:not(.call-timer--idle)',
    '.call-duration',
    '[class*="call-active"]',
    '[class*="in-call"]'
  ];

  private callEndedSelectors = [
    '[data-call-status="ended"]',
    '[data-call-status="disconnected"]',
    '.call-ended',
    '[class*="call-complete"]'
  ];

  private observer: MutationObserver | null = null;
  private isCallActive = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupMessageListener();
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'INIT_DIALER_DETECTION') {
        this.startDetection();
        sendResponse({ success: true });
      }
    });
  }

  private startDetection() {
    console.log('Starting dialer detection');
    
    this.observer = new MutationObserver(() => {
      this.checkCallStatus();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-call-status']
    });

    this.checkInterval = setInterval(() => {
      this.checkCallStatus();
    }, 1000);

    this.checkCallStatus();
  }

  private checkCallStatus() {
    const wasCallActive = this.isCallActive;
    
    const isConnected = this.callConnectedSelectors.some(selector => 
      document.querySelector(selector) !== null
    );

    const isEnded = this.callEndedSelectors.some(selector =>
      document.querySelector(selector) !== null
    );

    if (isConnected && !wasCallActive) {
      this.isCallActive = true;
      this.notifyCallConnected();
    } else if ((isEnded || !isConnected) && wasCallActive) {
      this.isCallActive = false;
      this.notifyCallEnded();
    }
  }

  private notifyCallConnected() {
    console.log('Call connected detected');
    chrome.runtime.sendMessage({
      type: 'CALL_CONNECTED',
      tabId: chrome.runtime.id
    });
  }

  private notifyCallEnded() {
    console.log('Call ended detected');
    chrome.runtime.sendMessage({
      type: 'CALL_ENDED'
    });
  }

  stopDetection() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

const detector = new DialerDetector();