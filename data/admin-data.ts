// Temporary mock data file to prevent import errors
// All components should be updated to fetch data from the database instead

export const studentsData: any[] = []
export const routesData: any[] = []
export const driversData: any[] = []
export const vehiclesData: any[] = []
export const bookingsData: any[] = []
export const paymentsData: any[] = []
export const grievancesData: any[] = []
export const notificationsData: any[] = []
export const liveVehiclePositions: any[] = []

// This file should be completely removed once all components are updated to use DatabaseService
console.warn('WARNING: admin-data.ts is deprecated. Components should use DatabaseService instead.') 