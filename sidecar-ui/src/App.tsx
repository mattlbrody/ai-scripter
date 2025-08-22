import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { SuggestionCard } from './components/SuggestionCard';
import { NoMatchCard } from './components/NoMatchCard';
import { useChromeMessages } from './hooks/useChromeMessages';
import './App.css';

interface Suggestion {
  id: string;
  leadText: string;
  intent?: {
    label: string;
    score: number;
  };
  response?: {
    text: string;
    sourceId: string;
  };
  similarity?: number;
  decision: 'suggestion' | 'no_match';
  reason?: string;
  timestamp: number;
}

function App() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissTimer, setDismissTimer] = useState<NodeJS.Timeout | null>(null);

  useChromeMessages((message) => {
    if (message.type === 'NEW_SUGGESTION') {
      handleNewSuggestion(message.data);
    } else if (message.type === 'DISMISS_SUGGESTIONS') {
      dismissAll();
    }
  });

  const handleNewSuggestion = (data: any) => {
    const suggestion: Suggestion = {
      id: `${data.timestamp}_${Math.random()}`,
      ...data
    };

    setSuggestions(prev => {
      const updated = [...prev, suggestion].slice(-2);
      return updated;
    });

    if (dismissTimer) {
      clearTimeout(dismissTimer);
    }

    const timer = setTimeout(() => {
      dismissSuggestion(suggestion.id);
    }, 10000);
    
    setDismissTimer(timer);
  };

  const dismissSuggestion = (id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
  };

  const dismissAll = () => {
    setSuggestions([]);
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      setDismissTimer(null);
    }
  };

  const copySuggestion = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="app">
      <AnimatePresence mode="sync">
        {suggestions.map((suggestion, index) => (
          <div key={suggestion.id} style={{ marginBottom: index === 0 && suggestions.length > 1 ? '8px' : 0 }}>
            {suggestion.decision === 'suggestion' ? (
              <SuggestionCard
                suggestion={suggestion}
                onDismiss={() => dismissSuggestion(suggestion.id)}
                onCopy={() => copySuggestion(suggestion.response?.text || '')}
              />
            ) : (
              <NoMatchCard
                leadText={suggestion.leadText}
                reason={suggestion.reason}
                onDismiss={() => dismissSuggestion(suggestion.id)}
              />
            )}
          </div>
        ))}
      </AnimatePresence>

      {suggestions.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <p>Listening for conversation...</p>
        </div>
      )}
    </div>
  );
}

export default App;