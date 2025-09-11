import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET - Fetch semester payments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const routeId = searchParams.get('routeId');
    const academicYear = searchParams.get('academicYear');
    const semester = searchParams.get('semester');
    const paymentStatus = searchParams.get('paymentStatus');

    let query = supabase
      .from('semester_payments')
      .select(`
        id,
        student_id,
        route_id,
        stop_name,
        academic_year,
        semester,
        amount_paid,
        payment_date,
        payment_method,
        transaction_id,
        receipt_number,
        payment_status,
        valid_from,
        valid_until,
        late_fee,
        discount_amount,
        discount_reason,
        remarks,
        created_at,
        students (
          id,
          full_name,
          roll_number,
          email,
          mobile
        ),
        routes (
          id,
          route_number,
          route_name,
          start_location,
          end_location
        ),
        semester_fees (
          id,
          semester_fee
        )
      `)
      .order('payment_date', { ascending: false });

    // Apply filters if provided
    if (studentId) {
      query = query.eq('student_id', studentId);
    }
    if (routeId) {
      query = query.eq('route_id', routeId);
    }
    if (academicYear) {
      query = query.eq('academic_year', academicYear);
    }
    if (semester) {
      query = query.eq('semester', semester);
    }
    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error('Error fetching semester payments:', error);
      return NextResponse.json({ error: 'Failed to fetch semester payments' }, { status: 500 });
    }

    return NextResponse.json(payments || [], { status: 200 });
  } catch (error) {
    console.error('Error in semester payments GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Process semester payment
export async function POST(request: NextRequest) {
  try {
    const { 
      studentId, 
      routeId, 
      stopName,
      semesterFeeId,
      academicYear,
      semester,
      amountPaid,
      paymentMethod,
      transactionId,
      lateFee = 0,
      discountAmount = 0,
      discountReason,
      remarks 
    } = await request.json();

    if (!studentId || !routeId || !stopName || !semesterFeeId || !academicYear || !semester || !amountPaid || !paymentMethod) {
      return NextResponse.json({ 
        error: 'Student ID, route ID, stop name, semester fee ID, academic year, semester, amount, and payment method are required' 
      }, { status: 400 });
    }

    // Check if student already has a payment for this semester
    const { data: existingPayment, error: existingError } = await supabase
      .from('semester_payments')
      .select('id')
      .eq('student_id', studentId)
      .eq('route_id', routeId)
      .eq('stop_name', stopName)
      .eq('academic_year', academicYear)
      .eq('semester', semester)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('Error checking existing payment:', existingError);
      return NextResponse.json({ error: 'Failed to check existing payment' }, { status: 500 });
    }

    if (existingPayment) {
      return NextResponse.json({ 
        error: 'Student already has a payment for this semester' 
      }, { status: 409 });
    }

    // Get semester fee details
    const { data: semesterFee, error: feeError } = await supabase
      .from('semester_fees')
      .select('semester_fee, effective_from, effective_until')
      .eq('id', semesterFeeId)
      .single();

    if (feeError || !semesterFee) {
      return NextResponse.json({ error: 'Semester fee not found' }, { status: 404 });
    }

    // Generate receipt number
    const { data: receiptResult, error: receiptError } = await supabase
      .rpc('generate_receipt_number');

    if (receiptError) {
      console.error('Error generating receipt number:', receiptError);
      return NextResponse.json({ error: 'Failed to generate receipt number' }, { status: 500 });
    }

    const receiptNumber = receiptResult;

    // Get current admin user
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select('id')
      .eq('is_active', true)
      .limit(1);

    const processedBy = adminUsers?.[0]?.id;

    // Create payment record
    const paymentData = {
      student_id: studentId,
      route_id: routeId,
      stop_name: stopName,
      academic_year: academicYear,
      semester: semester,
      semester_fee_id: semesterFeeId,
      amount_paid: amountPaid,
      payment_method: paymentMethod,
      transaction_id: transactionId,
      receipt_number: receiptNumber,
      payment_status: 'confirmed',
      valid_from: semesterFee.effective_from,
      valid_until: semesterFee.effective_until,
      late_fee: lateFee,
      discount_amount: discountAmount,
      discount_reason: discountReason,
      remarks: remarks,
      processed_by: processedBy
    };

    const { data: newPayment, error: paymentError } = await supabase
      .from('semester_payments')
      .insert(paymentData)
      .select(`
        id,
        student_id,
        route_id,
        stop_name,
        academic_year,
        semester,
        amount_paid,
        payment_date,
        payment_method,
        transaction_id,
        receipt_number,
        payment_status,
        valid_from,
        valid_until,
        late_fee,
        discount_amount,
        discount_reason,
        remarks,
        created_at,
        students (
          id,
          full_name,
          roll_number,
          email,
          mobile
        ),
        routes (
          id,
          route_number,
          route_name,
          start_location,
          end_location
        ),
        semester_fees (
          id,
          semester_fee
        )
      `)
      .single();

    if (paymentError) {
      console.error('Error creating semester payment:', paymentError);
      return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
    }

    // Create payment receipt
    const receiptData = {
      semester_payment_id: newPayment.id,
      receipt_number: receiptNumber,
      student_name: newPayment.students?.full_name,
      student_roll_number: newPayment.students?.roll_number,
      student_email: newPayment.students?.email,
      route_name: newPayment.routes?.route_name,
      route_number: newPayment.routes?.route_number,
      stop_name: stopName,
      semester_fee: semesterFee.semester_fee,
      late_fee: lateFee,
      discount_amount: discountAmount,
      total_amount: amountPaid,
      academic_year: academicYear,
      semester: semester,
      valid_from: semesterFee.effective_from,
      valid_until: semesterFee.effective_until,
      issued_by: processedBy,
      issued_by_name: 'Admin' // This should come from the admin user details
    };

    const { error: receiptCreateError } = await supabase
      .from('payment_receipts')
      .insert(receiptData);

    if (receiptCreateError) {
      console.error('Error creating payment receipt:', receiptCreateError);
      // Don't fail the payment, just log the error
    }

    return NextResponse.json(newPayment, { status: 201 });
  } catch (error) {
    console.error('Error in semester payments POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update semester payment
export async function PUT(request: NextRequest) {
  try {
    const { 
      id, 
      paymentStatus, 
      transactionId, 
      remarks,
      lateFee,
      discountAmount,
      discountReason 
    } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    const updateData: any = {};
    
    if (paymentStatus !== undefined) updateData.payment_status = paymentStatus;
    if (transactionId !== undefined) updateData.transaction_id = transactionId;
    if (remarks !== undefined) updateData.remarks = remarks;
    if (lateFee !== undefined) updateData.late_fee = lateFee;
    if (discountAmount !== undefined) updateData.discount_amount = discountAmount;
    if (discountReason !== undefined) updateData.discount_reason = discountReason;

    const { data: updatedPayment, error } = await supabase
      .from('semester_payments')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        student_id,
        route_id,
        stop_name,
        academic_year,
        semester,
        amount_paid,
        payment_date,
        payment_method,
        transaction_id,
        receipt_number,
        payment_status,
        valid_from,
        valid_until,
        late_fee,
        discount_amount,
        discount_reason,
        remarks,
        created_at,
        students (
          id,
          full_name,
          roll_number,
          email,
          mobile
        ),
        routes (
          id,
          route_number,
          route_name,
          start_location,
          end_location
        )
      `)
      .single();

    if (error) {
      console.error('Error updating semester payment:', error);
      return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 });
    }

    if (!updatedPayment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json(updatedPayment, { status: 200 });
  } catch (error) {
    console.error('Error in semester payments PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Cancel/refund semester payment
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const reason = searchParams.get('reason') || 'Cancelled by admin';

    if (!id) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    // Update payment status to cancelled/refunded instead of deleting
    const { data: cancelledPayment, error } = await supabase
      .from('semester_payments')
      .update({ 
        payment_status: 'cancelled',
        remarks: reason
      })
      .eq('id', id)
      .select('id, receipt_number, student_id')
      .single();

    if (error) {
      console.error('Error cancelling semester payment:', error);
      return NextResponse.json({ error: 'Failed to cancel payment' }, { status: 500 });
    }

    if (!cancelledPayment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Payment cancelled successfully',
      paymentId: cancelledPayment.id,
      receiptNumber: cancelledPayment.receipt_number
    }, { status: 200 });
  } catch (error) {
    console.error('Error in semester payments DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 