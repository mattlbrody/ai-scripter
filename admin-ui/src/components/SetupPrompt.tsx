import { useState } from 'react';
import { AlertCircle, Loader, CheckCircle } from 'lucide-react';
import { setupUserDatabase } from '../utils/setupDatabase';

export function SetupPrompt({ onSetupComplete }: { onSetupComplete: () => void }) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupResult, setSetupResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSetup = async () => {
    setIsSettingUp(true);
    setSetupResult(null);
    
    const result = await setupUserDatabase();
    
    if (result.success) {
      setSetupResult({ success: true, message: 'Database setup complete! Refreshing...' });
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      setSetupResult({ 
        success: false, 
        message: result.error || 'Setup failed. Please check the console for details.' 
      });
    }
    
    setIsSettingUp(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Database Setup Required</h2>
          <p className="text-gray-600">
            It looks like this is your first time using the app. We need to set up your database.
          </p>
        </div>

        {setupResult && (
          <div className={`mb-4 p-4 rounded-md ${
            setupResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            <div className="flex items-center">
              {setupResult.success ? (
                <CheckCircle className="w-5 h-5 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-2" />
              )}
              <span>{setupResult.message}</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-md">
            <h3 className="font-semibold text-blue-900 mb-2">What will be created:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• An organization for your account</li>
              <li>• Admin membership for your user</li>
              <li>• Default intent categories</li>
            </ul>
          </div>

          <button
            onClick={handleSetup}
            disabled={isSettingUp}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {isSettingUp ? (
              <>
                <Loader className="w-5 h-5 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              'Set Up Database'
            )}
          </button>

          <div className="text-center">
            <p className="text-sm text-gray-500">
              If you continue to have issues, please run the{' '}
              <code className="bg-gray-100 px-1 py-0.5 rounded">fix-rls-policies.sql</code>{' '}
              script in your Supabase SQL editor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}