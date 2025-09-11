'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  User,
  CreditCard,
  Calendar,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Receipt,
  Phone,
  Mail,
  MapPin,
  Edit,
  Ban,
  Eye,
  Download
} from 'lucide-react';
import { studentsData } from '@/data/admin-data';
import PaymentReceiptModal from './payment-receipt-modal';

interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any;
  onRefund?: (payment: any) => void;
  onApprove?: (payment: any) => void;
  onReject?: (payment: any) => void;
  onEdit?: (payment: any) => void;
  userRole: string;
}

const PaymentDetailsModal: React.FC<PaymentDetailsModalProps> = ({
  isOpen,
  onClose,
  payment,
  onRefund,
  onApprove,
  onReject,
  onEdit,
  userRole
}) => {
  const [showReceipt, setShowReceipt] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  if (!isOpen || !payment) return null;

  const student = studentsData.find(s => s.id === payment.studentId);
  const canRefund = ['super_admin', 'finance_admin'].includes(userRole) && payment.status === 'completed';
  const canApprove = ['super_admin', 'finance_admin'].includes(userRole) && payment.status === 'pending';
  const canEdit = ['super_admin', 'finance_admin'].includes(userRole) && payment.status !== 'completed';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-700 bg-green-100 border-green-200';
      case 'pending': return 'text-yellow-700 bg-yellow-100 border-yellow-200';
      case 'failed': return 'text-red-700 bg-red-100 border-red-200';
      case 'refunded': return 'text-blue-700 bg-blue-100 border-blue-200';
      default: return 'text-gray-700 bg-gray-100 border-gray-200';
    }
  };

  const getPaymentTypeColor = (type: string) => {
    switch (type) {
      case 'trip_fare': return 'text-blue-700 bg-blue-100';
      case 'fine': return 'text-red-700 bg-red-100';
      case 'semester_fee': return 'text-green-700 bg-green-100';
      case 'registration': return 'text-purple-700 bg-purple-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'pending': return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-600" />;
      case 'refunded': return <RefreshCw className="w-5 h-5 text-blue-600" />;
      default: return <AlertTriangle className="w-5 h-5 text-gray-600" />;
    }
  };

  const tabs = [
    { id: 'details', label: 'Payment Details', icon: FileText },
    { id: 'student', label: 'Student Info', icon: User },
    { id: 'history', label: 'Transaction History', icon: Calendar }
  ];

  const mockTransactionHistory = [
    { date: payment.createdAt, action: 'Payment Initiated', status: 'pending', amount: payment.amount },
    { date: new Date(Date.now() - 3600000), action: 'Payment Processing', status: 'processing', amount: payment.amount },
    { date: new Date(), action: 'Payment Completed', status: payment.status, amount: payment.amount }
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
                <p className="text-sm text-gray-600">ID: {payment.id} • {new Date(payment.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className={`px-3 py-1 rounded-full border flex items-center space-x-2 ${getStatusColor(payment.status)}`}>
                {getStatusIcon(payment.status)}
                <span className="text-sm font-medium capitalize">{payment.status}</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 bg-gray-50">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(95vh-200px)] p-6">
            {activeTab === 'details' && (
              <div className="space-y-6">
                {/* Payment Overview */}
                <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 border border-green-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Payment Overview</h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPaymentTypeColor(payment.paymentType)}`}>
                      {payment.paymentType.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-green-600">₹{payment.amount.toLocaleString()}</p>
                      <p className="text-sm text-gray-600">Amount</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900 capitalize">{payment.paymentMethod.replace('_', ' ')}</p>
                      <p className="text-sm text-gray-600">Payment Method</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-gray-900">{new Date(payment.createdAt).toLocaleDateString()}</p>
                      <p className="text-sm text-gray-600">Transaction Date</p>
                    </div>
                  </div>
                </div>

                {/* Payment Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                      <CreditCard className="w-5 h-5 text-blue-600" />
                      <span>Transaction Information</span>
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Transaction ID:</span>
                        <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">{payment.transactionId || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Payment Gateway:</span>
                        <span className="text-sm font-medium">{payment.paymentMethod === 'upi' ? 'UPI Gateway' : payment.paymentMethod === 'card' ? 'Card Gateway' : 'Direct'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Processing Fee:</span>
                        <span className="text-sm font-medium">₹{Math.round(payment.amount * 0.02)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Net Amount:</span>
                        <span className="text-sm font-bold text-green-600">₹{payment.amount - Math.round(payment.amount * 0.02)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                      <FileText className="w-5 h-5 text-purple-600" />
                      <span>Payment Details</span>
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm text-gray-600">Description:</span>
                        <p className="text-sm font-medium mt-1 bg-gray-50 p-2 rounded">{payment.description}</p>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Reference:</span>
                        <span className="text-sm font-medium">{payment.bookingId || 'Direct Payment'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Category:</span>
                        <span className="text-sm font-medium capitalize">{payment.paymentType.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Timeline */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    <span>Payment Timeline</span>
                  </h4>
                  <div className="space-y-4">
                    {mockTransactionHistory.map((event, index) => (
                      <div key={index} className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${index === mockTransactionHistory.length - 1 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-900">{event.action}</span>
                            <span className="text-sm text-gray-500">{new Date(event.date).toLocaleString()}</span>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(event.status)}`}>
                            {event.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'student' && student && (
              <div className="space-y-6">
                {/* Student Profile */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                      <User className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{student.studentName}</h3>
                      <p className="text-blue-600 font-medium">{student.rollNumber}</p>
                    </div>
                  </div>
                </div>

                {/* Student Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-medium text-gray-900 mb-4">Personal Information</h4>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{student.email}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{student.mobile || 'Not provided'}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{student.department?.departmentName || 'Not provided'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-medium text-gray-900 mb-4">Transport Information</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Transport Status:</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${student.transportProfile?.transportStatus === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {student.transportProfile?.transportStatus || 'inactive'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Payment Status:</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${student.transportProfile?.paymentStatus === 'current' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {student.transportProfile?.paymentStatus || 'unknown'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Outstanding Amount:</span>
                        <span className="text-sm font-bold text-red-600">₹{student.transportProfile?.outstandingAmount || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium text-gray-900 mb-4">Transaction History</h4>
                  <div className="space-y-4">
                    {mockTransactionHistory.map((event, index) => (
                      <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className={`w-2 h-2 rounded-full ${index === mockTransactionHistory.length - 1 ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                          <div>
                            <p className="font-medium text-gray-900">{event.action}</p>
                            <p className="text-sm text-gray-600">{new Date(event.date).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(event.status)}`}>
                            {event.status}
                          </span>
                          <p className="text-sm font-medium mt-1">₹{event.amount}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <div className="flex justify-between items-center">
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowReceipt(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <Receipt className="w-4 h-4" />
                  <span>View Receipt</span>
                </button>
                <button
                  onClick={() => {/* Download logic */}}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
              </div>

              <div className="flex space-x-2">
                {canEdit && (
                  <button
                    onClick={() => onEdit && onEdit(payment)}
                    className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center space-x-2"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                )}
                {canApprove && (
                  <>
                    <button
                      onClick={() => onApprove && onApprove(payment)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => onReject && onReject(payment)}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </>
                )}
                {canRefund && (
                  <button
                    onClick={() => onRefund && onRefund(payment)}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Refund</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Receipt Modal */}
      <PaymentReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        payment={payment}
      />
    </>
  );
};

export default PaymentDetailsModal; 