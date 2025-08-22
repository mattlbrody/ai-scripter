import { useState } from 'react';
import { Settings as SettingsIcon, Save, AlertCircle } from 'lucide-react';

export function SettingsPage() {
  const [settings, setSettings] = useState({
    simThreshold: 0.80,
    turnSilenceMs: 200,
    minTokens: 6,
    stackMax: 2,
    earlyShowThreshold: 0.88,
    audioRetentionDays: 30,
    transcriptRetentionDays: 180
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Configure system parameters and thresholds</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5" />
            Detection Settings
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Similarity Threshold ({(settings.simThreshold * 100).toFixed(0)}%)
              </label>
              <input
                type="range"
                min="50"
                max="100"
                value={settings.simThreshold * 100}
                onChange={(e) => setSettings({ ...settings, simThreshold: parseInt(e.target.value) / 100 })}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum similarity score to show suggestions
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Early Show Threshold ({(settings.earlyShowThreshold * 100).toFixed(0)}%)
              </label>
              <input
                type="range"
                min="80"
                max="100"
                value={settings.earlyShowThreshold * 100}
                onChange={(e) => setSettings({ ...settings, earlyShowThreshold: parseInt(e.target.value) / 100 })}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Threshold for showing suggestions before turn ends
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Turn Silence Duration (ms)
              </label>
              <input
                type="number"
                value={settings.turnSilenceMs}
                onChange={(e) => setSettings({ ...settings, turnSilenceMs: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Silence duration to detect end of turn
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Tokens per Turn
              </label>
              <input
                type="number"
                value={settings.minTokens}
                onChange={(e) => setSettings({ ...settings, minTokens: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum words to process a turn
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Display & Retention</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Stacked Cards
              </label>
              <input
                type="number"
                value={settings.stackMax}
                onChange={(e) => setSettings({ ...settings, stackMax: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum number of suggestion cards to show
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Audio Retention (days)
              </label>
              <input
                type="number"
                value={settings.audioRetentionDays}
                onChange={(e) => setSettings({ ...settings, audioRetentionDays: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Days to retain raw audio files
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transcript Retention (days)
              </label>
              <input
                type="number"
                value={settings.transcriptRetentionDays}
                onChange={(e) => setSettings({ ...settings, transcriptRetentionDays: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                Days to retain call transcripts
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Save className="w-4 h-4" />
          Save Settings
        </button>
        
        {saved && (
          <div className="flex items-center gap-2 text-green-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Settings saved successfully</span>
          </div>
        )}
      </div>
    </div>
  );
}