import { useQuery } from '@tanstack/react-query';
import { Activity, Phone, MessageSquare, Target, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { SetupPrompt } from '../components/SetupPrompt';
import { useState } from 'react';

export function DashboardPage() {
  const [showSetup, setShowSetup] = useState(false);
  
  const { data: stats, error, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.getStats(),
    retry: 1,
    onError: (error: any) => {
      // Check if it's a permission error
      if (error?.message?.includes('permission') || error?.message?.includes('membership')) {
        setShowSetup(true);
      }
    }
  });

  // Show setup prompt if there's a permission error
  if (showSetup || (error && (error as any)?.message?.includes('membership'))) {
    return <SetupPrompt onSetupComplete={() => {
      setShowSetup(false);
      refetch();
    }} />;
  }

  const cards = [
    {
      title: 'Total Calls',
      value: stats?.totalCalls || 0,
      icon: Phone,
      change: '+12%',
      color: 'bg-blue-500'
    },
    {
      title: 'Suggestions Shown',
      value: stats?.suggestionsShown || 0,
      icon: MessageSquare,
      change: '+8%',
      color: 'bg-green-500'
    },
    {
      title: 'Active Intents',
      value: stats?.activeIntents || 0,
      icon: Target,
      change: '+2',
      color: 'bg-purple-500'
    },
    {
      title: 'Success Rate',
      value: `${stats?.successRate || 0}%`,
      icon: TrendingUp,
      change: '+5%',
      color: 'bg-orange-500'
    }
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Monitor your sales coaching performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-sm text-green-600 font-medium">{card.change}</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">{card.value}</h3>
              <p className="text-gray-600 text-sm mt-1">{card.title}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
              <Activity className="w-5 h-5 text-gray-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">New response approved</p>
                <p className="text-xs text-gray-500">2 minutes ago</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
              <Activity className="w-5 h-5 text-gray-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Call processed</p>
                <p className="text-xs text-gray-500">15 minutes ago</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
              <Activity className="w-5 h-5 text-gray-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Intent threshold updated</p>
                <p className="text-xs text-gray-500">1 hour ago</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Top Performing Intents</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pricing Question</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '85%' }}></div>
                </div>
                <span className="text-sm text-gray-600">85%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Objection</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '78%' }}></div>
                </div>
                <span className="text-sm text-gray-600">78%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Interest Signal</span>
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '92%' }}></div>
                </div>
                <span className="text-sm text-gray-600">92%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}