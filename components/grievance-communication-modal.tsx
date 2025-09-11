'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Send,
  MessageCircle,
  User,
  Clock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface GrievanceCommunicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  grievance: any;
  onRefresh?: () => void;
}

const GrievanceCommunicationModal: React.FC<GrievanceCommunicationModalProps> = ({
  isOpen,
  onClose,
  grievance,
  onRefresh
}) => {
  const [communications, setCommunications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [showInternal, setShowInternal] = useState(false);

  useEffect(() => {
    if (isOpen && grievance) {
      fetchCommunications();
    }
  }, [isOpen, grievance, showInternal]);

  const fetchCommunications = async () => {
    if (!grievance) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/grievances/${grievance.id}/communications?include_internal=${showInternal}`);
      if (!response.ok) throw new Error('Failed to fetch communications');
      
      const data = await response.json();
      setCommunications(data);
    } catch (error) {
      console.error('Error fetching communications:', error);
      toast.error('Failed to load communications');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !grievance) return;

    // Get current admin user from localStorage
    const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}');
    if (!adminUser.id) {
      toast.error('Admin user not found');
      return;
    }

    setSending(true);
    try {
      const response = await fetch(`/api/admin/grievances/${grievance.id}/communications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender_type: 'admin',
          sender_id: adminUser.id,
          recipient_type: 'student',
          recipient_id: grievance.student_id,
          message: newMessage.trim(),
          communication_type: 'reply',
          is_internal: isInternal
        })
      });

      if (!response.ok) throw new Error('Failed to send message');
      
      const newCommunication = await response.json();
      
      // Add the new communication to the list
      setCommunications(prev => [...prev, newCommunication]);
      setNewMessage('');
      toast.success(isInternal ? 'Internal note added' : 'Reply sent to student');
      
      // Refresh the parent component if callback provided
      if (onRefresh) onRefresh();
      
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      sendMessage();
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (!isOpen || !grievance) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Communication</h2>
              <p className="text-sm text-gray-600">Grievance: {grievance.subject}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowInternal(!showInternal)}
              className={`flex items-center space-x-2 px-3 py-1 rounded-lg text-sm transition-colors ${
                showInternal 
                  ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {showInternal ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{showInternal ? 'Hide Internal' : 'Show Internal'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col h-[calc(90vh-140px)]">
          {/* Communications List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : communications.length > 0 ? (
              communications.map((comm) => (
                <div
                  key={comm.id}
                  className={`flex space-x-3 ${
                    comm.sender_type === 'admin' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div className={`max-w-[70%] ${
                    comm.sender_type === 'admin' ? 'order-2' : 'order-1'
                  }`}>
                    <div className={`p-4 rounded-lg ${
                      comm.sender_type === 'admin'
                        ? comm.is_internal
                          ? 'bg-yellow-100 border border-yellow-300'
                          : 'bg-blue-100 border border-blue-300'
                        : 'bg-gray-100 border border-gray-300'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-medium ${
                            comm.sender_type === 'admin' 
                              ? comm.is_internal ? 'text-yellow-800' : 'text-blue-800'
                              : 'text-gray-800'
                          }`}>
                            {comm.sender_type === 'admin' 
                              ? comm.admin_users?.name || 'Admin'
                              : grievance.students?.student_name || 'Student'
                            }
                          </span>
                          {comm.is_internal && (
                            <span className="px-2 py-1 bg-yellow-200 text-yellow-800 text-xs rounded-full">
                              Internal
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {formatDateTime(comm.created_at)}
                        </span>
                      </div>
                      <p className="text-gray-800 whitespace-pre-wrap">{comm.message}</p>
                    </div>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    comm.sender_type === 'admin' ? 'order-1 bg-blue-200' : 'order-2 bg-gray-200'
                  }`}>
                    {comm.sender_type === 'admin' ? (
                      <User className="w-4 h-4 text-blue-600" />
                    ) : (
                      <User className="w-4 h-4 text-gray-600" />
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No communications yet</h3>
                <p className="text-gray-500">Start the conversation by sending a message below.</p>
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <div className="space-y-4">
              {/* Internal Note Toggle */}
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="isInternal"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                />
                <label htmlFor="isInternal" className="text-sm font-medium text-gray-700">
                  Internal note (not visible to student)
                </label>
                <div className="flex-1" />
                {isInternal ? (
                  <div className="flex items-center space-x-1 text-yellow-600">
                    <EyeOff className="w-4 h-4" />
                    <span className="text-sm">Internal note</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 text-blue-600">
                    <Eye className="w-4 h-4" />
                    <span className="text-sm">Student will see this</span>
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="flex space-x-3">
                <div className="flex-1">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={isInternal ? "Add an internal note..." : "Type your reply to the student..."}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Press Ctrl+Enter to send
                  </p>
                </div>
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sending}
                  className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                    !newMessage.trim() || sending
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : isInternal
                        ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {sending ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{sending ? 'Sending...' : isInternal ? 'Add Note' : 'Send Reply'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default GrievanceCommunicationModal; 