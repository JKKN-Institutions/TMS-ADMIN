'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  RefreshCw,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Calculator,
  CreditCard,
  Calendar,
  FileText,
  User,
  Clock
} from 'lucide-react';
import { studentsData } from '@/data/admin-data';
import toast from 'react-hot-toast';

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any;
  onProcessRefund: (refundData: any) => void;
}

const RefundModal: React.FC<RefundModalProps> = ({
  isOpen,
  onClose,
  payment,
  onProcessRefund
}) => {
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState(payment?.amount || 0);
  const [refundReason, setRefundReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [processingFee, setProcessingFee] = useState(0);
  const [notes, setNotes] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  if (!isOpen || !payment) return null;

  const student = studentsData.find(s => s.id === payment.studentId);

  const refundReasons = [
    'Trip cancelled by operator',
    'Double payment made',
    'System error',
    'Service not provided',
    'Student request - valid reason',
    'Administrative correction',
    'Other (specify below)'
  ];

  const calculateRefundDetails = () => {
    const baseRefund = refundType === 'full' ? payment.amount : refundAmount;
    const feePercentage = 5; // 5% processing fee
    const calculatedFee = Math.round((baseRefund * feePercentage) / 100);
    const actualFee = processingFee || calculatedFee;
    const netRefund = baseRefund - actualFee;
    const processingTime = getProcessingTime();

    return {
      baseRefund,
      processingFee: actualFee,
      netRefund,
      processingTime,
      feePercentage
    };
  };

  const getProcessingTime = () => {
    switch (payment.paymentMethod) {
      case 'upi': return '1-2 hours';
      case 'wallet': return 'Instant';
      case 'card': return '3-5 business days';
      case 'net_banking': return '2-3 business days';
      case 'cash': return 'Manual process - 1 business day';
      default: return '2-3 business days';
    }
  };

  const validateRefund = () => {
    if (refundType === 'partial' && (refundAmount <= 0 || refundAmount > payment.amount)) {
      toast.error('Invalid refund amount');
      return false;
    }

    if (!refundReason) {
      toast.error('Please select a refund reason');
      return false;
    }

    if (refundReason === 'Other (specify below)' && !customReason.trim()) {
      toast.error('Please specify the custom reason');
      return false;
    }

    if (!agreementAccepted) {
      toast.error('Please accept the refund agreement');
      return false;
    }

    return true;
  };

  const handleProcessRefund = () => {
    if (!validateRefund()) return;

    const refundDetails = calculateRefundDetails();
    const refundData = {
      originalPaymentId: payment.id,
      studentId: payment.studentId,
      refundType,
      refundAmount: refundDetails.baseRefund,
      processingFee: refundDetails.processingFee,
      netRefund: refundDetails.netRefund,
      reason: refundReason === 'Other (specify below)' ? customReason : refundReason,
      notes,
      paymentMethod: payment.paymentMethod,
      processingTime: refundDetails.processingTime,
      status: 'pending',
      createdAt: new Date(),
      processedBy: 'current_admin' // This would be actual admin ID
    };

    onProcessRefund(refundData);
    toast.success('Refund initiated successfully!');
    onClose();
  };

  const refundDetails = calculateRefundDetails();

  React.useEffect(() => {
    if (refundType === 'full') {
      setRefundAmount(payment.amount);
    }
  }, [refundType, payment.amount]);

  React.useEffect(() => {
    const calculatedFee = Math.round((refundAmount * 5) / 100);
    setProcessingFee(calculatedFee);
  }, [refundAmount]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Process Refund</h2>
              <p className="text-sm text-gray-600">Original Amount: ₹{payment.amount} • {student?.studentName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-140px)]">
          <div className="p-6 space-y-6">
            {/* Original Payment Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-3 flex items-center space-x-2">
                <CreditCard className="w-5 h-5" />
                <span>Original Payment Details</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">Transaction ID:</span>
                  <p className="font-mono text-blue-900">{payment.transactionId}</p>
                </div>
                <div>
                  <span className="text-blue-700">Payment Method:</span>
                  <p className="font-medium text-blue-900 capitalize">{payment.paymentMethod.replace('_', ' ')}</p>
                </div>
                <div>
                  <span className="text-blue-700">Date:</span>
                  <p className="font-medium text-blue-900">{new Date(payment.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            {/* Refund Type Selection */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Refund Type</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setRefundType('full')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    refundType === 'full' 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium">Full Refund</span>
                  </div>
                  <p className="text-sm text-gray-600">Refund the entire payment amount</p>
                  <p className="text-lg font-bold text-green-600 mt-2">₹{payment.amount}</p>
                </button>

                <button
                  onClick={() => setRefundType('partial')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    refundType === 'partial' 
                      ? 'border-orange-500 bg-orange-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Calculator className="w-5 h-5 text-orange-600" />
                    <span className="font-medium">Partial Refund</span>
                  </div>
                  <p className="text-sm text-gray-600">Refund a specific amount</p>
                  <p className="text-sm text-orange-600 mt-2">Custom amount</p>
                </button>
              </div>
            </div>

            {/* Partial Refund Amount */}
            {refundType === 'partial' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-orange-900 mb-2">Refund Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(parseInt(e.target.value) || 0)}
                    max={payment.amount}
                    min={1}
                    className="pl-8 w-full px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <p className="text-xs text-orange-700 mt-1">Maximum refundable: ₹{payment.amount}</p>
              </div>
            )}

            {/* Refund Reason */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Refund Reason</h3>
              <div className="space-y-2">
                {refundReasons.map((reason) => (
                  <label key={reason} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="radio"
                      value={reason}
                      checked={refundReason === reason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm">{reason}</span>
                  </label>
                ))}
              </div>

              {refundReason === 'Other (specify below)' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Custom Reason</label>
                  <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Please specify the reason for refund..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                  />
                </div>
              )}
            </div>

            {/* Processing Fee */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-900 mb-3">Processing Fee Configuration</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-yellow-900 mb-2">Processing Fee</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                    <input
                      type="number"
                      value={processingFee}
                      onChange={(e) => setProcessingFee(parseInt(e.target.value) || 0)}
                      className="pl-8 w-full px-3 py-2 border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                  <p className="text-xs text-yellow-700 mt-1">Suggested: 5% of refund amount</p>
                </div>
                <div className="flex items-center">
                  <div className="text-center">
                    <p className="text-sm text-yellow-700">Processing Time</p>
                    <p className="font-medium text-yellow-900">{refundDetails.processingTime}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Refund Calculation */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-4 flex items-center space-x-2">
                <Calculator className="w-5 h-5" />
                <span>Refund Calculation</span>
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Refund Amount:</span>
                  <span className="font-medium">₹{refundDetails.baseRefund}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Processing Fee (5%):</span>
                  <span className="font-medium text-red-600">-₹{refundDetails.processingFee}</span>
                </div>
                <div className="border-t border-gray-300 pt-3 flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Net Refund:</span>
                  <span className="text-xl font-bold text-green-600">₹{refundDetails.netRefund}</span>
                </div>
              </div>
            </div>

            {/* Additional Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Additional Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional information about this refund..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
              />
            </div>

            {/* Refund Agreement */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-red-900 mb-2">Refund Agreement</h4>
                  <div className="text-sm text-red-800 space-y-1">
                    <p>• This refund will be processed to the original payment method</p>
                    <p>• Processing fee of ₹{refundDetails.processingFee} will be deducted</p>
                    <p>• Refund processing time: {refundDetails.processingTime}</p>
                    <p>• This action cannot be undone once processed</p>
                  </div>
                  <label className="flex items-center space-x-2 mt-3">
                    <input
                      type="checkbox"
                      checked={agreementAccepted}
                      onChange={(e) => setAgreementAccepted(e.target.checked)}
                      className="text-red-600"
                    />
                    <span className="text-sm font-medium text-red-900">I acknowledge and accept the refund terms</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleProcessRefund}
              disabled={!agreementAccepted}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Process Refund (₹{refundDetails.netRefund})</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default RefundModal; 