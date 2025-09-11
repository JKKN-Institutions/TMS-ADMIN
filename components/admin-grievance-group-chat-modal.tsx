'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Send, MessageCircle, User, Clock, CheckCircle, Users, Shield, UserCheck, Paperclip, Phone, Video, Building, GraduationCap } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

interface AdminGroupChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  grievance: any;
  currentAdminId: string;
  currentAdminName: string;
}

interface ChatMessage {
  id: string;
  message: string;
  sender_type: 'admin' | 'student';
  sender_id: string;
  communication_type: string;
  read_at?: string;
  created_at: string;
  attachments?: string[];
}

interface ChatParticipant {
  id: string;
  name: string;
  type: 'student' | 'admin';
  role?: string;
  email: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export default function AdminGrievanceGroupChatModal({ 
  isOpen, 
  onClose, 
  grievance,
  currentAdminId,
  currentAdminName
}: AdminGroupChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showParticipants, setShowParticipants] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && grievance) {
      fetchChatData();
      const interval = setInterval(fetchMessages, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [isOpen, grievance]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchChatData = async () => {
    await Promise.all([
      fetchMessages(),
      fetchParticipants()
    ]);
  };

  const fetchMessages = async () => {
    if (!grievance) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/grievances/${grievance.id}/communications`);
      
      if (!response.ok) throw new Error('Failed to fetch messages');
      
      const data = await response.json();
      setMessages(data);
      
      // Mark unread student messages as read
      const unreadMessages = data.filter(
        (msg: ChatMessage) => msg.sender_type === 'student' && !msg.read_at
      );
      
      for (const msg of unreadMessages) {
        await markAsRead(msg.id);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchParticipants = async () => {
    if (!grievance) return;
    
    try {
      // Build participants list from grievance data
      const participantsList: ChatParticipant[] = [];
      
      // Add student
      if (grievance.students) {
        participantsList.push({
          id: grievance.students.id,
          name: grievance.students.student_name,
          type: 'student',
          email: grievance.students.email,
          isOnline: Math.random() > 0.5 // Simulate online status
        });
      }
      
      // Add current admin
      participantsList.push({
        id: currentAdminId,
        name: currentAdminName,
        type: 'admin',
        role: 'Admin',
        email: '',
        isOnline: true
      });
      
      // Add assigned admin if different from current
      if (grievance.admin_users && grievance.admin_users.id !== currentAdminId) {
        participantsList.push({
          id: grievance.admin_users.id,
          name: grievance.admin_users.name,
          type: 'admin',
          role: grievance.admin_users.role,
          email: grievance.admin_users.email,
          isOnline: Math.random() > 0.5 // Simulate online status
        });
      }
      
      setParticipants(participantsList);
    } catch (error) {
      console.error('Error fetching participants:', error);
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      await fetch(`/api/admin/grievances/${grievance.id}/communications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          communication_id: messageId,
          read_by: currentAdminId
        })
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !grievance) return;
    
    setIsSending(true);
    try {
      // Determine recipient (student is primary recipient)
      const studentId = grievance.students?.id || grievance.student_id;
      
      const response = await fetch(`/api/admin/grievances/${grievance.id}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: currentAdminId,
          sender_type: 'admin',
          recipient_id: studentId,
          recipient_type: 'student',
          message: newMessage.trim(),
          communication_type: 'group_message',
          is_internal: false
        })
      });
      
      if (!response.ok) throw new Error('Failed to send message');
      
      const newMsg = await response.json();
      setMessages(prev => [...prev, newMsg]);
      setNewMessage('');
      toast.success('Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const getMessageSenderInfo = (message: ChatMessage) => {
    if (message.sender_type === 'student') {
      // For students, use grievance data to get student info
      const studentName = grievance?.students?.student_name || 'Student';
      const rollNumber = grievance?.students?.roll_number || '';
      return {
        name: studentName,
        role: `Student • ${rollNumber}`,
        avatar: studentName.charAt(0) || 'S',
        isCurrentUser: false
      };
    } else {
      // For admins, use current admin info or generic admin
      const adminName = message.sender_id === currentAdminId ? currentAdminName : 'Admin';
      return {
        name: adminName,
        role: 'Admin',
        avatar: adminName.charAt(0) || 'A',
        isCurrentUser: message.sender_id === currentAdminId
      };
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const senderInfo = getMessageSenderInfo(message);
    
    return (
      <div
        key={message.id}
        className={`flex ${senderInfo.isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}
      >
        <div className={`max-w-xs lg:max-w-md ${senderInfo.isCurrentUser ? 'order-2' : 'order-1'}`}>
          <div
            className={`px-4 py-3 rounded-lg ${
              senderInfo.isCurrentUser
                ? 'bg-blue-600 text-white'
                : message.sender_type === 'admin'
                ? 'bg-green-100 text-gray-900'
                : 'bg-gray-100 text-gray-900'
            }`}
          >
            <p className="text-sm">{message.message}</p>
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {message.attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center space-x-1 text-xs opacity-75">
                    <Paperclip className="w-3 h-3" />
                    <span>{attachment}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={`mt-1 text-xs text-gray-500 ${senderInfo.isCurrentUser ? 'text-right' : 'text-left'}`}>
            <span className="font-medium">
              {senderInfo.isCurrentUser ? 'You' : senderInfo.name}
            </span>
            {!senderInfo.isCurrentUser && (
              <span className="ml-1 text-gray-400">
                ({senderInfo.role})
              </span>
            )}
            <span className="ml-2">{formatDate(message.created_at)}</span>
          </div>
        </div>
        
        <div className={`flex-shrink-0 ${senderInfo.isCurrentUser ? 'order-1 mr-2' : 'order-2 ml-2'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
            senderInfo.isCurrentUser ? 'bg-blue-500' : 
            message.sender_type === 'admin' ? 'bg-green-500' : 'bg-gray-500'
          }`}>
            {senderInfo.avatar}
          </div>
        </div>
      </div>
    );
  };

  const renderParticipant = (participant: ChatParticipant) => (
    <div key={participant.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg">
      <div className="relative">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
          participant.type === 'admin' ? 'bg-green-500' : 'bg-blue-500'
        }`}>
          {participant.name.charAt(0)}
        </div>
        {participant.isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{participant.name}</p>
        <p className="text-xs text-gray-500 truncate">
          {participant.type === 'admin' ? 
            participant.role?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 
            'Student'
          }
        </p>
      </div>
      <div className="flex items-center space-x-1">
        {participant.type === 'admin' ? (
          <Shield className="w-4 h-4 text-green-600" />
        ) : (
          <GraduationCap className="w-4 h-4 text-blue-600" />
        )}
        {participant.isOnline ? (
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-xs text-green-600">Online</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">Offline</span>
        )}
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[80vh] flex overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <MessageCircle className="w-6 h-6 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Grievance Discussion
                </h2>
                <p className="text-sm text-gray-500">
                  {grievance?.subject} • {participants.length} participants
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Toggle participants"
              >
                <Users className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">No messages yet</p>
                <p className="text-sm text-gray-400">
                  Start the conversation with the student about this grievance
                </p>
              </div>
            ) : (
              <>
                {messages.map(renderMessage)}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Message Input */}
          <div className="border-t border-gray-200 p-4">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || isSending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
              >
                {isSending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>

        {/* Participants Sidebar */}
        {showParticipants && (
          <div className="w-80 border-l border-gray-200 bg-gray-50">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Participants</h3>
              <p className="text-sm text-gray-500">{participants.length} members</p>
            </div>
            <div className="p-4 space-y-2">
              {participants.map(renderParticipant)}
            </div>
            
            {/* Grievance Info */}
            <div className="p-4 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Grievance Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    grievance?.status === 'resolved' ? 'bg-green-100 text-green-800' :
                    grievance?.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {grievance?.status?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Priority:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    grievance?.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                    grievance?.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                    grievance?.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {grievance?.priority?.replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span className="text-gray-900">{formatDate(grievance?.created_at)}</span>
                </div>
                {grievance?.students && (
                  <div className="mt-3 p-2 bg-blue-50 rounded-lg">
                    <p className="text-xs font-medium text-blue-900 mb-1">Student Details</p>
                    <p className="text-sm text-blue-800">{grievance.students.student_name}</p>
                    <p className="text-xs text-blue-600">{grievance.students.roll_number}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 