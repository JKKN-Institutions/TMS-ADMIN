import { describe, expect, it } from 'vitest';
import type { DriverListItem } from '@/types';
import { emptyPerson, personFromDriver, toDateInput } from './person-form';

function driver(person: Partial<DriverListItem['person']> = {}, ops: Partial<NonNullable<DriverListItem['ops']>> | null = null): DriverListItem {
  return {
    id: 's1', name: 'A B', firstName: 'A', lastName: 'B', designation: 'Bus Driver', phone: '', email: '',
    employmentType: '', status: '', isActive: true, dateOfJoining: null, avatarUrl: null, institutionId: 'i',
    profileId: null, routes: [], canFullEdit: true,
    ops: ops ? ({ ...ops } as NonNullable<DriverListItem['ops']>) : null,
    person: {
      firstName: 'A', lastName: 'B', gender: 'male', dateOfBirth: '1990-05-04T00:00:00+00:00', maritalStatus: 'single',
      bloodGroup: null, phone: '9876543210', email: 'a@x.com', institutionEmail: 'a@jkkn.ac.in',
      address: null, state: null, district: null, pincode: null,
      emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null,
      staffCode: 'NOTJMO1', dateOfJoining: '2024-01-02', designation: 'Bus Driver',
      biometricId: null, biometricInstitutionId: null, isActive: true, photoUrl: null, updatedAt: null,
      ...person,
    },
  };
}

describe('emptyPerson', () => {
  it('uses the driver defaults', () => {
    const p = emptyPerson();
    expect(p).toMatchObject({ gender: 'male', maritalStatus: 'single', designation: 'Bus Driver', isActive: true });
  });
});

describe('toDateInput', () => {
  it('cuts timestamps to the date', () => {
    expect(toDateInput('1990-05-04T00:00:00+00:00')).toBe('1990-05-04');
    expect(toDateInput(null)).toBe('');
  });
});

describe('personFromDriver', () => {
  it('maps staff values and cuts dates', () => {
    const p = personFromDriver(driver());
    expect(p.dateOfBirth).toBe('1990-05-04');
    expect(p.institutionEmailName).toBe('');
    expect(p.bloodGroup).toBe('');
  });

  it('falls back to the operational copies when staff values are empty', () => {
    const p = personFromDriver(driver({}, { address: 'Salem', emergencyContactName: 'Rani', emergencyContactPhone: '9000000000' }));
    expect(p.address).toBe('Salem');
    expect(p.emergencyContactName).toBe('Rani');
    expect(p.emergencyContactPhone).toBe('9000000000');
  });

  it('prefers the staff value over the operational copy', () => {
    const p = personFromDriver(driver({ address: 'Erode' }, { address: 'Salem' }));
    expect(p.address).toBe('Erode');
  });

  it('keeps a listed relationship as is', () => {
    const p = personFromDriver(driver({ emergencyContactRelationship: 'Mother' }));
    expect(p.emergencyContactRelationship).toBe('Mother');
    expect(p.emergencyContactRelationshipOther).toBe('');
  });

  it('turns an unlisted relationship into Other plus the stored text', () => {
    const p = personFromDriver(driver({ emergencyContactRelationship: 'Uncle' }));
    expect(p.emergencyContactRelationship).toBe('Other');
    expect(p.emergencyContactRelationshipOther).toBe('Uncle');
  });
});
