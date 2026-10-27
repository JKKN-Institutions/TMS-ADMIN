import { redirect } from 'next/navigation';

// GPS Devices and Tracking Mobiles are now two tabs of one page.
export default function GpsDevicesPage() {
  redirect('/tracking-devices?tab=gps');
}
