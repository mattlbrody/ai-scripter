import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface SuggestionCardProps {
  suggestion: {
    intent?: {
      label: string;
      score: number;
    };
    response?: {
      text: string;
    };
    similarity?: number;
  };
  onDismiss: () => void;
  onCopy: () => void;
}

export function SuggestionCard({ suggestion, onDismiss, onCopy }: SuggestionCardProps) {
  const confidence = suggestion.similarity || 0;
  const confidencePercent = Math.round(confidence * 100);
  const confidenceColor = confidence >= 0.9 ? 'green' : confidence >= 0.8 ? 'yellow' : 'orange';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="suggestion-card"
    >
      <div className="card-header">
        <span className={clsx('intent-badge', `intent-${suggestion.intent?.label}`)}>
          {formatIntentLabel(suggestion.intent?.label || 'unknown')}
        </span>
        <button className="dismiss-btn" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>

      <div className="response-text">
        {suggestion.response?.text}
      </div>

      <div className="card-footer">
        <div className="confidence-bar">
          <div className="confidence-label">Confidence</div>
          <div className="confidence-track">
            <div 
              className={clsx('confidence-fill', `confidence-${confidenceColor}`)}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <div className="confidence-value">{confidencePercent}%</div>
        </div>
        
        <button className="copy-btn" onClick={onCopy}>
          Copy
        </button>
      </div>
    </motion.div>
  );
}

function formatIntentLabel(label: string): string {
  return label
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}