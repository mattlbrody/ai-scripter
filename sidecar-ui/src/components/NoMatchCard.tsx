import React from 'react';
import { motion } from 'framer-motion';

interface NoMatchCardProps {
  leadText: string;
  reason?: string;
  onDismiss: () => void;
}

export function NoMatchCard({ leadText, reason, onDismiss }: NoMatchCardProps) {
  const truncatedText = leadText.length > 150 
    ? leadText.substring(0, 150) + '...' 
    : leadText;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="no-match-card"
    >
      <div className="card-header">
        <span className="no-match-badge">No close matches</span>
        <button className="dismiss-btn" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>

      <div className="lead-excerpt">
        <div className="excerpt-label">Lead said:</div>
        <div className="excerpt-text">"{truncatedText}"</div>
      </div>

      {reason && (
        <div className="no-match-reason">
          {reason}
        </div>
      )}
    </motion.div>
  );
}