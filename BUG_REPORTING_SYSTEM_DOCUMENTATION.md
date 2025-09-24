# Bug Reporting System Documentation

## Overview

The Bug Reporting System provides a comprehensive solution for users to report issues and bugs directly from the passenger application, with a full-featured management interface for administrators. This system includes screenshot capture, file attachments, detailed system information collection, and complete bug lifecycle management.

## Features

### For Users (Passenger App)
- **Floating Bug Report Button**: Always accessible bug reporting button with bug icon
- **Screenshot Capture**: Automatic screenshot capture of the current page
- **File Attachments**: Support for uploading images, text files, and PDFs
- **Detailed Form**: Comprehensive bug reporting form with categorization
- **System Information**: Automatic collection of browser, device, and system info
- **User-Friendly Interface**: Clean, intuitive design with step-by-step process

### For Administrators (Admin App)
- **Bug Management Dashboard**: Complete overview of all bug reports
- **Status Management**: Update bug status through complete lifecycle
- **Assignment System**: Assign bugs to specific team members
- **Comments System**: Internal and public comments with threaded discussions
- **Analytics**: Bug statistics, resolution times, and performance metrics
- **File Management**: View and download attachments and screenshots
- **Filter & Search**: Advanced filtering and search capabilities
- **Export Functionality**: Export bug reports to CSV for external analysis

## Technical Implementation

### Database Schema

The system uses the following database tables:

#### `bug_reports`
- Core bug report information
- Reporter details and system information
- Status, priority, and severity tracking
- Assignment and resolution tracking

#### `bug_attachments`
- File attachments and screenshots
- Secure file storage with access controls
- File metadata and type validation

#### `bug_comments`
- Comments and updates on bug reports
- Support for internal admin-only comments
- Comment threading and history

#### `bug_status_history`
- Complete audit trail of status changes
- Change tracking with reason and admin details

#### `bug_labels` & `bug_report_labels`
- Tagging system for categorization
- Customizable labels with colors

### API Endpoints

#### Passenger App (`TMS-PASSENGER`)
- `POST /api/bug-reports` - Submit new bug report with files
- `GET /api/bug-reports` - Get user's bug reports

#### Admin App (`TMS-ADMIN`)
- `GET /api/admin/bug-reports` - List and filter bug reports
- `POST /api/admin/bug-reports` - Update bugs (status, assignment, comments)

### Storage Configuration

Uses Supabase Storage with:
- Private bucket `bug-attachments`
- 10MB file size limit
- Supported formats: images, text files, PDFs
- Secure access policies based on user permissions

## Installation & Setup

### 1. Database Migration

Run the bug reporting system migrations:

```sql
-- Run these SQL files in order:
-- 1. supabase/34-bug-reporting-system.sql
-- 2. supabase/35-bug-storage-setup.sql
```

### 2. Environment Variables

Ensure these environment variables are set:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Install Dependencies

For the passenger app:
```bash
cd TMS-PASSENGER
npm install html2canvas
```

### 4. Supabase Storage Setup

Create the storage bucket in Supabase dashboard:
- Bucket name: `bug-attachments`
- Public: false (private)
- File size limit: 10MB
- Allowed MIME types: images, text, PDF

## Usage Guide

### For Users

1. **Reporting a Bug**:
   - Click the floating red bug button (bottom-right)
   - Fill in the bug details (title and description are required)
   - Select appropriate category and severity
   - Optionally capture screenshots or upload files
   - Add steps to reproduce, expected vs actual behavior
   - Submit the report

2. **Screenshot Capture**:
   - Click "Capture Screenshot" button
   - The modal will hide temporarily for clean capture
   - Screenshot is automatically added to attachments

3. **File Uploads**:
   - Click "Upload Files" to select files
   - Supported: Images (PNG, JPG, GIF, WebP), Text files, PDFs
   - Maximum 10MB per file

### For Administrators

1. **Accessing Bug Management**:
   - Navigate to "Bug Management" in the admin sidebar
   - View overview dashboard with key metrics

2. **Managing Bug Reports**:
   - Use filters to find specific bugs (status, severity, category)
   - Click on any bug to view full details
   - Update status, assign to team members
   - Add comments (internal or public)
   - View system information and attachments

3. **Bug Lifecycle**:
   - **Open**: New bug reports start here
   - **In Progress**: Bug is being actively worked on
   - **Resolved**: Bug has been fixed
   - **Closed**: Bug is confirmed resolved and closed
   - **Duplicate**: Bug is a duplicate of another report
   - **Won't Fix**: Bug will not be addressed

4. **Analytics & Reporting**:
   - View bug statistics and trends
   - Monitor resolution times
   - Export data for external analysis

## Security Features

### Access Control
- Row Level Security (RLS) policies ensure users only see their own bugs
- Admins have full access to all bug reports
- File access is restricted based on bug access permissions

### Data Validation
- Input sanitization and validation
- File type and size restrictions
- CSRF protection on all endpoints

### Privacy
- System information collection is limited to technical details
- No sensitive user data is collected automatically
- Files are stored securely with access controls

## Monitoring & Maintenance

### Regular Tasks

1. **Review Bug Reports**: Check new reports daily
2. **Update Statuses**: Keep bug statuses current
3. **Clean Up Storage**: Monitor storage usage for attachments
4. **Analytics Review**: Regular review of bug patterns and metrics

### Maintenance Functions

```sql
-- Clean up orphaned attachments
SELECT cleanup_orphaned_bug_attachments();

-- Get storage statistics
SELECT * FROM get_bug_attachment_stats();

-- View bug report statistics
SELECT * FROM bug_report_stats;
```

## Best Practices

### For Users
- Provide clear, descriptive titles
- Include steps to reproduce the issue
- Attach relevant screenshots
- Use appropriate severity levels
- Provide expected vs actual behavior details

### For Administrators
- Respond to critical bugs within 24 hours
- Keep users informed of progress
- Use internal comments for team coordination
- Maintain clear resolution documentation
- Regular triage and prioritization

## Troubleshooting

### Common Issues

1. **Screenshot not capturing**: Check browser permissions and HTTPS
2. **File upload fails**: Verify file size and type restrictions
3. **Bug not visible to admin**: Check RLS policies and admin permissions
4. **Storage errors**: Verify Supabase storage configuration

### Error Codes
- `400`: Bad request (missing required fields)
- `401`: Unauthorized (invalid admin credentials)
- `413`: Payload too large (file size limit exceeded)
- `415`: Unsupported media type (invalid file type)

## Future Enhancements

### Planned Features
- Email notifications for bug updates
- Integration with external bug tracking systems
- Automated bug categorization using AI
- Real-time collaboration on bug reports
- Mobile app optimization
- Advanced analytics and reporting

### Performance Optimizations
- Implement caching for bug statistics
- Optimize file storage and delivery
- Add pagination for large bug lists
- Background processing for file operations

## Support

For technical support or questions about the bug reporting system:
- Check the troubleshooting section above
- Review the API documentation
- Contact the development team
- Submit a bug report using the system itself!

---

**Version**: 1.0  
**Last Updated**: December 2024  
**Author**: JKKN TMS Development Team

