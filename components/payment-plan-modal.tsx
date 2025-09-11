'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Calendar,
  Calculator,
  DollarSign,
  User,
  AlertTriangle,
  CheckCircle,
  CreditCard,
  FileText,
  Plus,
  Trash2
} from 'lucide-react';
import { studentsData } from '@/data/admin-data';
import toast from 'react-hot-toast';

interface PaymentPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  outstandingDue: any;
  onSave: (planData: any) => void;
}

interface InstallmentPlan {
  id: string;
  amount: number;
  dueDate: string;
  description: string;
}

const PaymentPlanModal: React.FC<PaymentPlanModalProps> = ({
  isOpen,
  onClose,
  outstandingDue,
  onSave
}) => {
  const [planType, setPlanType] = useState<'custom' | 'auto'>('auto');
  const [installments, setInstallments] = useState<InstallmentPlan[]>([]);
  const [autoSettings, setAutoSettings] = useState({
    numberOfInstallments: 3,
    frequency: 'monthly', // weekly, monthly, biweekly
    startDate: new Date().toISOString().split('T')[0],
    lateFeePercentage: 2
  });

  if (!isOpen || !outstandingDue) return null;

  const student = studentsData.find(s => s.id === outstandingDue.studentId);
  const totalAmount = outstandingDue.totalOutstanding;

  const generateAutoInstallments = () => {
    const { numberOfInstallments, frequency, startDate, lateFeePercentage } = autoSettings;
    const baseAmount = Math.floor(totalAmount / numberOfInstallments);
    const remainder = totalAmount - (baseAmount * numberOfInstallments);
    
    const newInstallments: InstallmentPlan[] = [];
    let currentDate = new Date(startDate);

    for (let i = 0; i < numberOfInstallments; i++) {
      const amount = i === numberOfInstallments - 1 ? baseAmount + remainder : baseAmount;
      
      newInstallments.push({
        id: `installment_${i + 1}`,
        amount,
        dueDate: currentDate.toISOString().split('T')[0],
        description: `Installment ${i + 1} of ${numberOfInstallments}`
      });

      // Calculate next due date
      if (frequency === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (frequency === 'biweekly') {
        currentDate.setDate(currentDate.getDate() + 14);
      } else { // monthly
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    setInstallments(newInstallments);
  };

  const addCustomInstallment = () => {
    const newInstallment: InstallmentPlan = {
      id: `custom_${Date.now()}`,
      amount: 0,
      dueDate: new Date().toISOString().split('T')[0],
      description: `Custom installment ${installments.length + 1}`
    };
    setInstallments([...installments, newInstallment]);
  };

  const updateInstallment = (id: string, field: keyof InstallmentPlan, value: string | number) => {
    setInstallments(installments.map(inst => 
      inst.id === id ? { ...inst, [field]: value } : inst
    ));
  };

  const removeInstallment = (id: string) => {
    setInstallments(installments.filter(inst => inst.id !== id));
  };

  const calculateTotalPlanned = () => {
    return installments.reduce((sum, inst) => sum + inst.amount, 0);
  };

  const validatePlan = () => {
    if (installments.length === 0) {
      toast.error('Please add at least one installment');
      return false;
    }

    const totalPlanned = calculateTotalPlanned();
    if (Math.abs(totalPlanned - totalAmount) > 1) {
      toast.error(`Total planned amount (₹${totalPlanned}) must equal outstanding amount (₹${totalAmount})`);
      return false;
    }

    // Check for past dates
    const today = new Date().toISOString().split('T')[0];
    const pastDates = installments.filter(inst => inst.dueDate < today);
    if (pastDates.length > 0) {
      toast.error('Due dates cannot be in the past');
      return false;
    }

    // Check for zero amounts
    const zeroAmounts = installments.filter(inst => inst.amount <= 0);
    if (zeroAmounts.length > 0) {
      toast.error('All installment amounts must be greater than zero');
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validatePlan()) return;

    const planData = {
      studentId: outstandingDue.studentId,
      totalAmount,
      installments,
      planType,
      autoSettings: planType === 'auto' ? autoSettings : null,
      createdAt: new Date(),
      status: 'active'
    };

    onSave(planData);
    toast.success('Payment plan created successfully!');
    onClose();
  };

  React.useEffect(() => {
    if (planType === 'auto') {
      generateAutoInstallments();
    }
  }, [planType, autoSettings, totalAmount]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Create Payment Plan</h2>
              <p className="text-sm text-gray-600">{student?.studentName} • Outstanding: ₹{totalAmount}</p>
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
            {/* Outstanding Breakdown */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-medium text-red-900 mb-3 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Outstanding Amount Breakdown</span>
              </h3>
              <div className="space-y-2">
                {outstandingDue.breakdown.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-red-700 capitalize">{item.type.replace('_', ' ')}</span>
                    <span className="font-medium text-red-900">₹{item.amount}</span>
                  </div>
                ))}
                <div className="border-t border-red-200 pt-2 flex justify-between items-center">
                  <span className="font-semibold text-red-900">Total Outstanding:</span>
                  <span className="font-bold text-lg text-red-900">₹{totalAmount}</span>
                </div>
              </div>
            </div>

            {/* Plan Type Selection */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Payment Plan Type</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => setPlanType('auto')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    planType === 'auto' 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Calculator className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">Auto-Generated Plan</span>
                  </div>
                  <p className="text-sm text-gray-600">Automatically divide the amount into equal installments</p>
                </button>

                <button
                  onClick={() => setPlanType('custom')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    planType === 'custom' 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <FileText className="w-5 h-5 text-purple-600" />
                    <span className="font-medium">Custom Plan</span>
                  </div>
                  <p className="text-sm text-gray-600">Manually configure installment amounts and dates</p>
                </button>
              </div>
            </div>

            {/* Auto Plan Settings */}
            {planType === 'auto' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-4">Auto Plan Configuration</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Installments</label>
                    <select
                      value={autoSettings.numberOfInstallments}
                      onChange={(e) => setAutoSettings({
                        ...autoSettings,
                        numberOfInstallments: parseInt(e.target.value)
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={2}>2 Installments</option>
                      <option value={3}>3 Installments</option>
                      <option value={4}>4 Installments</option>
                      <option value={6}>6 Installments</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Frequency</label>
                    <select
                      value={autoSettings.frequency}
                      onChange={(e) => setAutoSettings({
                        ...autoSettings,
                        frequency: e.target.value
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={autoSettings.startDate}
                      onChange={(e) => setAutoSettings({
                        ...autoSettings,
                        startDate: e.target.value
                      })}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Late Fee (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={autoSettings.lateFeePercentage}
                      onChange={(e) => setAutoSettings({
                        ...autoSettings,
                        lateFeePercentage: parseFloat(e.target.value)
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Installments List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-medium text-gray-900">Payment Schedule</h3>
                {planType === 'custom' && (
                  <button
                    onClick={addCustomInstallment}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Installment</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {installments.map((installment, index) => (
                  <div key={installment.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Installment {index + 1}
                        </label>
                        <input
                          type="text"
                          value={installment.description}
                          onChange={(e) => updateInstallment(installment.id, 'description', e.target.value)}
                          placeholder="Description"
                          disabled={planType === 'auto'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                          <input
                            type="number"
                            value={installment.amount}
                            onChange={(e) => updateInstallment(installment.id, 'amount', parseInt(e.target.value) || 0)}
                            disabled={planType === 'auto'}
                            className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                        <input
                          type="date"
                          value={installment.dueDate}
                          onChange={(e) => updateInstallment(installment.id, 'dueDate', e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          disabled={planType === 'auto'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        {planType === 'custom' && (
                          <button
                            onClick={() => removeInstallment(installment.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-gray-600">Total Installments</p>
                    <p className="text-xl font-bold text-gray-900">{installments.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Planned Amount</p>
                    <p className="text-xl font-bold text-blue-600">₹{calculateTotalPlanned()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Difference</p>
                    <p className={`text-xl font-bold ${
                      Math.abs(calculateTotalPlanned() - totalAmount) <= 1 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      ₹{calculateTotalPlanned() - totalAmount}
                    </p>
                  </div>
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
              onClick={handleSave}
              className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Create Payment Plan</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PaymentPlanModal; 