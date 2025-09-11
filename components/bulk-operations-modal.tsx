'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Users,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Eye,
  CreditCard,
  Calendar,
  Filter
} from 'lucide-react';

interface BulkOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPayments: any[];
  onBulkAction: (action: string, data: any) => void;
}

const BulkOperationsModal: React.FC<BulkOperationsModalProps> = ({
  isOpen,
  onClose,
  selectedPayments,
  onBulkAction
}) => {
  const [selectedAction, setSelectedAction] = useState('');
  const [statusUpdate, setStatusUpdate] = useState('');
  const [processing, setProcessing] = useState(false);

  if (!isOpen) return null;

  const bulkActions = [
    { 
      id: 'approve', 
      label: 'Approve Payments', 
      icon: CheckCircle, 
      color: 'green',
      description: 'Approve all selected pending payments'
    },
    { 
      id: 'reject', 
      label: 'Reject Payments', 
      icon: XCircle, 
      color: 'red',
      description: 'Reject all selected pending payments'
    },
    { 
      id: 'refund', 
      label: 'Process Refunds', 
      icon: RefreshCw, 
      color: 'purple',
      description: 'Process refunds for all selected completed payments'
    },
    { 
      id: 'update_status', 
      label: 'Update Status', 
      icon: AlertTriangle, 
      color: 'orange',
      description: 'Update status for all selected payments'
    }
  ];

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'refunded', label: 'Refunded' }
  ];

  const handleExecuteBulkAction = async () => {
    if (!selectedAction) return;

    setProcessing(true);
    
    try {
      const actionData = {
        action: selectedAction,
        data: selectedAction === 'update_status' ? { statusUpdate } : {}
      };
      
      await onBulkAction(selectedAction, actionData);
      
      // Close modal after successful action
      setTimeout(() => {
        setProcessing(false);
        onClose();
        setSelectedAction('');
        setStatusUpdate('');
      }, 1000);
    } catch (error) {
      setProcessing(false);
      console.error('Bulk action failed:', error);
    }
  };

  const getActionColor = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100';
      case 'red': return 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100';
      case 'purple': return 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100';
      case 'orange': return 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100';
      default: return 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100';
    }
  };

  const getTotalAmount = () => {
    return selectedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Bulk Operations</h2>
              <p className="text-sm text-gray-600">{selectedPayments.length} payments selected</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Selection Summary */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-blue-900">Selected Payments Summary</span>
              <span className="text-sm text-blue-700">{selectedPayments.length} items</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-700">Total Amount:</span>
                <span className="font-bold text-blue-900 ml-2">₹{getTotalAmount().toLocaleString()}</span>
              </div>
              <div>
                <span className="text-blue-700">Status Distribution:</span>
                <div className="flex space-x-2 mt-1">
                  {['pending', 'completed', 'failed'].map(status => {
                    const count = selectedPayments.filter(p => p.status === status).length;
                    if (count > 0) {
                      return (
                        <span key={status} className="bg-blue-200 text-blue-800 px-2 py-1 rounded text-xs">
                          {status}: {count}
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 mb-3">Select Bulk Action</h3>
            <div className="grid grid-cols-1 gap-3">
              {bulkActions.map((action) => {
                const Icon = action.icon;
                const isSelected = selectedAction === action.id;
                return (
                  <button
                    key={action.id}
                    onClick={() => setSelectedAction(action.id)}
                    className={`p-4 border-2 rounded-lg text-left transition-all ${
                      isSelected 
                        ? `${getActionColor(action.color)} border-current` 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5" />
                      <div>
                        <p className="font-medium">{action.label}</p>
                        <p className="text-sm text-gray-600">{action.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Status Update Options */}
            {selectedAction === 'update_status' && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select New Status
                </label>
                <select
                  value={statusUpdate}
                  onChange={(e) => setStatusUpdate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose status...</option>
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Warning Message */}
          {selectedAction && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">Warning</p>
                  <p className="text-sm text-yellow-700">
                    This action will be applied to all {selectedPayments.length} selected payments. 
                    This operation cannot be undone.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between items-center">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExecuteBulkAction}
              disabled={!selectedAction || processing || (selectedAction === 'update_status' && !statusUpdate)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {processing ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </motion.div>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Execute Action</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default BulkOperationsModal;