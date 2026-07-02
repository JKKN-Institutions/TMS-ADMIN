# JKKN TMS Driver — Privacy Policy (DRAFT template)

> **This is a drafting template, not legal advice.** Review it with JKKN's administration/legal
> before publishing. Replace every **[BRACKETED]** placeholder. Host the final version at a
> public HTTPS URL and enter that URL in Google Play Console (App content → Privacy policy) and in
> the app store listing.

**App:** JKKN TMS Driver (`in.ac.jkkn.tms.driver`)
**Provider:** [JKKN EDUCATIONAL INSTITUTIONS — full legal name]
**Contact:** [privacy contact email] · [postal address]
**Last updated:** [DATE]

## 1. Who this app is for
The JKKN TMS Driver app is an internal tool for **authorized JKKN transport drivers**. Access
requires a JKKN-provisioned account. It is not intended for the general public.

## 2. What data we collect
- **Precise location (GPS):** latitude, longitude, accuracy, speed, and heading of the vehicle.
- **Account identity:** your JKKN sign-in (Google account email/ID) used only to authenticate you
  and associate location with your assigned route/vehicle.
- **Basic device/technical data** needed to operate the service (e.g., app/session identifiers).

We do **not** collect contacts, photos, messages, or advertising identifiers, and we do **not**
use your data for advertising.

## 3. When and why we collect location — including in the background
Location is collected **only while you are "On Duty"** (you explicitly tap *Go On Duty* and grant
location permission). While On Duty, the app collects location **continuously, including when the
screen is off or the app is in the background**, so that the transport office, administrators, and
students can see the bus's real-time position for the duration of the trip.

- A persistent notification is shown the entire time location sharing is active.
- Collection **stops immediately** when you tap *Go Off Duty*, or when you revoke the location
  permission in Android settings.
- Background ("Allow all the time") location access is used **solely** for live route tracking; it
  is never used when you are Off Duty.

## 4. How we use the data
- Show the vehicle's live position to authorized JKKN staff, administrators, and enrolled students
  tracking their bus.
- Operate transport features (route monitoring, arrival awareness, safety oversight).
- Maintain a limited location history for operational review of trips.

## 5. Sharing
Location and account data are processed within the JKKN Transport Management System and its
service provider(s) (e.g., the hosting/database provider). We do **not** sell your data or share
it with advertisers. Data may be disclosed if required by law.

## 6. Retention
Location history is retained for **[RETENTION PERIOD — e.g., 90 days]** for operational review,
then deleted or anonymized, unless a longer period is required by law or JKKN policy.

## 7. Your controls
- Start/stop sharing anytime with *Go On Duty* / *Go Off Duty*.
- Revoke location permission in **Android → Settings → Apps → JKKN TMS Driver → Permissions**.
- Request access to or deletion of your data by contacting [privacy contact email].

## 8. Security
Data is transmitted over HTTPS and access is restricted to authorized JKKN accounts and systems.

## 9. Children
This app is for adult, authorized drivers only and is not directed to children.

## 10. Changes
We may update this policy; the "Last updated" date will change and material changes will be
communicated through the app or by JKKN transport administration.

---

## Play Console — background location declaration (paste/adapt)

**Which feature requires background location?**
> Real-time school-bus tracking. When a driver goes "On Duty", the app runs a foreground-service
> location watcher that reports the bus's GPS position continuously — including while the phone is
> locked or the app is backgrounded — so the transport office, administrators, and enrolled
> students can see the bus's live location for the entire route/trip.

**Why "Allow all the time" (background) is required and foreground-only is insufficient:**
> Drivers keep the phone pocketed/mounted with the screen off while driving. Foreground/while-in-use
> location stops delivering when the screen locks or the driver switches apps, which freezes the
> bus position mid-route and defeats the safety/tracking purpose. Continuous background location is
> essential for uninterrupted live tracking during a trip. Collection is strictly gated behind an
> explicit "On Duty" action, shows a persistent notification, and stops on "Go Off Duty".

**Data safety form summary:**
> Collects: Precise location (app functionality; not shared with third parties for ads; data is
> encrypted in transit). Collection is optional per-trip (driver-initiated) and can be stopped by
> the user at any time. [Confirm the exact toggles against JKKN's actual data handling before
> submitting.]
