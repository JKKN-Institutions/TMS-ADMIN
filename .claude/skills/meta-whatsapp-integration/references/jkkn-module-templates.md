# JKKN Module WhatsApp Templates Reference

This file contains ready-to-use Meta WhatsApp template definitions for each JKKN module. When adding WhatsApp to a new module, pick the relevant template, create it in Meta Business Manager, and use the matching `buildTemplateComponents()` in your service.

## Table of Contents
1. [Admission Module](#admission-module)
2. [Billing Module](#billing-module)
3. [Academic Module](#academic-module)
4. [Attendance Module](#attendance-module)
5. [Learners Profile Module](#learners-profile-module)
6. [Placement Module](#placement-module)
7. [Library Module](#library-module)
8. [Hostel Module](#hostel-module)
9. [Template Naming Convention](#template-naming-convention)

---

## Admission Module

### admission_application_received
**Category:** Utility | **Params:** 3
```
Hi {{1}}, your application for {{2}} at JKKN has been received! Application ID: {{3}}. We'll review and get back to you soon. - JKKN Institutions
```
- {{1}} = Applicant name
- {{2}} = Program name (e.g., "B.Pharm")
- {{3}} = Application ID

### admission_status_update
**Category:** Utility | **Params:** 3
```
Hi {{1}}, your application for {{2}} has been updated to: {{3}}. Log in to jkkn.ac.in/apply for details. - JKKN Institutions
```
- {{1}} = Applicant name
- {{2}} = Program name
- {{3}} = Status (e.g., "Under Review", "Shortlisted", "Accepted")

### admission_counselor_assigned
**Category:** Utility | **Params:** 3
```
Hi {{1}}, your admission counselor {{2}} will be reaching out to you shortly. You can also call them at {{3}}. - JKKN Institutions
```
- {{1}} = Applicant name
- {{2}} = Counselor name
- {{3}} = Counselor phone

### exhibition_thankyou (EXISTING)
**Category:** Marketing | **Params:** 3
```
Hi {{1}}, thank you for visiting JKKN at {{2}}! You showed interest in {{3}}. Apply: jkkn.ac.in/apply or call +91 94988 37578. Welcome to the JKKN family!
```
- {{1}} = Lead name
- {{2}} = Event name
- {{3}} = Program(s) interested

---

## Billing Module

### billing_fee_reminder
**Category:** Utility | **Params:** 4
```
Hi {{1}}, this is a reminder that your fee of Rs.{{2}} for {{3}} is due on {{4}}. Pay online at jkkn.ac.in/pay or visit the accounts office. - JKKN Institutions
```
- {{1}} = Student/Parent name
- {{2}} = Amount (e.g., "25,000")
- {{3}} = Fee type (e.g., "Semester 2 Tuition Fee")
- {{4}} = Due date (e.g., "April 15, 2026")

### billing_payment_received
**Category:** Utility | **Params:** 4
```
Hi {{1}}, we've received your payment of Rs.{{2}} for {{3}}. Receipt No: {{4}}. Thank you! - JKKN Institutions
```
- {{1}} = Student/Parent name
- {{2}} = Amount paid
- {{3}} = Fee type
- {{4}} = Receipt number

### billing_overdue_notice
**Category:** Utility | **Params:** 3
```
Dear {{1}}, the fee of Rs.{{2}} for {{3}} is overdue. Please clear the dues at the earliest to avoid late fee charges. Contact accounts office for payment plans. - JKKN Institutions
```
- {{1}} = Parent name
- {{2}} = Overdue amount
- {{3}} = Fee description

---

## Academic Module

### academic_exam_schedule
**Category:** Utility | **Params:** 4
```
Hi {{1}}, your {{2}} exam is scheduled for {{3}} at {{4}}. Please arrive 30 minutes early. All the best! - JKKN Institutions
```
- {{1}} = Student name
- {{2}} = Subject/Exam name
- {{3}} = Date & time
- {{4}} = Venue/Hall

### academic_result_published
**Category:** Utility | **Params:** 3
```
Hi {{1}}, your {{2}} results are now available! You scored {{3}}. View detailed results at jkkn.ac.in/results. - JKKN Institutions
```
- {{1}} = Student name
- {{2}} = Exam name
- {{3}} = Grade/Score summary

### academic_timetable_change
**Category:** Utility | **Params:** 3
```
Hi {{1}}, there has been a change in your timetable for {{2}}. {{3}}. Please check jkkn.ac.in for the updated schedule. - JKKN Institutions
```
- {{1}} = Student name
- {{2}} = Date
- {{3}} = Change description

---

## Attendance Module

### attendance_absence_alert
**Category:** Utility | **Params:** 4
```
Dear {{1}}, your ward {{2}} was absent on {{3}} from {{4}}. If this is unplanned, please contact the institution. - JKKN Institutions
```
- {{1}} = Parent name
- {{2}} = Student name
- {{3}} = Date
- {{4}} = Class/Period details

### attendance_low_warning
**Category:** Utility | **Params:** 3
```
Dear {{1}}, your ward {{2}}'s attendance has dropped to {{3}}. Minimum 75% is required for exam eligibility. Please ensure regular attendance. - JKKN Institutions
```
- {{1}} = Parent name
- {{2}} = Student name
- {{3}} = Current attendance percentage

---

## Learners Profile Module

### student_welcome
**Category:** Marketing | **Params:** 2
```
Welcome to JKKN, {{1}}! You're now enrolled in {{2}}. Download the JKKN app for updates. We're excited to have you! - JKKN Institutions
```
- {{1}} = Student name
- {{2}} = Program name

### student_document_request
**Category:** Utility | **Params:** 2
```
Hi {{1}}, we need the following documents from you: {{2}}. Please submit them at the office or upload at jkkn.ac.in/documents. - JKKN Institutions
```
- {{1}} = Student name
- {{2}} = Document list

---

## Placement Module

### placement_opportunity
**Category:** Marketing | **Params:** 3
```
Hi {{1}}, exciting opportunity! {{2}} is visiting JKKN for campus recruitment on {{3}}. Register now at jkkn.ac.in/placements. Don't miss out! - JKKN Institutions
```
- {{1}} = Student name
- {{2}} = Company name
- {{3}} = Date

### placement_interview_schedule
**Category:** Utility | **Params:** 4
```
Hi {{1}}, your interview with {{2}} is scheduled for {{3}} at {{4}}. Carry your resume and ID card. All the best! - JKKN Institutions
```
- {{1}} = Student name
- {{2}} = Company name
- {{3}} = Date & time
- {{4}} = Venue

---

## Library Module

### library_book_due
**Category:** Utility | **Params:** 3
```
Hi {{1}}, the book "{{2}}" is due for return on {{3}}. Please return it on time to avoid late fees. - JKKN Library
```
- {{1}} = Student name
- {{2}} = Book title
- {{3}} = Due date

### library_book_overdue
**Category:** Utility | **Params:** 3
```
Hi {{1}}, the book "{{2}}" was due on {{3}} and is now overdue. Please return it immediately. Late fee is being applied. - JKKN Library
```
- {{1}} = Student name
- {{2}} = Book title
- {{3}} = Due date (past)

---

## Hostel Module

### hostel_fee_reminder
**Category:** Utility | **Params:** 3
```
Dear {{1}}, the hostel fee of Rs.{{2}} for {{3}} is due. Please pay at the accounts office or online at jkkn.ac.in/pay. - JKKN Institutions
```
- {{1}} = Parent/Student name
- {{2}} = Amount
- {{3}} = Period (e.g., "April-June 2026")

### hostel_leave_approved
**Category:** Utility | **Params:** 3
```
Hi {{1}}, your leave request from {{2}} to {{3}} has been approved. Please sign out at the hostel office before leaving. - JKKN Institutions
```
- {{1}} = Student name
- {{2}} = From date
- {{3}} = To date

---

## Template Naming Convention

Follow this pattern for all new templates:

```
{module}_{action}

Examples:
- admission_application_received
- billing_fee_reminder
- attendance_absence_alert
- academic_exam_schedule
- placement_opportunity
- library_book_due
- hostel_fee_reminder
```

Rules:
- Lowercase only
- Underscores for separation
- Module prefix always first
- Action in past tense for events, present for reminders
- Keep name under 50 characters (Meta limit: 512, but short is better)
