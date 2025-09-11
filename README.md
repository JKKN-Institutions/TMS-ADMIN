# TMS Admin Portal

A comprehensive Transportation Management System (TMS) admin portal built with Next.js 15, TypeScript, and Tailwind CSS.

## Features

### Multi-Role Authentication System

- **Super Admin**: Full system access and control
- **Transport Manager**: Manage routes, drivers, vehicles, and schedules
- **Finance Admin**: Handle payments and financial operations
- **Operations Admin**: Manage bookings, grievances, and notifications
- **Data Entry**: Manage student data and records

### Core Modules

- **Dashboard**: System overview with statistics and recent activities
- **Routes Management**: Create and manage transportation routes
- **Students Management**: Handle student profiles and transport access
- **Drivers Management**: Manage driver profiles and assignments
- **Vehicles Management**: Fleet management with maintenance tracking
- **Payments**: Financial transaction tracking and management
- **Schedules**: Route scheduling and availability management
- **Bookings**: Seat reservations and trip management
- **Notifications**: System-wide communication management
- **Grievances**: Complaint and feedback handling system
- **Analytics**: Data insights and reporting

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **Charts**: Recharts
- **State Management**: React Hooks

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Open [http://localhost:3001](http://localhost:3001) in your browser

### Demo Credentials

All admin roles use the same password: `admin123`

**Available Demo Users:**

- **Super Admin**: superadmin@tms.com
- **Transport Manager**: transport@tms.com
- **Finance Admin**: finance@tms.com
- **Operations Admin**: operations@tms.com
- **Data Entry**: dataentry@tms.com

## Project Structure

```
admin/
├── app/
│   ├── (admin)/          # Protected admin routes
│   │   ├── dashboard/    # Main dashboard
│   │   ├── routes/       # Routes management
│   │   ├── students/     # Students management
│   │   ├── drivers/      # Drivers management
│   │   ├── vehicles/     # Vehicles management
│   │   ├── payments/     # Payments management
│   │   └── layout.tsx    # Admin layout wrapper
│   ├── login/            # Authentication page
│   ├── globals.css       # Global styles
│   └── layout.tsx        # Root layout
├── types/
│   └── index.ts          # TypeScript interfaces
├── data/
│   └── users.ts          # Demo user data
└── README.md
```

## Key Features

### Responsive Design

- Mobile-first approach
- Responsive sidebar navigation
- Adaptive layouts for all screen sizes

### Role-Based Access Control

- Different permission levels for each role
- Menu items filtered based on user permissions
- Secure authentication flow

### Modern UI Components

- Custom CSS components with Tailwind
- Smooth animations and transitions
- Professional design system
- Dark mode support ready

### Data Management

- Comprehensive TypeScript interfaces
- Dummy data for immediate functionality
- Ready for API integration
- Search and filtering capabilities

## Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Configuration

The app runs on port 3001 by default. Configure in `package.json` scripts if needed.

## Integration Ready

### Database Integration

- Comprehensive TypeScript interfaces defined
- Ready for Supabase integration
- Prepared for real-time data updates

### API Integration

- Structured for REST API integration
- Authentication system ready for backend
- Role-based permission system prepared

### Customization

- Easy theme customization via CSS variables
- Modular component architecture
- Extensible data structures

## Development

### Adding New Features

1. Create new page in appropriate `(admin)/` folder
2. Add navigation item to layout
3. Define TypeScript interfaces in `types/`
4. Implement CRUD operations
5. Add role-based permissions

### Styling Guidelines

- Use existing CSS component classes
- Follow Tailwind utility-first approach
- Maintain consistent spacing and colors
- Ensure responsive design

## Support

This admin portal is designed to be production-ready with:

- Comprehensive error handling
- Loading states for all operations
- Toast notifications for user feedback
- Professional UI/UX patterns

## License

This project is part of the TMS (Transportation Management System) suite.
