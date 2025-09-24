'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Medal,
  Award,
  Target,
  Bug,
  Star,
  Clock,
  Calendar,
  Users,
  TrendingUp,
  Gift,
  Crown,
  Zap,
  Shield,
  AlertTriangle,
  CheckCircle,
  Filter,
  Download,
  RefreshCw,
  ChevronDown,
  User
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import toast from 'react-hot-toast';

interface BugHunter {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  total_bugs: number;
  open_bugs: number;
  resolved_bugs: number;
  critical_bugs: number;
  high_bugs: number;
  medium_bugs: number;
  low_bugs: number;
  points: number;
  rank: number;
  level: string;
  badges: string[];
  join_date: string;
  last_report_date?: string;
  streak_days: number;
  categories: {
    ui_ux: number;
    functionality: number;
    performance: number;
    security: number;
    other: number;
  };
}

interface BugBountyStats {
  total_hunters: number;
  total_reports: number;
  total_points_awarded: number;
  active_hunters_month: number;
  top_categories: Array<{ category: string; count: number; percentage: number }>;
  monthly_trend: Array<{ month: string; reports: number; hunters: number }>;
}

interface BugBountyLeaderboardProps {
  adminId: string;
  className?: string;
}

const BugBountyLeaderboard: React.FC<BugBountyLeaderboardProps> = ({
  adminId,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [loading, setLoading] = useState(false);
  const [hunters, setHunters] = useState<BugHunter[]>([]);
  const [stats, setStats] = useState<BugBountyStats>({
    total_hunters: 0,
    total_reports: 0,
    total_points_awarded: 0,
    active_hunters_month: 0,
    top_categories: [],
    monthly_trend: []
  });
  
  const [filters, setFilters] = useState({
    timeframe: 'all', // all, month, week
    category: 'all',
    minReports: 1
  });

  const [selectedHunter, setSelectedHunter] = useState<BugHunter | null>(null);
  const [showHunterDetails, setShowHunterDetails] = useState(false);

  useEffect(() => {
    loadBugHunters();
    loadBountyStats();
  }, [adminId, filters]);

  const loadBugHunters = async () => {
    if (!adminId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/bug-bounty/hunters?adminId=${adminId}&timeframe=${filters.timeframe}&category=${filters.category}&minReports=${filters.minReports}`);
      const data = await response.json();
      
      if (data.success) {
        setHunters(data.hunters || []);
      } else {
        toast.error(data.error || 'Failed to load bug hunters');
      }
    } catch (error) {
      console.error('Error loading bug hunters:', error);
      toast.error('Failed to load bug hunters');
    } finally {
      setLoading(false);
    }
  };

  const loadBountyStats = async () => {
    if (!adminId) return;
    
    try {
      const response = await fetch(`/api/admin/bug-bounty/stats?adminId=${adminId}`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats || stats);
      }
    } catch (error) {
      console.error('Error loading bounty stats:', error);
    }
  };

  const calculatePoints = (hunter: BugHunter): number => {
    // Point system: Critical=50, High=30, Medium=15, Low=5
    return (hunter.critical_bugs * 50) + 
           (hunter.high_bugs * 30) + 
           (hunter.medium_bugs * 15) + 
           (hunter.low_bugs * 5);
  };

  const getHunterLevel = (points: number): { level: string; color: string; icon: any } => {
    if (points >= 1000) return { level: 'Legend', color: 'bg-purple-500', icon: Crown };
    if (points >= 500) return { level: 'Expert', color: 'bg-gold-500', icon: Trophy };
    if (points >= 200) return { level: 'Advanced', color: 'bg-blue-500', icon: Award };
    if (points >= 50) return { level: 'Intermediate', color: 'bg-green-500', icon: Medal };
    return { level: 'Beginner', color: 'bg-gray-500', icon: Target };
  };

  const getHunterBadges = (hunter: BugHunter): string[] => {
    const badges = [];
    if (hunter.critical_bugs >= 5) badges.push('Critical Hunter');
    if (hunter.total_bugs >= 50) badges.push('Bug Terminator');
    if (hunter.streak_days >= 7) badges.push('Weekly Warrior');
    if (hunter.categories.security >= 3) badges.push('Security Specialist');
    if (hunter.categories.performance >= 5) badges.push('Performance Pro');
    if (hunter.categories.ui_ux >= 10) badges.push('UX Guardian');
    return badges;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Crown className="w-6 h-6 text-yellow-500" />;
      case 2: return <Trophy className="w-6 h-6 text-gray-400" />;
      case 3: return <Award className="w-6 h-6 text-amber-600" />;
      default: return <span className="text-lg font-bold text-gray-600">#{rank}</span>;
    }
  };

  const exportLeaderboard = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "Rank,Name,Email,Total Bugs,Points,Level,Critical,High,Medium,Low\n" +
      hunters.map(hunter => 
        `${hunter.rank},"${hunter.name}","${hunter.email}",${hunter.total_bugs},${calculatePoints(hunter)},"${getHunterLevel(calculatePoints(hunter)).level}",${hunter.critical_bugs},${hunter.high_bugs},${hunter.medium_bugs},${hunter.low_bugs}`
      ).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bug-bounty-leaderboard-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-2">
            <Trophy className="w-8 h-8 text-yellow-500" />
            <span>Bug Bounty Leaderboard</span>
          </h1>
          <p className="text-gray-600 mt-1">Track and gamify bug reporting with our hunting system</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={exportLeaderboard} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => { loadBugHunters(); loadBountyStats(); }} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Hunters</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_hunters}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Reports</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_reports}</p>
              </div>
              <Bug className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Points Awarded</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_points_awarded}</p>
              </div>
              <Star className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active This Month</p>
                <p className="text-2xl font-bold text-gray-900">{stats.active_hunters_month}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
        </TabsList>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium">Filters:</span>
                </div>
                
                <Select value={filters.timeframe} onValueChange={(value) => setFilters({...filters, timeframe: value})}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Timeframe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.category} onValueChange={(value) => setFilters({...filters, category: value})}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="ui_ux">UI/UX</SelectItem>
                    <SelectItem value="functionality">Functionality</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filters.minReports.toString()} onValueChange={(value) => setFilters({...filters, minReports: parseInt(value)})}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Min Reports" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1+ Reports</SelectItem>
                    <SelectItem value="5">5+ Reports</SelectItem>
                    <SelectItem value="10">10+ Reports</SelectItem>
                    <SelectItem value="25">25+ Reports</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle>Bug Hunter Rankings</CardTitle>
              <CardDescription>Top performers in our bug bounty program</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
                  <span className="ml-2 text-gray-600">Loading hunters...</span>
                </div>
              ) : hunters.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Bug className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No bug hunters found</p>
                  <p className="text-sm">Adjust your filters or check back later</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {hunters.map((hunter, index) => {
                    const points = calculatePoints(hunter);
                    const level = getHunterLevel(points);
                    const LevelIcon = level.icon;
                    const badges = getHunterBadges(hunter);

                    return (
                      <motion.div
                        key={hunter.id}
                        className={`p-4 border rounded-lg hover:shadow-md transition-all cursor-pointer ${
                          index < 3 ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200' : 'bg-white'
                        }`}
                        whileHover={{ scale: 1.02 }}
                        onClick={() => {
                          setSelectedHunter(hunter);
                          setShowHunterDetails(true);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            {/* Rank */}
                            <div className="flex items-center justify-center w-12 h-12">
                              {getRankIcon(index + 1)}
                            </div>

                            {/* Hunter Info */}
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <h3 className="font-semibold text-gray-900">{hunter.name}</h3>
                                <Badge className={level.color + ' text-white'}>
                                  <LevelIcon className="w-3 h-3 mr-1" />
                                  {level.level}
                                </Badge>
                                {badges.slice(0, 2).map((badge, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {badge}
                                  </Badge>
                                ))}
                              </div>
                              <p className="text-sm text-gray-600">{hunter.email}</p>
                              <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                                <span>{hunter.total_bugs} bugs reported</span>
                                <span>{points} points</span>
                                {hunter.streak_days > 0 && (
                                  <span className="flex items-center space-x-1">
                                    <Zap className="w-3 h-3" />
                                    <span>{hunter.streak_days} day streak</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="text-right">
                            <div className="flex items-center space-x-2 text-sm">
                              {hunter.critical_bugs > 0 && (
                                <Badge className="bg-red-500 text-white text-xs">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  {hunter.critical_bugs}
                                </Badge>
                              )}
                              {hunter.high_bugs > 0 && (
                                <Badge className="bg-orange-500 text-white text-xs">
                                  {hunter.high_bugs}
                                </Badge>
                              )}
                              {hunter.resolved_bugs > 0 && (
                                <Badge className="bg-green-500 text-white text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {hunter.resolved_bugs}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Last report: {hunter.last_report_date ? formatDate(hunter.last_report_date) : 'Never'}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Top Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.top_categories.map((category, index) => (
                    <div key={category.category} className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">{category.category.replace('_', ' ')}</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${category.percentage}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">{category.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Monthly Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.monthly_trend.slice(-6).map((month, index) => (
                    <div key={month.month} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{month.month}</span>
                      <div className="flex items-center space-x-4">
                        <span className="text-gray-600">{month.reports} reports</span>
                        <span className="text-gray-600">{month.hunters} hunters</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Rewards Tab */}
        <TabsContent value="rewards" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Reward System</CardTitle>
              <CardDescription>Point values and level requirements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Point System</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Critical Bug</span>
                      <Badge className="bg-red-500 text-white">50 points</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>High Priority Bug</span>
                      <Badge className="bg-orange-500 text-white">30 points</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Medium Priority Bug</span>
                      <Badge className="bg-yellow-500 text-white">15 points</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Low Priority Bug</span>
                      <Badge className="bg-green-500 text-white">5 points</Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3">Hunter Levels</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span>Beginner</span>
                      <span className="text-gray-600">0-49 points</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Intermediate</span>
                      <span className="text-gray-600">50-199 points</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Advanced</span>
                      <span className="text-gray-600">200-499 points</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Expert</span>
                      <span className="text-gray-600">500-999 points</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Legend</span>
                      <span className="text-gray-600">1000+ points</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Hunter Details Modal */}
      <AnimatePresence>
        {showHunterDetails && selectedHunter && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="bg-gray-50 px-6 py-4 border-b flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <User className="w-6 h-6 text-gray-600" />
                  <h2 className="text-xl font-semibold text-gray-900">{selectedHunter.name}</h2>
                  <Badge className={getHunterLevel(calculatePoints(selectedHunter)).color + ' text-white'}>
                    {getHunterLevel(calculatePoints(selectedHunter)).level}
                  </Badge>
                </div>
                <button
                  onClick={() => setShowHunterDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-medium mb-3">Bug Statistics</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Total Reports</span>
                        <span className="font-medium">{selectedHunter.total_bugs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Critical</span>
                        <span className="font-medium text-red-600">{selectedHunter.critical_bugs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>High</span>
                        <span className="font-medium text-orange-600">{selectedHunter.high_bugs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Medium</span>
                        <span className="font-medium text-yellow-600">{selectedHunter.medium_bugs}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Low</span>
                        <span className="font-medium text-green-600">{selectedHunter.low_bugs}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span>Total Points</span>
                        <span className="font-medium text-blue-600">{calculatePoints(selectedHunter)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-3">Category Breakdown</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>UI/UX</span>
                        <span className="font-medium">{selectedHunter.categories.ui_ux}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Functionality</span>
                        <span className="font-medium">{selectedHunter.categories.functionality}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Performance</span>
                        <span className="font-medium">{selectedHunter.categories.performance}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Security</span>
                        <span className="font-medium">{selectedHunter.categories.security}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Other</span>
                        <span className="font-medium">{selectedHunter.categories.other}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="font-medium mb-3">Achievements</h3>
                  <div className="flex flex-wrap gap-2">
                    {getHunterBadges(selectedHunter).map((badge, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        <Award className="w-3 h-3 mr-1" />
                        {badge}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Joined:</span>
                    <span className="ml-2 font-medium">{formatDate(selectedHunter.join_date)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Current Streak:</span>
                    <span className="ml-2 font-medium">{selectedHunter.streak_days} days</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BugBountyLeaderboard;

