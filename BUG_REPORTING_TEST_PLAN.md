# Bug Reporting System - Test Plan

## Test Environment Setup

### Prerequisites
1. **Database Setup**: Run the bug reporting migrations
2. **Storage Setup**: Configure Supabase storage bucket for attachments
3. **Admin User**: Create admin user with appropriate permissions
4. **Student User**: Create student user in passenger app

### Running the Applications

#### Admin App (Port 3000)
```bash
cd TMS-ADMIN
npm run dev
```

#### Passenger App (Port 3001)  
```bash
cd TMS-PASSENGER
npm run dev
```

## Testing Scenarios

### 🔥 **Phase 1: Basic Bug Reporting (Passenger App)**

#### Test 1.1: Floating Bug Button Visibility
- [ ] **PASS/FAIL**: Bug button appears in bottom-right corner
- [ ] **PASS/FAIL**: Button is red with bug icon
- [ ] **PASS/FAIL**: Button is visible on all pages after login
- [ ] **PASS/FAIL**: Button has hover animation

#### Test 1.2: Bug Report Form Opening
- [ ] **PASS/FAIL**: Clicking bug button opens modal
- [ ] **PASS/FAIL**: Modal has proper header with bug icon
- [ ] **PASS/FAIL**: Form fields are properly labeled
- [ ] **PASS/FAIL**: Close button works (X in top-right)

#### Test 1.3: Basic Form Validation
- [ ] **PASS/FAIL**: Cannot submit without title
- [ ] **PASS/FAIL**: Cannot submit without description
- [ ] **PASS/FAIL**: Character limits enforced (title: 255, description: 1000)
- [ ] **PASS/FAIL**: Appropriate error messages shown

#### Test 1.4: Screenshot Functionality
- [ ] **PASS/FAIL**: "Capture Screenshot" button visible
- [ ] **PASS/FAIL**: Clicking button captures page screenshot
- [ ] **PASS/FAIL**: Modal hides during capture for clean screenshot
- [ ] **PASS/FAIL**: Screenshot appears in file list after capture
- [ ] **PASS/FAIL**: Can remove captured screenshots

#### Test 1.5: File Upload System
- [ ] **PASS/FAIL**: "Upload Files" button works
- [ ] **PASS/FAIL**: Can select multiple files
- [ ] **PASS/FAIL**: Validates file types (images, text, PDF only)
- [ ] **PASS/FAIL**: Validates file size (10MB limit)
- [ ] **PASS/FAIL**: Shows error for invalid files
- [ ] **PASS/FAIL**: Can remove uploaded files

#### Test 1.6: System Information Collection
- [ ] **PASS/FAIL**: System info panel shows current browser info
- [ ] **PASS/FAIL**: Screen resolution displayed correctly
- [ ] **PASS/FAIL**: Platform information accurate
- [ ] **PASS/FAIL**: Online/offline status correct

#### Test 1.7: Bug Submission
- [ ] **PASS/FAIL**: Submission works with minimum required fields
- [ ] **PASS/FAIL**: Submission includes screenshots and files
- [ ] **PASS/FAIL**: Success message displayed after submission
- [ ] **PASS/FAIL**: Form resets after successful submission
- [ ] **PASS/FAIL**: Modal closes after submission

### 🛠️ **Phase 2: Admin Bug Management**

#### Test 2.1: Admin Navigation
- [ ] **PASS/FAIL**: "Bug Management" appears in admin sidebar
- [ ] **PASS/FAIL**: Link navigates to /bug-management
- [ ] **PASS/FAIL**: Page loads without errors
- [ ] **PASS/FAIL**: Proper admin authentication check

#### Test 2.2: Bug Management Dashboard
- [ ] **PASS/FAIL**: Statistics cards display correctly
- [ ] **PASS/FAIL**: Bug counts are accurate
- [ ] **PASS/FAIL**: Overview tab shows recent activity
- [ ] **PASS/FAIL**: Priority issues section populated

#### Test 2.3: Bug List Management
- [ ] **PASS/FAIL**: Bug reports tab shows submitted bugs
- [ ] **PASS/FAIL**: Bug list displays properly formatted
- [ ] **PASS/FAIL**: Bug cards show essential information
- [ ] **PASS/FAIL**: Click to view bug details works

#### Test 2.4: Bug Filtering System
- [ ] **PASS/FAIL**: Search by title/description works
- [ ] **PASS/FAIL**: Filter by status works
- [ ] **PASS/FAIL**: Filter by severity works
- [ ] **PASS/FAIL**: Filter by category works
- [ ] **PASS/FAIL**: Clear filters resets all filters

#### Test 2.5: Bug Details Modal
- [ ] **PASS/FAIL**: Modal opens with complete bug information
- [ ] **PASS/FAIL**: Reporter details displayed
- [ ] **PASS/FAIL**: System information shown
- [ ] **PASS/FAIL**: Attachments/screenshots visible
- [ ] **PASS/FAIL**: Comments section functional

#### Test 2.6: Bug Status Management
- [ ] **PASS/FAIL**: Can change bug status
- [ ] **PASS/FAIL**: Status change creates history entry
- [ ] **PASS/FAIL**: Resolved/closed timestamps update
- [ ] **PASS/FAIL**: Status change reflects in bug list

#### Test 2.7: Bug Assignment
- [ ] **PASS/FAIL**: Can assign bug to admin user
- [ ] **PASS/FAIL**: Assignment shows in bug details
- [ ] **PASS/FAIL**: Assignment timestamp recorded
- [ ] **PASS/FAIL**: Can reassign or unassign bugs

#### Test 2.8: Comments System
- [ ] **PASS/FAIL**: Can add comments to bugs
- [ ] **PASS/FAIL**: Comments display with timestamp and author
- [ ] **PASS/FAIL**: Internal comments option works
- [ ] **PASS/FAIL**: Comment history preserved

#### Test 2.9: Export Functionality
- [ ] **PASS/FAIL**: Export button generates CSV file
- [ ] **PASS/FAIL**: CSV contains all bug information
- [ ] **PASS/FAIL**: File downloads correctly
- [ ] **PASS/FAIL**: Data formatting is proper in CSV

### 🔒 **Phase 3: Security & Access Control**

#### Test 3.1: User Access Control
- [ ] **PASS/FAIL**: Users only see their own bug reports
- [ ] **PASS/FAIL**: Cannot access other users' bugs via API
- [ ] **PASS/FAIL**: Unauthenticated users cannot submit bugs
- [ ] **PASS/FAIL**: Bug button doesn't show when not logged in

#### Test 3.2: Admin Access Control
- [ ] **PASS/FAIL**: Admins see all bug reports
- [ ] **PASS/FAIL**: Non-admin users cannot access admin interface
- [ ] **PASS/FAIL**: Admin permissions properly validated
- [ ] **PASS/FAIL**: RLS policies working correctly

#### Test 3.3: File Security
- [ ] **PASS/FAIL**: Files are stored securely
- [ ] **PASS/FAIL**: File access requires proper permissions
- [ ] **PASS/FAIL**: Cannot access files from other users' bugs
- [ ] **PASS/FAIL**: File URLs are signed and expire

### 📊 **Phase 4: Performance & Analytics**

#### Test 4.1: Performance Testing
- [ ] **PASS/FAIL**: Bug list loads quickly with many records
- [ ] **PASS/FAIL**: File uploads handle large files appropriately
- [ ] **PASS/FAIL**: Screenshot capture is responsive
- [ ] **PASS/FAIL**: Modal animations smooth

#### Test 4.2: Analytics Dashboard
- [ ] **PASS/FAIL**: Bug statistics calculate correctly
- [ ] **PASS/FAIL**: Resolution time metrics accurate
- [ ] **PASS/FAIL**: Charts and graphs display properly
- [ ] **PASS/FAIL**: Data refreshes appropriately

### 🌐 **Phase 5: Cross-Platform Testing**

#### Test 5.1: Browser Compatibility
- [ ] **PASS/FAIL**: Works in Chrome
- [ ] **PASS/FAIL**: Works in Firefox  
- [ ] **PASS/FAIL**: Works in Safari
- [ ] **PASS/FAIL**: Works in Edge

#### Test 5.2: Mobile Responsiveness
- [ ] **PASS/FAIL**: Bug button visible on mobile
- [ ] **PASS/FAIL**: Modal responsive on mobile screens
- [ ] **PASS/FAIL**: File upload works on mobile
- [ ] **PASS/FAIL**: Admin interface mobile-friendly

#### Test 5.3: Device Features
- [ ] **PASS/FAIL**: Camera access for screenshots (where available)
- [ ] **PASS/FAIL**: File picker works on all devices
- [ ] **PASS/FAIL**: Touch interactions work properly

## Test Data Required

### Sample Bug Reports
1. **UI Bug**: "Button not clickable on mobile"
2. **Functional Bug**: "Payment process fails at verification"
3. **Performance Issue**: "Page loads slowly on dashboard"
4. **Critical Bug**: "App crashes when uploading large files"
5. **Feature Request**: "Add dark mode toggle"

### Test Files for Upload
- **Images**: PNG, JPG, GIF (various sizes)
- **Documents**: PDF, TXT files
- **Invalid Files**: .exe, .zip (should be rejected)
- **Large Files**: Files > 10MB (should be rejected)

## Success Criteria

### 🎯 **Must Pass (Critical)**
- All basic bug reporting functionality works
- Admin can view and manage all bugs
- Security controls prevent unauthorized access
- File uploads and screenshots work reliably

### 🎯 **Should Pass (Important)**
- Advanced filtering and search work
- Analytics and statistics are accurate
- Export functionality works correctly
- Mobile experience is usable

### 🎯 **Nice to Have (Enhancement)**
- Performance is optimal under load
- Advanced admin features work smoothly
- Cross-browser compatibility is perfect

## Bug Report Template for Testing

```
Title: [Test Bug] Button not responding on checkout page
Description: When clicking the "Pay Now" button on the checkout page, nothing happens. The button appears clickable but no action is triggered.

Steps to Reproduce:
1. Go to dashboard
2. Navigate to payments section
3. Click "Pay Now" button
4. Observe that nothing happens

Expected Behavior: Payment modal should open
Actual Behavior: Button click has no effect

Category: Functional Bug
Severity: High
```

## Notes for Testers

1. **Clear Browser Data**: Clear localStorage/cookies between tests
2. **Test in Incognito**: Use private/incognito mode for clean testing
3. **Network Conditions**: Test on different network speeds
4. **Error Console**: Check browser console for JavaScript errors
5. **Database State**: Verify database entries after each test
6. **File Storage**: Check Supabase storage for uploaded files

## Reporting Test Results

For each test, record:
- ✅ **PASS**: Feature works as expected
- ❌ **FAIL**: Feature doesn't work, note specific issue
- ⚠️ **PARTIAL**: Feature partially works, note limitations
- 🔄 **SKIP**: Test couldn't be completed, note reason

Create detailed bug reports for any failures using the bug reporting system itself!

