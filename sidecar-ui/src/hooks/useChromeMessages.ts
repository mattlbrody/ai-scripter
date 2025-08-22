import { useEffect } from 'react';

export function useChromeMessages(handler: (message: any) => void) {
  useEffect(() => {
    const listener = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      handler(message);
      return true;
    };

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(listener);
      
      return () => {
        chrome.runtime.onMessage.removeListener(listener);
      };
    }
  }, [handler]);
}