'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Download,
  Printer,
  FileText,
  Calendar,
  CreditCard,
  User,
  CheckCircle,
  Building,
  Phone,
  Mail
} from 'lucide-react';
import { studentsData } from '@/data/admin-data';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any;
  organizationDetails?: {
    name: string;
    address: string;
    phone: string;
    email: string;
    taxId?: string;
  };
}

const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  payment,
  organizationDetails = {
    name: 'JKKN College of Engineering',
    address: 'Komarapalayam, Namakkal District, Tamil Nadu - 638183',
    phone: '+91 4287 226 555',
    email: 'transport@jkkn.ac.in',
    taxId: 'GST: 33AABCU9603R1ZN'
  }
}) => {
  if (!isOpen || !payment) return null;

  const student = studentsData.find(s => s.id === payment.studentId);
  const receiptDate = new Date();
  const receiptNumber = `RCP${payment.id.toUpperCase()}${receiptDate.getFullYear()}`;

  const handleDownload = () => {
    // In a real app, this would generate a PDF
    const receiptContent = generateReceiptContent();
    const blob = new Blob([receiptContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${receiptNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printContent = document.getElementById('receipt-content');
    if (printContent) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Payment Receipt - ${receiptNumber}</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .receipt-container { max-width: 600px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
                .details { margin: 20px 0; }
                .details-row { display: flex; justify-content: space-between; margin: 10px 0; }
                .total { font-weight: bold; font-size: 18px; border-top: 2px solid #333; padding-top: 10px; }
                .footer { text-align: center; margin-top: 30px; color: #666; }
                @media print { body { margin: 0; } }
              </style>
            </head>
            <body>
              ${printContent.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }
    }
  };

  const generateReceiptContent = () => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Receipt - ${receiptNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .receipt-container { max-width: 600px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
            .details { margin: 20px 0; }
            .details-row { display: flex; justify-content: space-between; margin: 10px 0; }
            .total { font-weight: bold; font-size: 18px; border-top: 2px solid #333; padding-top: 10px; }
            .footer { text-align: center; margin-top: 30px; color: #666; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <h1>${organizationDetails.name}</h1>
              <p>${organizationDetails.address}</p>
              <p>Phone: ${organizationDetails.phone} | Email: ${organizationDetails.email}</p>
              ${organizationDetails.taxId ? `<p>${organizationDetails.taxId}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <h2>PAYMENT RECEIPT</h2>
              <p>Receipt No: ${receiptNumber}</p>
            </div>
            
            <div class="details">
              <div class="details-row">
                <span>Student Name:</span>
                <span>${student?.studentName || 'N/A'}</span>
              </div>
              <div class="details-row">
                <span>Roll Number:</span>
                <span>${student?.rollNumber || 'N/A'}</span>
              </div>
              <div class="details-row">
                <span>Payment Type:</span>
                <span>${payment.paymentType.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div class="details-row">
                <span>Payment Method:</span>
                <span>${payment.paymentMethod.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div class="details-row">
                <span>Transaction ID:</span>
                <span>${payment.transactionId || 'N/A'}</span>
              </div>
              <div class="details-row">
                <span>Payment Date:</span>
                <span>${new Date(payment.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="details-row">
                <span>Description:</span>
                <span>${payment.description}</span>
              </div>
              <div class="details-row total">
                <span>Amount Paid:</span>
                <span>₹${payment.amount}</span>
              </div>
            </div>
            
            <div class="footer">
              <p>This is a computer-generated receipt and does not require a signature.</p>
              <p>Generated on: ${receiptDate.toLocaleDateString()} ${receiptDate.toLocaleTimeString()}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'refunded': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPaymentTypeColor = (type: string) => {
    switch (type) {
      case 'trip_fare': return 'text-blue-600 bg-blue-100';
      case 'fine': return 'text-red-600 bg-red-100';
      case 'semester_fee': return 'text-green-600 bg-green-100';
      case 'registration': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[95vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Payment Receipt</h2>
              <p className="text-sm text-gray-600">Receipt No: {receiptNumber}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Print Receipt"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Download Receipt"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-120px)]">
          <div id="receipt-content" className="p-8">
            {/* Organization Header */}
            <div className="text-center border-b-2 border-gray-800 pb-6 mb-8">
              <div className="flex items-center justify-center space-x-3 mb-4">
                <Building className="w-8 h-8 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">{organizationDetails.name}</h1>
              </div>
              <p className="text-gray-600 mb-2">{organizationDetails.address}</p>
              <div className="flex items-center justify-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <Phone className="w-4 h-4" />
                  <span>{organizationDetails.phone}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Mail className="w-4 h-4" />
                  <span>{organizationDetails.email}</span>
                </div>
              </div>
              {organizationDetails.taxId && (
                <p className="text-sm text-gray-600 mt-2">{organizationDetails.taxId}</p>
              )}
            </div>

            {/* Receipt Title */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">PAYMENT RECEIPT</h2>
              <div className="flex items-center justify-center space-x-6 text-sm">
                <div className="flex items-center space-x-1">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span>Receipt No: {receiptNumber}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span>Date: {receiptDate.toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Payment Status Badge */}
            <div className="text-center mb-8">
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${getPaymentStatusColor(payment.status)}`}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Payment {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
              </span>
            </div>

            {/* Payment Details */}
            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b border-gray-200 pb-2">Student Information</h3>
                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Name</span>
                    </div>
                    <p className="font-medium text-gray-900">{student?.studentName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Roll Number</p>
                    <p className="font-medium text-gray-900">{student?.rollNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Email</p>
                    <p className="font-medium text-gray-900">{student?.email || 'N/A'}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b border-gray-200 pb-2">Payment Information</h3>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Payment Type</p>
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getPaymentTypeColor(payment.paymentType)}`}>
                      {payment.paymentType.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <CreditCard className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Payment Method</span>
                    </div>
                    <p className="font-medium text-gray-900 capitalize">{payment.paymentMethod.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Transaction ID</p>
                    <p className="font-mono text-sm text-gray-900 bg-gray-50 px-2 py-1 rounded">
                      {payment.transactionId || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-sm text-gray-600 mb-2">Description</p>
                <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{payment.description}</p>
              </div>

              {/* Amount Summary */}
              <div className="border-t-2 border-gray-800 pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Amount Paid:</span>
                  <span className="text-2xl font-bold text-green-600">₹{payment.amount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-8 border-t border-gray-200 text-sm text-gray-600">
              <p className="mb-2">This is a computer-generated receipt and does not require a signature.</p>
              <p>Generated on: {receiptDate.toLocaleDateString()} at {receiptDate.toLocaleTimeString()}</p>
              <p className="mt-4 text-xs">For any queries regarding this payment, please contact the transport office.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PaymentReceiptModal; 