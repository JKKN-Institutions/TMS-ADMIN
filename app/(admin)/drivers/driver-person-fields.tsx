'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ImagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { indianStates } from '@/lib/data/locations';
import {
  BLOOD_GROUPS,
  DRIVER_INSTITUTION_ID,
  GENDERS,
  INSTITUTION_EMAIL_SUFFIX,
  MARITAL_STATUSES,
  RELATIONSHIPS,
} from '@/lib/drivers/onboarding-constants';
import type { DriverPersonInput, FieldErrors } from '@/lib/drivers/staff-fields';
import { Field, SectionCard } from './driver-page-header';

export { emptyPerson, personFromDriver } from '@/lib/drivers/person-form';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A labelled input with a red star when required and an inline error underneath. */
function Labeled({
  id,
  label,
  required,
  error,
  className = '',
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`min-w-0 text-sm ${className}`}>
      <label htmlFor={id} className="text-gray-600">
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="mt-1">{children}</div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default function DriverPersonFields({
  mode,
  value,
  errors,
  staffCode,
  institutionEmail,
  onChange,
  photo,
}: {
  mode: 'create' | 'edit';
  value: DriverPersonInput;
  errors: FieldErrors;
  staffCode: string | null;
  institutionEmail: string | null;
  onChange: (k: keyof DriverPersonInput, v: string | boolean) => void;
  photo: { currentUrl: string | null; file: File | null; onPick: (f: File | null) => void };
}) {
  const id = (k: keyof DriverPersonInput) => `dp-${k}`;
  const aria = (k: keyof DriverPersonInput) => ({
    id: id(k),
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `${id(k)}-error` : undefined,
  });
  const text = (k: keyof DriverPersonInput) => ({
    ...aria(k),
    className: 'input',
    value: value[k] as string,
    onChange: (e: { target: { value: string } }) => onChange(k, e.target.value),
  });

  // State / district lists. A stored name that is not in the list is added so it is shown and kept.
  const stateNames = useMemo(() => {
    const names = indianStates.map((s) => s.name);
    if (value.state && !names.includes(value.state)) names.push(value.state);
    return names;
  }, [value.state]);
  const districtNames = useMemo(() => {
    const names = indianStates.find((s) => s.name === value.state)?.districts.map((d) => d.name) ?? [];
    if (value.district && !names.includes(value.district)) names.push(value.district);
    return names;
  }, [value.state, value.district]);

  // Round preview of the picked photo; the object URL is released on change and unmount.
  const fileInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo.file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.file]);
  const shownPhoto = previewUrl ?? photo.currentUrl;

  const onFile = (f: File | null) => {
    if (f && f.size > MAX_PHOTO_BYTES) {
      toast.error('That photo is larger than 5 MB. Please choose a smaller one.');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    photo.onPick(f);
  };

  const grid = 'grid grid-cols-1 gap-4 md:grid-cols-2';

  return (
    <>
      <SectionCard title="Personal details">
        <div className={grid}>
          <Labeled id={id('firstName')} label="First name" required error={errors.firstName}>
            <input {...text('firstName')} autoComplete="given-name" />
          </Labeled>
          <Labeled id={id('lastName')} label="Last name" required error={errors.lastName}>
            <input {...text('lastName')} autoComplete="family-name" />
          </Labeled>
          <Labeled id={id('gender')} label="Gender" required error={errors.gender}>
            <select {...text('gender')}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {titleCase(g)}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id={id('dateOfBirth')} label="Date of birth" required error={errors.dateOfBirth}>
            <input type="date" {...text('dateOfBirth')} />
          </Labeled>
          <Labeled id={id('maritalStatus')} label="Marital status" required error={errors.maritalStatus}>
            <select {...text('maritalStatus')}>
              {MARITAL_STATUSES.map((m) => (
                <option key={m} value={m}>
                  {titleCase(m)}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id={id('bloodGroup')} label="Blood group" error={errors.bloodGroup}>
            <select {...text('bloodGroup')}>
              <option value="">Not known</option>
              {BLOOD_GROUPS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Labeled>

          <div className="min-w-0 text-sm md:col-span-2">
            <p className="text-gray-600">Photo</p>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              {shownPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownPhoto} alt="Driver photo" className="h-20 w-20 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/10">
                  <ImagePlus className="h-6 w-6" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 space-y-1">
                <input
                  ref={fileInput}
                  id="dp-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/gif"
                  aria-label="Choose a photo"
                  className="block max-w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-gray-500">JPG, PNG or GIF, up to 5 MB. It is saved when you save the driver.</p>
                {photo.file && (
                  <button
                    type="button"
                    className="text-xs font-medium text-green-600 hover:underline"
                    onClick={() => {
                      if (fileInput.current) fileInput.current.value = '';
                      photo.onPick(null);
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Contact & address">
        <div className={grid}>
          <Labeled id={id('phone')} label="Phone" required error={errors.phone}>
            <input type="tel" inputMode="tel" {...text('phone')} autoComplete="tel" />
          </Labeled>
          <Labeled id={id('email')} label="Personal email" error={errors.email}>
            <input type="email" {...text('email')} autoComplete="email" />
          </Labeled>

          {mode === 'create' ? (
            <Labeled
              id={id('institutionEmailName')}
              label="Institution email"
              required
              error={errors.institutionEmailName}
              className="md:col-span-2"
            >
              <div className="flex min-w-0 items-center rounded-lg border border-gray-300 bg-white focus-within:border-green-600 focus-within:ring-1 focus-within:ring-green-600 dark:bg-transparent">
                <input
                  {...aria('institutionEmailName')}
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none"
                  value={value.institutionEmailName}
                  onChange={(e) => onChange('institutionEmailName', e.target.value)}
                  placeholder="firstname.lastname"
                  autoCapitalize="none"
                />
                <span className="shrink-0 pr-3 text-sm text-gray-500">{INSTITUTION_EMAIL_SUFFIX}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">The driver signs in to MyJKKN with this email.</p>
            </Labeled>
          ) : (
            <div className="min-w-0 md:col-span-2">
              <Field label="Institution email" value={institutionEmail} />
              <p className="mt-1 text-xs text-gray-500">Login identity — changed in MyJKKN only.</p>
            </div>
          )}

          <Labeled id={id('address')} label="Address" error={errors.address} className="md:col-span-2">
            <textarea {...text('address')} rows={2} autoComplete="street-address" />
          </Labeled>
          <Labeled id={id('state')} label="State" required error={errors.state}>
            <select
              {...aria('state')}
              className="input"
              value={value.state}
              onChange={(e) => {
                onChange('state', e.target.value);
                onChange('district', '');
              }}
            >
              <option value="">Select state</option>
              {stateNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id={id('district')} label="District" required error={errors.district}>
            <select {...text('district')} disabled={!value.state}>
              <option value="">{value.state ? 'Select district' : 'Choose a state first'}</option>
              {districtNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id={id('pincode')} label="PIN code" error={errors.pincode}>
            <input inputMode="numeric" {...text('pincode')} autoComplete="postal-code" />
          </Labeled>
        </div>
      </SectionCard>

      <SectionCard title="Emergency contact">
        <div className={grid}>
          <Labeled id={id('emergencyContactName')} label="Contact name" error={errors.emergencyContactName}>
            <input {...text('emergencyContactName')} />
          </Labeled>
          <Labeled id={id('emergencyContactPhone')} label="Contact phone" error={errors.emergencyContactPhone}>
            <input type="tel" inputMode="tel" {...text('emergencyContactPhone')} />
          </Labeled>
          <Labeled
            id={id('emergencyContactRelationship')}
            label="Relationship"
            error={errors.emergencyContactRelationship}
          >
            <select {...text('emergencyContactRelationship')}>
              <option value="">Select relationship</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Labeled>
          {value.emergencyContactRelationship === 'Other' && (
            <Labeled
              id={id('emergencyContactRelationshipOther')}
              label="How are they related?"
              required
              error={errors.emergencyContactRelationshipOther}
            >
              <input {...text('emergencyContactRelationshipOther')} />
            </Labeled>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Employment">
        <div className={grid}>
          <div className="min-w-0">
            <Field label="Staff ID" value={staffCode ?? (mode === 'create' ? 'Generated automatically on save' : '')} />
          </div>
          <Labeled id={id('designation')} label="Designation" required error={errors.designation}>
            <input {...text('designation')} />
          </Labeled>
          <Labeled id={id('dateOfJoining')} label="Date of joining" required error={errors.dateOfJoining}>
            <input type="date" {...text('dateOfJoining')} />
          </Labeled>
          <Labeled id={id('isActive')} label="Status" required error={errors.isActive}>
            <select
              {...aria('isActive')}
              className="input"
              value={value.isActive ? 'active' : 'inactive'}
              onChange={(e) => onChange('isActive', e.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Labeled>
          <Labeled id={id('biometricId')} label="Biometric code" error={errors.biometricId}>
            <input {...text('biometricId')} />
          </Labeled>
          <Labeled id={id('biometricInstitutionId')} label="Biometric machine" error={errors.biometricInstitutionId}>
            <select {...text('biometricInstitutionId')}>
              <option value="">Not enrolled</option>
              <option value={DRIVER_INSTITUTION_ID}>JKKN Main Office</option>
              {value.biometricInstitutionId &&
                value.biometricInstitutionId !== DRIVER_INSTITUTION_ID && (
                  <option value={value.biometricInstitutionId}>Another machine (already saved)</option>
                )}
            </select>
          </Labeled>
        </div>
      </SectionCard>
    </>
  );
}
