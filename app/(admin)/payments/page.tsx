'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Eye,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Filter,
  Download,
  Receipt,
  RefreshCw,
  Settings,
  BarChart3,
  Users,
  FileText,
  Calendar,
  Percent,
  Bell,
  Send,
  ArrowRight,
  ArrowLeft,
  Calculator,
  Target,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  X,
  Phone
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DatabaseService } from '@/lib/database';
import PaymentReceiptModal from '@/components/payment-receipt-modal';
import PaymentDetailsModal from '@/components/payment-details-modal';
import PaymentPlanModal from '@/components/payment-plan-modal';
import RefundModal from '@/components/refund-modal';
import RecordPaymentModal from '@/components/record-payment-modal';
import BulkOperationsModal from '@/components/bulk-operations-modal';
import SemesterFeeManagement from '@/components/semester-fee-management';

// PaymentCard component will be defined inside PaymentsPage component

const OutstandingDuesCard = ({ due, onPaymentPlan, onSendReminder, userRole }: any) => {
  const canManage = ['super_admin', 'finance_admin'].includes(userRole);
  
  // Calculate overdue days for the oldest pending payment
  const oldestOverdueDays = due.termBreakdown?.reduce((max: number, term: any) => {
    if (term.overdueDays > max) return term.overdueDays;
    return max;
  }, 0) || 0;
  
  const getUrgencyColor = (days: number) => {
    if (days >= 30) return 'from-red-600 to-red-700';
    if (days >= 15) return 'from-orange-500 to-red-500';
    if (days >= 7) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-orange-600';
  };
  
  const getUrgencyBadge = (days: number) => {
    if (days >= 30) return { text: 'Critical', color: 'bg-red-100 text-red-800' };
    if (days >= 15) return { text: 'High', color: 'bg-orange-100 text-orange-800' };
    if (days >= 7) return { text: 'Medium', color: 'bg-yellow-100 text-yellow-800' };
    return { text: 'Low', color: 'bg-gray-100 text-gray-800' };
  };

  const urgencyBadge = getUrgencyBadge(oldestOverdueDays);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-red-200 p-6 hover:shadow-md transition-shadow"
    >
      {/* Header Section */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-12 h-12 bg-gradient-to-r ${getUrgencyColor(oldestOverdueDays)} rounded-full flex items-center justify-center`}>
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{due.studentName}</h3>
                <p className="text-sm text-gray-600">{due.rollNumber}</p>
                {due.department && (
                  <p className="text-xs text-gray-500 mt-1">{due.department}</p>
                )}
              </div>
              <div className="ml-4">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${urgencyBadge.color}`}>
                  {urgencyBadge.text} Priority
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xl font-bold text-red-600">₹{due.totalOutstanding?.toLocaleString() || 0}</span>
          <p className="text-xs text-gray-500">Total Outstanding</p>
          {oldestOverdueDays > 0 && (
            <p className="text-xs text-red-500 font-medium">{oldestOverdueDays} days overdue</p>
          )}
        </div>
      </div>

      {/* Student Details */}
      <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
        <div>
          <p className="text-xs text-gray-500">Academic Year</p>
          <p className="text-sm font-medium">{due.academicYear || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Contact</p>
          <p className="text-sm font-medium truncate">{due.contact || 'N/A'}</p>
        </div>
      </div>

      {/* Term-wise Breakdown */}
      <div className="space-y-2 mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Outstanding by Term:</h4>
        {due.termBreakdown?.length > 0 ? (
          due.termBreakdown.map((term: any, index: number) => (
            <div key={index} className="flex justify-between items-center text-sm p-2 bg-red-50 rounded">
              <div>
                <span className="font-medium text-gray-700">
                  {term.academicYear} - Term {term.semester}
                </span>
                {term.overdueDays > 0 && (
                  <span className="text-xs text-red-600 ml-2">({term.overdueDays} days overdue)</span>
                )}
              </div>
              <div className="text-right">
                <span className="font-semibold text-red-600">₹{term.amount?.toLocaleString() || 0}</span>
                <p className="text-xs text-gray-500 capitalize">{term.status}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-gray-500 italic">No detailed breakdown available</div>
        )}
      </div>

      {/* Action Buttons */}
      {canManage && (
        <div className="flex space-x-2 pt-4 border-t border-gray-100">
          <button
            onClick={() => onSendReminder(due)}
            className="flex-1 bg-orange-50 text-orange-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors flex items-center justify-center space-x-1"
          >
            <Send className="w-4 h-4" />
            <span>Send Reminder</span>
          </button>
          <button
            onClick={() => onPaymentPlan(due)}
            className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1"
          >
            <Calculator className="w-4 h-4" />
            <span>Payment Plan</span>
          </button>
          <button
            onClick={() => window.open(`tel:${due.contact}`, '_self')}
            className="flex-1 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors flex items-center justify-center space-x-1"
            disabled={!due.contact}
          >
            <Phone className="w-4 h-4" />
            <span>Call</span>
          </button>
        </div>
      )}
    </motion.div>
  );
};

const PaymentSettingsModal = ({ isOpen, onClose, settings, onSave }: any) => {
  const [activeSection, setActiveSection] = useState('fees');
  const [formData, setFormData] = useState(settings);

  const sections = [
    { id: 'fees', label: 'Fee Structure', icon: DollarSign },
    { id: 'methods', label: 'Payment Methods', icon: CreditCard },
    { id: 'refunds', label: 'Refund Policy', icon: RefreshCw },
    { id: 'fines', label: 'Fine Settings', icon: AlertTriangle },
    { id: 'plans', label: 'Payment Plans', icon: Calendar },
    { id: 'notifications', label: 'Notifications', icon: Bell }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Mobile Section Selector */}
        <div className="block lg:hidden border-b border-gray-200 p-4">
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
            className="w-full input"
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Desktop Sidebar */}
          <div className="hidden lg:block w-1/4 bg-gray-50 border-r border-gray-200 p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Settings</h3>
            <nav className="space-y-2">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeSection === section.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 p-4 lg:p-6 overflow-y-auto min-h-0">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {sections.find(s => s.id === activeSection)?.label} Settings
              </h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Fee Structure */}
            {activeSection === 'fees' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Registration Fee</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">â‚¹</span>
                      <input
                        type="number"
                        value={formData.feeStructure.registrationFee}
                        onChange={(e) => setFormData({
                          ...formData,
                          feeStructure: {
                            ...formData.feeStructure,
                            registrationFee: parseInt(e.target.value)
                          }
                        })}
                        className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Term Fee Base</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">â‚¹</span>
                      <input
                        type="number"
                        value={formData.feeStructure.semesterFeeBase}
                        onChange={(e) => setFormData({
                          ...formData,
                          feeStructure: {
                            ...formData.feeStructure,
                            semesterFeeBase: parseInt(e.target.value)
                          }
                        })}
                        // Note: Internal property names kept for compatibility
                        className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-3">Fine Rates</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(formData.feeStructure.fineRates).map(([key, value]) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase())}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">â‚¹</span>
                          <input
                            type="number"
                            value={value as number}
                            onChange={(e) => setFormData({
                              ...formData,
                              feeStructure: {
                                ...formData.feeStructure,
                                fineRates: {
                                  ...formData.feeStructure.fineRates,
                                  [key]: parseInt(e.target.value)
                                }
                              }
                            })}
                            className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Payment Methods */}
            {activeSection === 'methods' && (
              <div className="space-y-4">
                {Object.entries(formData.paymentMethods).map(([method, config]: [string, any]) => (
                  <div key={method} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <Wallet className="w-5 h-5 text-gray-500" />
                        <span className="font-medium text-gray-900 capitalize">{method.replace('_', ' ')}</span>
                      </div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) => setFormData({
                            ...formData,
                            paymentMethods: {
                              ...formData.paymentMethods,
                              [method]: {
                                ...config,
                                enabled: e.target.checked
                              }
                            }
                          })}
                          className="text-blue-600"
                        />
                        <span className="text-sm text-gray-600">Enabled</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gateway Fee (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={config.gatewayFee}
                          onChange={(e) => setFormData({
                            ...formData,
                            paymentMethods: {
                              ...formData.paymentMethods,
                              [method]: {
                                ...config,
                                gatewayFee: parseFloat(e.target.value)
                              }
                            }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Processing Time</label>
                        <input
                          type="text"
                          value={config.processingTime}
                          onChange={(e) => setFormData({
                            ...formData,
                            paymentMethods: {
                              ...formData.paymentMethods,
                              [method]: {
                                ...config,
                                processingTime: e.target.value
                              }
                            }
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

                         {/* Refund Policy */}
             {activeSection === 'refunds' && (
               <div className="space-y-6">
                 <div className="flex items-center space-x-2 mb-4">
                   <RefreshCw className="w-5 h-5 text-orange-600" />
                   <span className="text-lg font-semibold">Refund Policy Configuration</span>
                 </div>
                 
                 <div className="space-y-4">
                   <label className="flex items-center space-x-2">
                     <input
                       type="checkbox"
                       checked={formData.refundPolicy.allowRefunds}
                       onChange={(e) => setFormData({
                         ...formData,
                         refundPolicy: {
                           ...formData.refundPolicy,
                           allowRefunds: e.target.checked
                         }
                       })}
                       className="w-4 h-4 text-blue-600"
                     />
                     <span className="text-sm font-medium text-gray-700">Allow refunds</span>
                   </label>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div>
                         <label className="block text-sm font-medium text-gray-700 mb-2">Refund Deadline (Days)</label>
                       <input
                         type="number"
                         value={formData.refundPolicy.refundDeadlineDays}
                         onChange={(e) => setFormData({
                           ...formData,
                           refundPolicy: {
                             ...formData.refundPolicy,
                             refundDeadlineDays: parseInt(e.target.value)
                           }
                         })}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         disabled={!formData.refundPolicy.allowRefunds}
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Processing Time (Days)</label>
                       <input
                         type="number"
                         value={formData.refundPolicy.processingTimeDays}
                         onChange={(e) => setFormData({
                           ...formData,
                           refundPolicy: {
                             ...formData.refundPolicy,
                             processingTimeDays: parseInt(e.target.value)
                           }
                         })}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         disabled={!formData.refundPolicy.allowRefunds}
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Refund Fee (%)</label>
                       <input
                         type="number"
                         step="0.5"
                         value={formData.refundPolicy.refundFeePercentage}
                         onChange={(e) => setFormData({
                           ...formData,
                           refundPolicy: {
                             ...formData.refundPolicy,
                             refundFeePercentage: parseFloat(e.target.value)
                           }
                         })}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         disabled={!formData.refundPolicy.allowRefunds}
                       />
                     </div>
                     <div className="flex items-center">
                       <label className="flex items-center space-x-2">
                         <input
                           type="checkbox"
                           checked={formData.refundPolicy.autoRefundEnabled}
                           onChange={(e) => setFormData({
                             ...formData,
                             refundPolicy: {
                               ...formData.refundPolicy,
                               autoRefundEnabled: e.target.checked
                             }
                           })}
                           className="w-4 h-4 text-blue-600"
                           disabled={!formData.refundPolicy.allowRefunds}
                         />
                         <span className="text-sm font-medium text-gray-700">Enable automatic refunds</span>
                       </label>
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {/* Fine Settings */}
             {activeSection === 'fines' && (
               <div className="space-y-6">
                 <div className="flex items-center space-x-2 mb-4">
                   <AlertTriangle className="w-5 h-5 text-red-600" />
                   <span className="text-lg font-semibold">Fine Management Settings</span>
                 </div>
                 
                 <div className="space-y-4">
                   <label className="flex items-center space-x-2">
                     <input
                       type="checkbox"
                       checked={formData.fineSettings.autoFineEnabled}
                       onChange={(e) => setFormData({
                         ...formData,
                         fineSettings: {
                           ...formData.fineSettings,
                           autoFineEnabled: e.target.checked
                         }
                       })}
                       className="w-4 h-4 text-blue-600"
                     />
                     <span className="text-sm font-medium text-gray-700">Enable automatic fines</span>
                   </label>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Grace Period (Hours)</label>
                       <input
                         type="number"
                         value={formData.fineSettings.graceperiodHours}
                         onChange={(e) => setFormData({
                           ...formData,
                           fineSettings: {
                             ...formData.fineSettings,
                             graceperiodHours: parseInt(e.target.value)
                           }
                         })}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Max Fine Amount</label>
                       <div className="relative">
                         <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">â‚¹</span>
                         <input
                           type="number"
                           value={formData.fineSettings.maxFineAmount}
                           onChange={(e) => setFormData({
                             ...formData,
                             fineSettings: {
                               ...formData.fineSettings,
                               maxFineAmount: parseInt(e.target.value)
                             }
                           })}
                           className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         />
                       </div>
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Suspension Threshold</label>
                       <div className="relative">
                         <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">â‚¹</span>
                         <input
                           type="number"
                           value={formData.fineSettings.suspensionThreshold}
                           onChange={(e) => setFormData({
                             ...formData,
                             fineSettings: {
                               ...formData.fineSettings,
                               suspensionThreshold: parseInt(e.target.value)
                             }
                           })}
                           className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         />
                       </div>
                     </div>
                     <div className="flex items-center">
                       <label className="flex items-center space-x-2">
                         <input
                           type="checkbox"
                           checked={formData.fineSettings.escalationEnabled}
                           onChange={(e) => setFormData({
                             ...formData,
                             fineSettings: {
                               ...formData.fineSettings,
                               escalationEnabled: e.target.checked
                             }
                           })}
                           className="w-4 h-4 text-blue-600"
                         />
                         <span className="text-sm font-medium text-gray-700">Enable fine escalation</span>
                       </label>
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {/* Payment Plans */}
             {activeSection === 'plans' && (
               <div className="space-y-6">
                 <div className="flex items-center space-x-2 mb-4">
                   <Calendar className="w-5 h-5 text-purple-600" />
                   <span className="text-lg font-semibold">Payment Plans Configuration</span>
                 </div>
                 
                 <div className="space-y-4">
                   <label className="flex items-center space-x-2">
                     <input
                       type="checkbox"
                       checked={formData.paymentPlans.installmentsEnabled}
                       onChange={(e) => setFormData({
                         ...formData,
                         paymentPlans: {
                           ...formData.paymentPlans,
                           installmentsEnabled: e.target.checked
                         }
                       })}
                       className="w-4 h-4 text-blue-600"
                     />
                     <span className="text-sm font-medium text-gray-700">Enable installment payments</span>
                   </label>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Max Installments</label>
                       <input
                         type="number"
                         value={formData.paymentPlans.maxInstallments}
                         onChange={(e) => setFormData({
                           ...formData,
                           paymentPlans: {
                             ...formData.paymentPlans,
                             maxInstallments: parseInt(e.target.value)
                           }
                         })}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         disabled={!formData.paymentPlans.installmentsEnabled}
                       />
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Min Installment Amount</label>
                       <div className="relative">
                         <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">â‚¹</span>
                         <input
                           type="number"
                           value={formData.paymentPlans.minInstallmentAmount}
                           onChange={(e) => setFormData({
                             ...formData,
                             paymentPlans: {
                               ...formData.paymentPlans,
                               minInstallmentAmount: parseInt(e.target.value)
                             }
                           })}
                           className="pl-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                           disabled={!formData.paymentPlans.installmentsEnabled}
                         />
                       </div>
                     </div>
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-2">Late Payment Fee (%)</label>
                       <input
                         type="number"
                         step="0.5"
                         value={formData.paymentPlans.latePaymentFeePercentage}
                         onChange={(e) => setFormData({
                           ...formData,
                           paymentPlans: {
                             ...formData.paymentPlans,
                             latePaymentFeePercentage: parseFloat(e.target.value)
                           }
                         })}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         disabled={!formData.paymentPlans.installmentsEnabled}
                       />
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {/* Notifications */}
             {activeSection === 'notifications' && (
               <div className="space-y-6">
                 <div className="flex items-center space-x-2 mb-4">
                   <Bell className="w-5 h-5 text-blue-600" />
                   <span className="text-lg font-semibold">Payment Notifications</span>
                 </div>
                 
                 <div className="space-y-4">
                   {Object.entries(formData.notifications).map(([key, value]) => (
                     <label key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                       <span className="text-sm font-medium text-gray-700 capitalize">
                         {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                       </span>
                       <input
                         type="checkbox"
                         checked={value as boolean}
                         onChange={(e) => setFormData({
                           ...formData,
                           notifications: {
                             ...formData.notifications,
                             [key]: e.target.checked
                           }
                         })}
                         className="w-4 h-4 text-blue-600"
                       />
                     </label>
                   ))}
                 </div>
               </div>
             )}
            
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 mt-8">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onSave(formData);
                  onClose();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const RevenueAnalytics = ({ data }: any) => {
  const [timeframe, setTimeframe] = useState('daily');
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Revenue Analytics</h3>
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="daily">Daily</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Revenue Summary */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Revenue Breakdown</h4>
          {timeframe === 'daily' && data.daily.slice(-1).map((day: any) => (
            <div key={day.date} className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Trip Fares</span>
                <span className="font-medium">â‚¹{day.tripFares}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Fines</span>
                <span className="font-medium">â‚¹{day.fines}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Term Fees</span>
                <span className="font-medium">â‚¹{day.semesterFees}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-green-600">â‚¹{day.total}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Payment Methods Distribution */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Payment Methods</h4>
          {data.paymentMethods.map((method: any) => (
            <div key={method.method} className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{method.method}</span>
                <span className="font-medium">{method.percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ width: `${method.percentage}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>â‚¹{method.amount}</span>
                <span>{method.transactions} transactions</span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Quick Stats</h4>
          <div className="space-y-3">
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Revenue Growth</span>
              </div>
              <p className="text-lg font-bold text-green-900">+12.5%</p>
              <p className="text-xs text-green-700">vs last month</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">Collection Rate</span>
              </div>
              <p className="text-lg font-bold text-blue-900">94.2%</p>
              <p className="text-xs text-blue-700">Total collected</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">Avg. Process Time</span>
              </div>
              <p className="text-lg font-bold text-yellow-900">2.3 hrs</p>
              <p className="text-xs text-yellow-700">Payment to settlement</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PaymentsPage = () => {
  const [user, setUser] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('payments');
  const [showSettings, setShowSettings] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showPaymentPlanModal, setShowPaymentPlanModal] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState<any[]>([]);
  const [showBulkOperations, setShowBulkOperations] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showPaymentPlan, setShowPaymentPlan] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [selectedDue, setSelectedDue] = useState<any>(null);
  
  // Outstanding dues filters
  const [outstandingSearchTerm, setOutstandingSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [academicYearFilter, setAcademicYearFilter] = useState('all');
  const [termFilter, setTermFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [amountFilter, setAmountFilter] = useState('all');

  // Add missing paymentSettings state
  const [paymentSettings, setPaymentSettings] = useState({
    feeStructure: {
      registrationFee: 500,
      semesterFeeBase: 15000,
      fineRates: {
        lateFee: 100,
        noShow: 50,
        cancellation: 25,
        damage: 200
      }
    },
    paymentMethods: {
      upi: { enabled: true, gatewayFee: 0.5, processingTime: 'Instant' },
      card: { enabled: true, gatewayFee: 2.0, processingTime: '2-3 business days' },
      net_banking: { enabled: true, gatewayFee: 1.0, processingTime: '1-2 business days' },
      wallet: { enabled: true, gatewayFee: 0.3, processingTime: 'Instant' },
      cash: { enabled: false, gatewayFee: 0, processingTime: 'Instant' }
    },
    refundPolicy: {
      allowRefunds: true,
      refundDeadlineDays: 7,
      processingTimeDays: 5,
      refundFeePercentage: 2.5,
      autoRefundEnabled: false
    },
    fineSettings: {
      autoFineEnabled: true,
      graceperiodHours: 24,
      maxFineAmount: 1000,
      suspensionThreshold: 2000,
      escalationEnabled: true
    },
    paymentPlans: {
      installmentsEnabled: true,
      maxInstallments: 3,
      minInstallmentAmount: 1000,
      latePaymentFeePercentage: 5.0
    },
    notifications: {
      paymentDue: true,
      paymentReceived: true,
      paymentFailed: true,
      refundProcessed: true,
      installmentDue: true
    }
  });

  useEffect(() => {
    const userData = localStorage.getItem('adminUser');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    fetchPaymentsData();
  }, []);

  const fetchPaymentsData = async () => {
    try {
      setLoading(true);
      const [paymentsResponse, studentsResponse] = await Promise.all([
        fetch('/api/admin/payments'),
        fetch('/api/admin/students')
      ]);
      
      const paymentsResult = await paymentsResponse.json();
      const studentsResult = await studentsResponse.json();
      
      const paymentsData = paymentsResult.success ? paymentsResult.data : [];
      const studentsData = studentsResult.success ? studentsResult.data : [];
      setPayments(paymentsData);
      setStudents(studentsData);
    } catch (error) {
      console.error('Error fetching payments data:', error);
      toast.error('Failed to load payments data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate analytics from database data
  const analytics = {
    totalRevenue: payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0),
    pendingAmount: payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + (p.amount || 0), 0),
    overdueAmount: payments.filter(p => p.status === 'overdue').reduce((sum, p) => sum + (p.amount || 0), 0),
    refundedAmount: payments.filter(p => p.status === 'refunded').reduce((sum, p) => sum + (p.amount || 0), 0),
    totalTransactions: payments.length,
    successRate: payments.length > 0 ? Math.round((payments.filter(p => p.status === 'paid').length / payments.length) * 100) : 0,
    paymentMethods: payments.reduce((acc: Record<string, number>, payment) => {
      const method = payment.payment_method || 'unknown';
      acc[method] = (acc[method] || 0) + (payment.amount || 0);
      return acc;
    }, {})
  };

  // Generate revenue analytics data from payments
  const revenueAnalytics = {
    daily: payments.reduce((acc: any[], payment) => {
      const date = new Date(payment.created_at).toISOString().split('T')[0];
      const existing = acc.find(item => item.date === date);
      
      if (existing) {
        existing.tripFares += payment.payment_type === 'trip_fare' ? (payment.amount || 0) : 0;
        existing.fines += payment.payment_type === 'fine' ? (payment.amount || 0) : 0;
        existing.semesterFees += payment.payment_type === 'semester_fee' ? (payment.amount || 0) : 0;
        existing.total += payment.status === 'paid' ? (payment.amount || 0) : 0;
      } else {
        acc.push({
          date,
          tripFares: payment.payment_type === 'trip_fare' ? (payment.amount || 0) : 0,
          fines: payment.payment_type === 'fine' ? (payment.amount || 0) : 0,
          semesterFees: payment.payment_type === 'semester_fee' ? (payment.amount || 0) : 0,
          total: payment.status === 'paid' ? (payment.amount || 0) : 0
        });
      }
      return acc;
    }, []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    
    paymentMethods: Object.entries(analytics.paymentMethods).map(([method, amount]) => ({
      method: method.charAt(0).toUpperCase() + method.slice(1).replace('_', ' '),
      amount: amount as number,
      transactions: payments.filter(p => p.payment_method === method).length,
      percentage: analytics.totalRevenue > 0 ? Math.round(((amount as number) / analytics.totalRevenue) * 100) : 0
    }))
  };

  // Enhanced outstanding dues calculation with term-wise breakdown
  const outstandingDues = students.map(student => {
    const studentPayments = payments.filter(p => p.student_id === student.id);
    const pendingPayments = studentPayments.filter(p => p.status === 'pending' || p.status === 'overdue');
    
    if (pendingPayments.length === 0) return null;
    
    const totalDue = pendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // Create term-wise breakdown
    const termBreakdown = pendingPayments.map(payment => {
      const dueDate = new Date(payment.created_at);
      dueDate.setDate(dueDate.getDate() + 30); // Assume 30 days payment period
      const today = new Date();
      const overdueDays = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      return {
        academicYear: payment.academic_year || '2025-26',
        semester: payment.semester || 1,
        amount: payment.amount || 0,
        status: payment.status || 'pending',
        overdueDays: overdueDays,
        dueDate: dueDate.toISOString().split('T')[0]
      };
    });
    
    return {
      id: student.id,
      studentName: student.student_name,
      rollNumber: student.roll_number,
      department: student.department_name,
      academicYear: student.academic_year ? `${student.academic_year}-${(student.academic_year + 1).toString().slice(-2)}` : 'N/A',
      totalOutstanding: totalDue,
      contact: student.mobile || student.email,
      termBreakdown: termBreakdown
    };
  }).filter(due => due !== null);

  // Extract unique values for outstanding dues filters
  const uniqueDepartments = [...new Set(outstandingDues.map(due => due.department).filter(Boolean))];
  const uniqueAcademicYears = [...new Set(outstandingDues.map(due => due.academicYear).filter(Boolean))];
  const uniqueTerms = [...new Set(outstandingDues.flatMap(due => 
    due.termBreakdown.map(term => term.semester)
  ))].sort((a, b) => a - b);

  // Helper function to determine priority based on overdue days
  const getPriority = (due: any) => {
    const maxOverdueDays = due.termBreakdown.reduce((max: number, term: any) => 
      Math.max(max, term.overdueDays), 0);
    if (maxOverdueDays >= 30) return 'critical';
    if (maxOverdueDays >= 15) return 'high';
    if (maxOverdueDays >= 7) return 'medium';
    return 'low';
  };

  // Filter outstanding dues
  const filteredOutstandingDues = outstandingDues.filter(due => {
    const matchesSearch = due.studentName.toLowerCase().includes(outstandingSearchTerm.toLowerCase()) ||
                         due.rollNumber.toLowerCase().includes(outstandingSearchTerm.toLowerCase()) ||
                         (due.department || '').toLowerCase().includes(outstandingSearchTerm.toLowerCase());
    
    const matchesDepartment = departmentFilter === 'all' || due.department === departmentFilter;
    const matchesAcademicYear = academicYearFilter === 'all' || due.academicYear === academicYearFilter;
    
    const matchesTerm = termFilter === 'all' || 
                       due.termBreakdown.some(term => term.semester.toString() === termFilter);
    
    const priority = getPriority(due);
    const matchesPriority = priorityFilter === 'all' || priority === priorityFilter;
    
    let matchesAmount = true;
    if (amountFilter === 'low') {
      matchesAmount = due.totalOutstanding < 5000;
    } else if (amountFilter === 'medium') {
      matchesAmount = due.totalOutstanding >= 5000 && due.totalOutstanding < 15000;
    } else if (amountFilter === 'high') {
      matchesAmount = due.totalOutstanding >= 15000;
    }
    
    return matchesSearch && matchesDepartment && matchesAcademicYear && 
           matchesTerm && matchesPriority && matchesAmount;
  });

  const filteredPayments = payments.filter(payment => {
    const student = students.find(s => s.id === payment.student_id);
    
    const matchesSearch = (student?.student_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (student?.roll_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (payment.transaction_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (payment.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    const matchesType = typeFilter === 'all' || payment.payment_type === typeFilter;
    const matchesMethod = methodFilter === 'all' || payment.payment_method === methodFilter;
    
    let matchesDate = true;
    if (dateFilter === 'today') {
      const today = new Date().toDateString();
      matchesDate = new Date(payment.created_at).toDateString() === today;
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      matchesDate = new Date(payment.created_at) >= weekAgo;
    } else if (dateFilter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      matchesDate = new Date(payment.created_at) >= monthAgo;
    }
    
    return matchesSearch && matchesStatus && matchesType && matchesMethod && matchesDate;
  });

  const canAddPayment = user && ['super_admin', 'finance_admin'].includes(user.role);
  const canManage = user && ['super_admin', 'finance_admin'].includes(user.role);

  // Statistics
  const totalPayments = payments.length;
  const completedPayments = payments.filter(p => p.status === 'completed').length;
  const pendingPayments = payments.filter(p => p.status === 'pending').length;
  const failedPayments = payments.filter(p => p.status === 'failed').length;
  const totalRevenue = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = payments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);

  const tabs = [
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'term-fees', label: '3-Term Fees', icon: DollarSign },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'outstanding', label: 'Outstanding Dues', icon: AlertTriangle },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const handleViewPayment = (payment: any) => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };

  const handleRefundPayment = (payment: any) => {
    setSelectedPayment(payment);
    setShowRefundModal(true);
  };

  const handleApprovePayment = (payment: any) => {
    setPayments(payments.map(p => 
      p.id === payment.id ? { ...p, status: 'completed' } : p
    ));
    toast.success('Payment approved successfully');
  };

  const handleRejectPayment = (payment: any) => {
    setPayments(payments.map(p => 
      p.id === payment.id ? { ...p, status: 'failed' } : p
    ));
    toast.success('Payment rejected');
  };

  const handleEditPayment = (payment: any) => {
    toast.success('Edit payment functionality coming soon!');
  };

  const handleCreatePaymentPlan = (due: any) => {
    setSelectedPayment(due);
    setShowPaymentPlanModal(true);
  };

  const handleSendReminder = (due: any) => {
    toast.success('Payment reminder sent successfully!');
  };

  const handleSavePaymentPlan = (planData: any) => {
    toast.success('Payment plan created successfully!');
    // In real app, this would save to backend
  };

  const handleProcessRefund = (refundData: any) => {
    setPayments(payments.map(p => 
      p.id === refundData.originalPaymentId 
        ? { ...p, status: 'refunded' } 
        : p
    ));
    toast.success('Refund processed successfully!');
  };

  const handleSaveNewPayment = (paymentData: any) => {
    setPayments([...payments, paymentData]);
    toast.success('Payment recorded successfully!');
  };

  const handleBulkAction = (action: string, data: any) => {
    switch (action) {
      case 'approve':
        setPayments(payments.map(p => 
          selectedPayments.some(sp => sp.id === p.id) 
            ? { ...p, status: 'completed' } 
            : p
        ));
        break;
      case 'reject':
        setPayments(payments.map(p => 
          selectedPayments.some(sp => sp.id === p.id) 
            ? { ...p, status: 'failed' } 
            : p
        ));
        break;
      case 'refund':
        setPayments(payments.map(p => 
          selectedPayments.some(sp => sp.id === p.id) 
            ? { ...p, status: 'refunded' } 
            : p
        ));
        break;
      case 'update_status':
        setPayments(payments.map(p => 
          selectedPayments.some(sp => sp.id === p.id) 
            ? { ...p, status: data.data.statusUpdate } 
            : p
        ));
        break;
    }
    setSelectedPayments([]);
  };

  const handlePaymentSelection = (payment: any, isSelected: boolean) => {
    if (isSelected) {
      setSelectedPayments([...selectedPayments, payment]);
    } else {
      setSelectedPayments(selectedPayments.filter(p => p.id !== payment.id));
    }
  };

  // PaymentCard component defined inside PaymentsPage to access state variables
  const PaymentCard = ({ payment, onView, onRefund, onApprove, onReject, onEdit, onSelectionChange, userRole }: any) => {
    const canRefund = ['super_admin', 'finance_admin'].includes(userRole) && payment.status === 'paid';
    const canApprove = ['super_admin', 'finance_admin'].includes(userRole) && payment.status === 'pending';
    const canEdit = ['super_admin', 'finance_admin'].includes(userRole) && payment.status !== 'paid';
    const isSelected = selectedPayments.some(p => p.id === payment.id);

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'paid': return 'bg-green-100 text-green-800';
        case 'pending': return 'bg-yellow-100 text-yellow-800';
        case 'failed': return 'bg-red-100 text-red-800';
        case 'refunded': return 'bg-blue-100 text-blue-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    };

    const getPaymentTypeColor = (type: string) => {
      switch (type) {
        case 'trip_fare': return 'bg-blue-100 text-blue-800';
        case 'fine': return 'bg-red-100 text-red-800';
        case 'semester_fee': return 'bg-green-100 text-green-800';
        case 'registration': return 'bg-purple-100 text-purple-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    };

    const student = students.find(s => s.id === payment.student_id);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white rounded-xl shadow-sm border p-4 lg:p-6 hover:shadow-md transition-all max-w-full ${
          isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
        }`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            {canManage && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onSelectionChange(payment, e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
              />
            )}
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{student?.student_name || 'Unknown Student'}</h3>
              <p className="text-sm text-gray-600 truncate">{student?.roll_number || 'N/A'}</p>
            </div>
          </div>
          <div className="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
            <span className={`px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${getStatusColor(payment.status)}`}>
              {payment.status}
            </span>
            <span className={`px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${getPaymentTypeColor(payment.payment_type || 'other')}`}>
              {(payment.payment_type || 'other').replace('_', ' ')}
            </span>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Amount:</span>
            <span className="text-lg font-bold text-gray-900">â‚¹{payment.amount || 0}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Method:</span>
            <span className="text-gray-900 capitalize">{(payment.payment_method || 'unknown').replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">Date:</span>
            <span className="text-gray-900">{new Date(payment.created_at).toLocaleDateString()}</span>
          </div>
          {payment.transaction_id && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Transaction ID:</span>
              <span className="text-gray-900 font-mono text-xs">{payment.transaction_id}</span>
            </div>
          )}
          <div className="text-sm text-gray-600">
            <p className="truncate">{payment.description || 'No description'}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => onView(payment)}
            className="flex-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center space-x-1"
          >
            <Eye className="w-4 h-4 flex-shrink-0" />
            <span>View Details</span>
          </button>
          
          <div className="flex gap-2">
            {canApprove && (
              <>
                <button
                  onClick={() => onApprove(payment)}
                  className="flex-1 sm:flex-none px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center justify-center space-x-1"
                >
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Approve</span>
                </button>
                <button
                  onClick={() => onReject(payment)}
                  className="flex-1 sm:flex-none px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            )}
            
            {canEdit && (
              <button
                onClick={() => onEdit(payment)}
                className="flex-1 sm:flex-none px-3 py-2 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors flex items-center justify-center"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            
            {canRefund && (
              <button
                onClick={() => onRefund(payment)}
                className="flex-1 sm:flex-none px-3 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-4 lg:space-y-6 max-w-full">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Payments Management</h1>
          <p className="text-gray-600 text-sm lg:text-base">Comprehensive financial transaction management</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {selectedPayments.length > 0 && canManage && (
            <button
              onClick={() => setShowBulkOperations(true)}
              className="bg-purple-600 text-white px-3 py-2 lg:px-4 lg:py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center space-x-2 text-sm lg:text-base"
            >
              <Users className="w-4 h-4 flex-shrink-0" />
              <span>Bulk Actions ({selectedPayments.length})</span>
            </button>
          )}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {canManage && (
              <>
                <button
                  onClick={() => toast.success('Export functionality coming soon!')}
                  className="bg-gray-100 text-gray-700 px-3 py-2 lg:px-4 lg:py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2 text-sm lg:text-base"
                >
                  <Download className="w-4 h-4 flex-shrink-0" />
                  <span>Export</span>
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="bg-gray-100 text-gray-700 px-3 py-2 lg:px-4 lg:py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2 text-sm lg:text-base"
                >
                  <Settings className="w-4 h-4 flex-shrink-0" />
                  <span>Settings</span>
                </button>
              </>
            )}
            {canAddPayment && (
              <button
                onClick={() => setShowRecordPayment(true)}
                className="bg-blue-600 text-white px-3 py-2 lg:px-4 lg:py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 text-sm lg:text-base"
              >
                <Plus className="w-4 h-4 flex-shrink-0" />
                <span>Record Payment</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 * 0.1 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex items-center space-x-1 text-sm text-green-600">
              <TrendingUp className="w-4 h-4" />
              <span>12.5%</span>
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">â‚¹{totalRevenue.toLocaleString()}</h3>
            <p className="text-sm font-medium text-gray-700 mb-1">Total Revenue</p>
            <p className="text-xs text-gray-500">This month collection</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 * 0.1 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex items-center space-x-1 text-sm text-blue-600">
              <TrendingUp className="w-4 h-4" />
              <span>8.2%</span>
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{completedPayments}</h3>
            <p className="text-sm font-medium text-gray-700 mb-1">Completed Payments</p>
            <p className="text-xs text-gray-500">Successfully processed</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2 * 0.1 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="flex items-center space-x-1 text-sm text-yellow-600">
              <TrendingDown className="w-4 h-4" />
              <span>3.1%</span>
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">â‚¹{pendingAmount.toLocaleString()}</h3>
            <p className="text-sm font-medium text-gray-700 mb-1">Pending Amount</p>
            <p className="text-xs text-gray-500">Awaiting processing</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3 * 0.1 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex items-center space-x-1 text-sm text-red-600">
              <TrendingDown className="w-4 h-4" />
              <span>5.4%</span>
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">{outstandingDues.length}</h3>
            <p className="text-sm font-medium text-gray-700 mb-1">Outstanding Dues</p>
            <p className="text-xs text-gray-500">Require attention</p>
          </div>
        </motion.div>
      </div>

      {/* Enhanced Tabs */}
      <div className="border-b border-gray-200">
        {/* Mobile Tab Selector */}
        <div className="block lg:hidden">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200 px-4 py-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-800 mb-3">
                <span className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-green-600" />
                  <span>Select View</span>
                </span>
              </label>
              <div className="relative">
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value)}
                  className="w-full appearance-none bg-white border-2 border-green-200 rounded-xl px-4 py-4 pr-12 text-gray-900 font-medium focus:outline-none focus:ring-4 focus:ring-green-100 focus:border-green-400 transition-all duration-300 shadow-lg hover:shadow-xl"
                  style={{
                    backgroundImage: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none'
                  }}
                >
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id} className="py-3 text-gray-900 font-medium">
                      {tab.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-xs text-green-600 font-medium">
                ðŸ'³ Switch between different payment views
              </p>
            </div>
          </div>
        </div>
        
        {/* Desktop Tab Navigation */}
        <nav className="hidden lg:block">
          <div className="overflow-x-auto">
            <div className="-mb-px flex space-x-4 xl:space-x-8 min-w-max" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'payments' && (
          <motion.div
            key="payments"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Enhanced Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="space-y-4">
                {/* Search Bar - Full Width */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search payments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Filter Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    <option value="trip_fare">Trip Fare</option>
                    <option value="fine">Fine</option>
                    <option value="semester_fee">Term Fee</option>
                    <option value="registration">Registration</option>
                  </select>
                  <select
                    value={methodFilter}
                    onChange={(e) => setMethodFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Methods</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="net_banking">Net Banking</option>
                    <option value="wallet">Wallet</option>
                  </select>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
              {filteredPayments.map((payment) => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  onView={handleViewPayment}
                  onRefund={handleRefundPayment}
                  onApprove={handleApprovePayment}
                  onReject={handleRejectPayment}
                  onEdit={handleEditPayment}
                  onSelectionChange={handlePaymentSelection}
                  userRole={user?.role}
                />
              ))}
            </div>

            {filteredPayments.length === 0 && (
              <div className="text-center py-12">
                <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No payments found</h3>
                <p className="text-gray-600 mb-4">Try adjusting your search or filters</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'term-fees' && (
          <motion.div
            key="term-fees"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <SemesterFeeManagement />
          </motion.div>
        )}

        {activeTab === 'analytics' && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <RevenueAnalytics data={revenueAnalytics} />
          </motion.div>
        )}

        {activeTab === 'outstanding' && (
          <motion.div
            key="outstanding"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Outstanding Dues Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Outstanding Dues Filters
              </h3>
              
              {/* Search Bar */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by student name, roll number, or department..."
                    value={outstandingSearchTerm}
                    onChange={(e) => setOutstandingSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Filter Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
                {/* Department Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Departments</option>
                    {uniqueDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                {/* Academic Year Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                  <select
                    value={academicYearFilter}
                    onChange={(e) => setAcademicYearFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Years</option>
                    {uniqueAcademicYears.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>

                {/* Term Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term/Semester</label>
                  <select
                    value={termFilter}
                    onChange={(e) => setTermFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Terms</option>
                    {uniqueTerms.map(term => (
                      <option key={term} value={term}>Term {term}</option>
                    ))}
                  </select>
                </div>

                {/* Priority Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Priority</option>
                    <option value="critical">Critical (30+ days)</option>
                    <option value="high">High (15+ days)</option>
                    <option value="medium">Medium (7+ days)</option>
                    <option value="low">Low (&lt; 7 days)</option>
                  </select>
                </div>

                {/* Amount Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount Range</label>
                  <select
                    value={amountFilter}
                    onChange={(e) => setAmountFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="all">All Amounts</option>
                    <option value="low">&lt; ₹5,000</option>
                    <option value="medium">₹5,000 - ₹15,000</option>
                    <option value="high">&gt; ₹15,000</option>
                  </select>
                </div>

                {/* Clear Filters Button */}
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setOutstandingSearchTerm('');
                      setDepartmentFilter('all');
                      setAcademicYearFilter('all');
                      setTermFilter('all');
                      setPriorityFilter('all');
                      setAmountFilter('all');
                    }}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              {/* Summary Statistics */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{filteredOutstandingDues.length}</p>
                  <p className="text-sm text-gray-600">Students with Dues</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    ₹{filteredOutstandingDues.reduce((sum, due) => sum + due.totalOutstanding, 0).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">Total Outstanding</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {filteredOutstandingDues.filter(due => getPriority(due) === 'critical').length}
                  </p>
                  <p className="text-sm text-gray-600">Critical Priority</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {Math.round(filteredOutstandingDues.reduce((sum, due) => sum + due.totalOutstanding, 0) / Math.max(filteredOutstandingDues.length, 1))}
                  </p>
                  <p className="text-sm text-gray-600">Avg. Outstanding</p>
                </div>
              </div>
            </div>

            {/* Outstanding Dues Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredOutstandingDues.map((due) => (
                <OutstandingDuesCard
                  key={due.id}
                  due={due}
                  onPaymentPlan={handleCreatePaymentPlan}
                  onSendReminder={handleSendReminder}
                  userRole={user?.role}
                />
              ))}
            </div>

            {/* Empty State */}
            {filteredOutstandingDues.length === 0 && outstandingDues.length > 0 && (
              <div className="text-center py-12">
                <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No matching results</h3>
                <p className="text-gray-600">Try adjusting your filters to see more results.</p>
              </div>
            )}

            {outstandingDues.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No outstanding dues</h3>
                <p className="text-gray-600">All students are up to date with their payments!</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'settings' && canManage && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Payment Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors text-center"
                >
                  <Settings className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <h4 className="font-medium text-gray-900">Configure Settings</h4>
                  <p className="text-sm text-gray-500">Manage fees, methods, and policies</p>
                </button>
                <button
                  onClick={() => toast.success('Bulk operations coming soon!')}
                  className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors text-center"
                >
                  <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <h4 className="font-medium text-gray-900">Bulk Operations</h4>
                  <p className="text-sm text-gray-500">Process multiple payments</p>
                </button>
                <button
                  onClick={() => toast.success('Reports coming soon!')}
                  className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors text-center"
                >
                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <h4 className="font-medium text-gray-900">Generate Reports</h4>
                  <p className="text-sm text-gray-500">Financial reports and statements</p>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* All Modals */}
      <PaymentDetailsModal
        isOpen={showPaymentDetails}
        onClose={() => setShowPaymentDetails(false)}
        payment={selectedPayment}
        onRefund={handleRefundPayment}
        onApprove={handleApprovePayment}
        onReject={handleRejectPayment}
        onEdit={handleEditPayment}
        userRole={user?.role}
      />

      <PaymentPlanModal
        isOpen={showPaymentPlan}
        onClose={() => setShowPaymentPlan(false)}
        outstandingDue={selectedDue}
        onSave={handleSavePaymentPlan}
      />

      <RefundModal
        isOpen={showRefund}
        onClose={() => setShowRefund(false)}
        payment={selectedPayment}
        onProcessRefund={handleProcessRefund}
      />

      <RecordPaymentModal
        isOpen={showRecordPayment}
        onClose={() => setShowRecordPayment(false)}
        onSavePayment={handleSaveNewPayment}
      />

      <BulkOperationsModal
        isOpen={showBulkOperations}
        onClose={() => setShowBulkOperations(false)}
        selectedPayments={selectedPayments}
        onBulkAction={handleBulkAction}
      />

      {/* Settings Modal */}
      <PaymentSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={paymentSettings}
        onSave={(settings: any) => {
          toast.success('Settings saved successfully!');
        }}
      />
    </div>
  );
};

export default PaymentsPage; 
