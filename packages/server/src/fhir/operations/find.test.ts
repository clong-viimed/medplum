// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type {
  Appointment,
  Bundle,
  CodeableConcept,
  Coding,
  Extension,
  HealthcareService,
  Location,
  Practitioner,
  Project,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import express from 'express';
import supertest from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { SystemRepository } from '../../fhir/repo';
import { createTestProject } from '../../test.setup';
import type { SchedulingParametersExtensionExtension } from './utils/scheduling-parameters';

const app = express();
const request = supertest(app);

type AvailabilityOptions = {
  bufferBefore?: number;
  bufferAfter?: number;
  alignmentInterval?: number;
  alignmentOffset?: number;
  duration?: number;
  availability: SchedulingParametersExtensionExtension;
  timezone?: string;
};

const fourDayWorkWeek = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'availableStartTime', valueTime: '09:30:00' },
        { url: 'availableEndTime', valueTime: '12:30:00' },
      ],
    },
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'availableStartTime', valueTime: '13:15:00' },
        { url: 'availableEndTime', valueTime: '16:15:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const twoDaySchedule = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'thu' },
        { url: 'daysOfWeek', valueCode: 'fri' },
        { url: 'availableStartTime', valueTime: '12:00:00' },
        { url: 'availableEndTime', valueTime: '20:00:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const fridayOnly = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'fri' },
        { url: 'availableStartTime', valueTime: '10:30:00' },
        { url: 'availableEndTime', valueTime: '18:30:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const monTueAvailability = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'mon' },
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'availableStartTime', valueTime: '09:00:00' },
        { url: 'availableEndTime', valueTime: '17:00:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;

const tueWedAvailability = {
  url: 'availability',
  extension: [
    {
      url: 'availableTime',
      extension: [
        { url: 'daysOfWeek', valueCode: 'tue' },
        { url: 'daysOfWeek', valueCode: 'wed' },
        { url: 'availableStartTime', valueTime: '13:00:00' },
        { url: 'availableEndTime', valueTime: '18:00:00' },
      ],
    },
  ],
} satisfies SchedulingParametersExtensionExtension;
describe('Schedule/:id/$find', () => {
  let location: Location;
  let practitioner: Practitioner;
  let project: WithId<Project>;
  let accessToken: string;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const projectResult = await createTestProject({ withAccessToken: true, withRepo: true });
    project = projectResult.project;
    accessToken = projectResult.accessToken;
    systemRepo = projectResult.repo.getSystemRepo();

    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
    location = await systemRepo.createResource<Location>({
      resourceType: 'Location',
      meta: { project: project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/Phoenix' }],
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function makeSchedulingExtension(availability: Record<string, AvailabilityOptions>): Extension[] {
    return Object.entries(availability).map(([serviceType, options]) => {
      const { availability, timezone, ...durations } = options;

      const extension = {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [] as Extension[],
      } satisfies Extension;

      if (availability) {
        extension.extension.push(availability);
      }

      if (timezone) {
        extension.extension.push({
          url: 'timezone',
          valueCode: timezone,
        });
      }

      extension.extension.push({
        url: 'serviceType',
        valueCodeableConcept: {
          coding: [{ code: serviceType, system: 'http://example.com' }],
        },
      });

      Object.entries(durations).forEach(([key, value]) =>
        extension.extension.push({ url: key, valueDuration: { value, unit: 'min' } })
      );

      return extension;
    });
  }

  async function makeSchedule(
    availability: Record<string, AvailabilityOptions>,
    opts?: { actor?: Schedule['actor'] }
  ): Promise<Schedule> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: opts?.actor ?? [createReference(practitioner)],
      extension: makeSchedulingExtension(availability),
    });
  }

  async function makeSlot(params: {
    start: Date;
    end: Date;
    status: 'busy' | 'free' | 'busy-unavailable';
    schedule: Schedule;
    serviceType?: CodeableConcept[];
  }): Promise<Slot> {
    return systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      start: params.start.toISOString(),
      end: params.end.toISOString(),
      status: params.status,
      schedule: createReference(params.schedule),
      serviceType: params.serviceType,
    });
  }

  test('searching an interval not overlapping availability returns an empty bundle', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 20 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00'),
        end: new Date('2025-12-01T09:00:00.000-05:00'),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
    });
    expect(response.body).not.toHaveProperty('entry');
  });

  test('finds slots that overlap with the availability in the range', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 20 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00'),
        end: new Date('2025-12-01T14:00:00.000-05:00'),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T12:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('discovers and removes busy slots from the search results', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 20 },
    });
    await makeSlot({
      start: new Date('2025-12-01T11:10:00.000-05:00'),
      end: new Date('2025-12-01T11:40:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-01T14:00:00.000-05:00').toISOString(),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        // 11:10 - 11:40 is busy, so the 11:00-11:20 slot is not returned here
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T12:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('discovers and adds "free" slots into the search results', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 20 },
    });

    // Free slots with no service type can be used for any service type
    await makeSlot({
      start: new Date('2025-12-01T09:00:00.000-05:00'),
      end: new Date('2025-12-01T10:00:00.000-05:00'),
      status: 'free',
      schedule,
    });

    // Free slots with a service type that matches the service type from the scheduling
    // parameters used can be chosen
    await makeSlot({
      start: new Date('2025-12-01T13:00:00.000-05:00'),
      end: new Date('2025-12-01T14:00:00.000-05:00'),
      status: 'free',
      schedule,
      serviceType: [{ coding: [{ system: 'http://example.com', code: 'generic-visit' }] }],
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-01T14:00:00.000-05:00').toISOString(),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T09:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T09:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [
              {
                coding: [
                  {
                    code: 'generic-visit',
                    system: 'http://example.com',
                  },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [
              {
                coding: [
                  {
                    code: 'generic-visit',
                    system: 'http://example.com',
                  },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [
              {
                coding: [
                  {
                    code: 'generic-visit',
                    system: 'http://example.com',
                  },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T12:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [
              {
                coding: [
                  {
                    code: 'generic-visit',
                    system: 'http://example.com',
                  },
                ],
              },
            ],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T13:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T13:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ system: 'http://example.com', code: 'generic-visit' }] }],
          },
        },
      ],
    });
  });

  test('resolving availability with bufferBefore and bufferAfter', async () => {
    const schedule = await makeSchedule({
      'generic-visit': {
        availability: fourDayWorkWeek,
        bufferBefore: 15,
        bufferAfter: 5,
        duration: 20,
      },
    });

    // Mark busy directly after the 12:00 slot, blocking it
    await makeSlot({
      start: new Date('2025-12-01T12:20:00.000-05:00'),
      end: new Date('2025-12-01T12:40:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    // Mark busy 5min after the 11am slot, leaving bufferAfter free
    await makeSlot({
      start: new Date('2025-12-01T11:25:00.000-05:00'),
      end: new Date('2025-12-01T11:45:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    // Mark busy 10min before the 10am slot, blocking it
    await makeSlot({
      start: new Date('2025-12-01T09:20:00.000-05:00'),
      end: new Date('2025-12-01T09:50:00.000-05:00'),
      status: 'busy',
      schedule,
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-01T14:00:00.000-05:00').toISOString(),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        // 9:20 - 9:50 is busy, so the 10:00-10:20 slot is not returned here (it would not have the 15min buffer before)
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        // 12:20 - 12:40 is busy, so the 12:00-12:20 slot is not returned here (it would not have the 5min buffer after)
      ],
    });
  });

  test('search input in another timezone finds appropriate overlap', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 20 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-01T14:00:00.000-05:00').toISOString(),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-01T12:20:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('uses default search page size of 20 results', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 60 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body.entry).toHaveLength(20);
  });

  test('can override search page size with `_count`', async () => {
    const schedule = await makeSchedule({
      'generic-visit': {
        // Alignment slot options to every-two-minutes means that there are
        // lots of results so we can test the maximum page size of 1000
        alignmentInterval: 2,
        availability: fourDayWorkWeek,
        duration: 60,
      },
    });
    const smallResponse = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        _count: 10,
        'service-type': 'http://example.com|generic-visit',
      });
    expect(smallResponse.body).not.toHaveProperty('issue');
    expect(smallResponse.status).toBe(200);
    expect(smallResponse.body.entry).toHaveLength(10);

    const largeResponse = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        _count: 1000,
        'service-type': 'http://example.com|generic-visit',
      });
    expect(largeResponse.body).not.toHaveProperty('issue');
    expect(largeResponse.status).toBe(200);
    expect(largeResponse.body.entry).toHaveLength(1000);
  });

  test('errors if _count is too low', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 60 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        _count: 0,
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.status).toBe(400);
    expect(response.body.issue).toEqual([
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'Invalid _count, minimum required is 1',
        },
      },
    ]);
  });

  test('errors if _count is too high', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 60 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-05:00').toISOString(),
        end: new Date('2026-01-01T00:00:00.000-05:00').toISOString(),
        _count: 1001,
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.status).toBe(400);
    expect(response.body.issue).toEqual([
      {
        code: 'invalid',
        severity: 'error',
        details: {
          text: 'Invalid _count, maximum allowed is 1000',
        },
      },
    ]);
  });

  test("gets timezone data from the schedule's actor", async () => {
    // `location` has timezone set to America/Phoenix, which is always at offset -07:00
    const schedule = await makeSchedule(
      {
        'generic-visit': { availability: fourDayWorkWeek, duration: 20 },
      },
      { actor: [createReference(location)] }
    );
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-07:00').toISOString(),
        end: new Date('2025-12-01T12:00:00.000-07:00').toISOString(),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-07:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-07:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-07:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-07:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test("timezone in scheduling parameters overrides the schedule's actor's timezone", async () => {
    // `location` has timezone set to America/Phoenix, which is always at offset -07:00
    // scheduling params have timezone set to Pacific/Honolulu, which is always at offset -10:00
    const schedule = await makeSchedule(
      {
        'generic-visit': { availability: fourDayWorkWeek, duration: 20, timezone: 'Pacific/Honolulu' },
      },
      { actor: [createReference(location)] }
    );
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-01T00:00:00.000-10:00').toISOString(),
        end: new Date('2025-12-01T12:00:00.000-10:00').toISOString(),
        'service-type': 'http://example.com|generic-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T10:00:00.000-10:00').toISOString(),
            end: new Date('2025-12-01T10:20:00.000-10:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-01T11:00:00.000-10:00').toISOString(),
            end: new Date('2025-12-01T11:20:00.000-10:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
          },
        },
      ],
    });
  });

  test('without a service-type parameter', async () => {
    const schedule = await makeSchedule({
      'generic-visit': { availability: fourDayWorkWeek, duration: 20 },
      'new-patient': { availability: twoDaySchedule, duration: 30 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-04T10:00:00.000-05:00'),
        end: new Date('2025-12-04T14:00:00.000-05:00'),
      });
    expect(response.body).toHaveProperty('issue');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          code: 'invalid',
          severity: 'error',
          details: {
            text: "Expected at least 1 value(s) for required input parameter 'service-type'",
          },
        },
      ],
    });
  });

  describe('Loading schedulingParameters from HealthcareServices', () => {
    test('works when scheduling parameters only exist on a HealthcareService', async () => {
      const code = 'blood-donation';
      await systemRepo.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        meta: { project: project.id },
        active: true,
        type: [
          {
            coding: [{ system: 'http://example.com', code }],
          },
        ],
        availableTime: [
          {
            daysOfWeek: ['thu', 'fri'],
            availableStartTime: '12:00:00',
            availableEndTime: '20:00:00',
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [{ url: 'duration', valueDuration: { value: 30, unit: 'min' } }],
          },
        ],
      });

      const schedule = await makeSchedule({});

      const response = await request
        .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .query({
          start: new Date('2025-12-04T10:00:00.000-05:00'),
          end: new Date('2025-12-04T14:00:00.000-05:00'),
          'service-type': `http://example.com|${code},http://example.com|other`,
        });
      expect(response.body).not.toHaveProperty('issue');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject<Bundle>({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            resource: {
              resourceType: 'Slot',
              start: new Date('2025-12-04T12:00:00.000-05:00').toISOString(),
              end: new Date('2025-12-04T12:30:00.000-05:00').toISOString(),
              status: 'free',
              schedule: createReference(schedule),
              serviceType: [{ coding: [{ code, system: 'http://example.com' }] }],
            },
          },
          {
            resource: {
              resourceType: 'Slot',
              start: new Date('2025-12-04T13:00:00.000-05:00').toISOString(),
              end: new Date('2025-12-04T13:30:00.000-05:00').toISOString(),
              status: 'free',
              schedule: createReference(schedule),
              serviceType: [{ coding: [{ code, system: 'http://example.com' }] }],
            },
          },
        ],
      });
    });

    test('schedule-specific parameters override those on the HealthcareService', async () => {
      const code = 'yoga';
      await systemRepo.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        meta: { project: project.id },
        type: [
          {
            coding: [{ system: 'http://example.com', code }],
          },
        ],
        availableTime: [
          {
            daysOfWeek: ['mon', 'tue', 'wed', 'thu'],
            availableStartTime: '09:30:00',
            availableEndTime: '12:30:00',
          },
          {
            daysOfWeek: ['mon', 'tue', 'wed', 'thu'],
            availableStartTime: '13:15:00',
            availableEndTime: '16:15:00',
          },
        ],
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
            extension: [{ url: 'duration', valueDuration: { value: 20, unit: 'min' } }],
          },
        ],
      });

      const schedule = await makeSchedule({
        [code]: { availability: twoDaySchedule, duration: 30 },
      });

      const response = await request
        .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .query({
          start: new Date('2025-12-04T10:00:00.000-05:00'),
          end: new Date('2025-12-04T14:00:00.000-05:00'),
          'service-type': `http://example.com|${code},http://example.com|other`,
        });
      expect(response.body).not.toHaveProperty('issue');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject<Bundle>({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [
          {
            resource: {
              resourceType: 'Slot',
              start: new Date('2025-12-04T12:00:00.000-05:00').toISOString(),
              end: new Date('2025-12-04T12:30:00.000-05:00').toISOString(),
              status: 'free',
              schedule: createReference(schedule),
              serviceType: [{ coding: [{ code, system: 'http://example.com' }] }],
            },
          },
          {
            resource: {
              resourceType: 'Slot',
              start: new Date('2025-12-04T13:00:00.000-05:00').toISOString(),
              end: new Date('2025-12-04T13:30:00.000-05:00').toISOString(),
              status: 'free',
              schedule: createReference(schedule),
              serviceType: [{ coding: [{ code, system: 'http://example.com' }] }],
            },
          },
        ],
      });
    });
  });

  test('when no matching serviceType is found', async () => {
    const schedule = await makeSchedule({
      'new-patient': { availability: fridayOnly, duration: 45, bufferBefore: 15 },
      'office-visit': { availability: twoDaySchedule, duration: 30, alignmentOffset: 15, alignmentInterval: 30 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-04T10:00:00.000-05:00'),
        end: new Date('2025-12-04T14:00:00.000-05:00'),
        'service-type': 'http://example.com|new-patient-visit',
      });
    expect(response.body).toHaveProperty('issue');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          code: 'invalid',
          severity: 'error',
          details: {
            text: 'No scheduling parameters found for the requested service type(s)',
          },
        },
      ],
    });
  });

  test('when serviceType has no `system` component', async () => {
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            twoDaySchedule,
            { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
            { url: 'serviceType', valueCodeableConcept: { coding: [{ code: 'office-visit' }] } },
          ],
        },
      ],
    });

    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-05T10:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-05T14:00:00.000-05:00').toISOString(),
        'service-type': 'office-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('entry');
    expect(response.body.entry).toHaveLength(2);
  });

  test('returns appropriate slots for each serviceType passed', async () => {
    const schedule = await makeSchedule({
      'new-patient': { availability: fridayOnly, duration: 45, bufferBefore: 15 },
      'office-visit': { availability: twoDaySchedule, duration: 30, alignmentOffset: 15, alignmentInterval: 30 },
      'generic-visit': { availability: fourDayWorkWeek, duration: 20 },
    });
    const response = await request
      .get(`/fhir/R4/Schedule/${schedule.id}/$find`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .query({
        start: new Date('2025-12-05T10:00:00.000-05:00').toISOString(),
        end: new Date('2025-12-05T14:00:00.000-05:00').toISOString(),
        'service-type': 'http://example.com|new-patient,http://example.com|office-visit',
      });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject<Bundle>({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        // new-patient slots are 45 minutes long and start on the hour
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-05T11:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-05T11:45:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'new-patient', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-05T12:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-05T12:45:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'new-patient', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-05T13:00:00.000-05:00').toISOString(),
            end: new Date('2025-12-05T13:45:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'new-patient', system: 'http://example.com' }] }],
          },
        },

        // office-visit slots are 30 minutes long and start at X:15 or X:45
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-05T12:15:00.000-05:00').toISOString(),
            end: new Date('2025-12-05T12:45:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'office-visit', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-05T12:45:00.000-05:00').toISOString(),
            end: new Date('2025-12-05T13:15:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'office-visit', system: 'http://example.com' }] }],
          },
        },
        {
          resource: {
            resourceType: 'Slot',
            start: new Date('2025-12-05T13:15:00.000-05:00').toISOString(),
            end: new Date('2025-12-05T13:45:00.000-05:00').toISOString(),
            status: 'free',
            schedule: createReference(schedule),
            serviceType: [{ coding: [{ code: 'office-visit', system: 'http://example.com' }] }],
          },
        },
      ],
    });
  });
});

describe('Appointment/$find', () => {
  let location: Location;
  let practitioner: Practitioner;
  let project: WithId<Project>;
  let accessToken: string;
  let systemRepo: SystemRepository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const projectResult = await createTestProject({ withAccessToken: true, withRepo: true });
    project = projectResult.project;
    accessToken = projectResult.accessToken;
    systemRepo = projectResult.repo.getSystemRepo();

    practitioner = await systemRepo.createResource<Practitioner>({
      resourceType: 'Practitioner',
      meta: { project: project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
    location = await systemRepo.createResource<Location>({
      resourceType: 'Location',
      meta: { project: project.id },
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'America/New_York' }],
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function tokenToCoding(token: string): Coding {
    if (token.includes('|')) {
      const [system, code] = token.split('|');
      return { system, code };
    }
    return { code: token };
  }

  function makeSchedulingExtension(availability: Record<string, AvailabilityOptions>): Extension[] {
    return Object.entries(availability).map(([serviceType, options]) => {
      const { availability, timezone, ...durations } = options;

      const extension = {
        url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
        extension: [] as Extension[],
      } satisfies Extension;

      if (availability) {
        extension.extension.push(availability);
      }

      if (timezone) {
        extension.extension.push({
          url: 'timezone',
          valueCode: timezone,
        });
      }

      extension.extension.push({
        url: 'serviceType',
        valueCodeableConcept: {
          coding: [tokenToCoding(serviceType)],
        },
      });

      Object.entries(durations).forEach(([key, value]) =>
        extension.extension.push({ url: key, valueDuration: { value, unit: 'min' } })
      );

      return extension;
    });
  }

  async function makeSchedule(
    availability: Record<string, AvailabilityOptions>,
    opts?: { actor?: Schedule['actor'] }
  ): Promise<Schedule> {
    return systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: opts?.actor ?? [createReference(practitioner)],
      extension: makeSchedulingExtension(availability),
    });
  }

  function makeRequest(params: Record<string, string | string[]>): ReturnType<typeof request.get> {
    const qs = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (Array.isArray(val)) {
        for (const inner of val) {
          qs.append(key, inner);
        }
      } else {
        qs.append(key, val);
      }
    }

    return request.get('/fhir/R4/Appointment/$find').set('Authorization', `Bearer ${accessToken}`).query(qs.toString());
  }

  test('finds appointments that are available on all referenced schedules', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule(
      {
        'initial-visit': {
          duration: 30,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    // Tue,Wed, 1p-6p availability
    const locationSchedule = await makeSchedule(
      {
        'initial-visit': {
          duration: 30,
          availability: tueWedAvailability,
        },
      },
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-05:00').toISOString(),
      'service-type': 'initial-visit',
      schedule: [`Schedule/${practitionerSchedule.id}`, `Schedule/${locationSchedule.id}`],
    });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: expect.arrayOf(expect.any(Object)),
    });

    (response.body as Bundle<Appointment>).entry?.forEach((entry) => {
      expect(entry).toMatchObject({
        resource: {
          resourceType: 'Appointment',
          status: 'proposed',
          start: expect.any(String),
          end: expect.any(String),
          serviceType: [{ coding: [{ code: 'initial-visit' }] }],
          participant: [
            {
              actor: { reference: `Practitioner/${practitioner.id}` },
              required: 'required',
              status: 'needs-action',
            },
            {
              actor: { reference: `Location/${location.id}` },
              required: 'required',
              status: 'needs-action',
            },
          ],
        },
      });
    });

    // Overlap is Tue, 1p-5p EDT
    expect((response.body as Bundle<Appointment>).entry?.map((entry) => entry.resource?.start)).toEqual([
      '2026-03-17T17:00:00.000Z', // 5pm UTC, 1pm EDT
      '2026-03-17T18:00:00.000Z', // 6pm UTC, 2pm EDT
      '2026-03-17T19:00:00.000Z', // 7pm UTC, 3pm EDT
      '2026-03-17T20:00:00.000Z', // 8pm UTC, 4pm EDT
    ]);
  });

  test('works with a single schedule', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule({
      'initial-visit': {
        duration: 30,
        availability: monTueAvailability,
      },
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-05:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-05:00').toISOString(),
      'service-type': '|initial-visit',
      schedule: `Schedule/${practitionerSchedule.id}`,
    });

    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);

    (response.body as Bundle<Appointment>).entry?.forEach((entry) => {
      expect(entry).toMatchObject({
        resource: {
          resourceType: 'Appointment',
          status: 'proposed',
          start: expect.any(String),
          end: expect.any(String),
          serviceType: [{ coding: [{ code: 'initial-visit' }] }],
          participant: [
            {
              actor: { reference: `Practitioner/${practitioner.id}` },
              required: 'required',
              status: 'needs-action',
            },
          ],
        },
      });
    });

    expect((response.body as Bundle<Appointment>).entry?.map((entry) => entry.resource?.start)).toEqual([
      // Tuesday
      '2026-03-16T13:00:00.000Z', // 1pm UTC, 9am EDT
      '2026-03-16T14:00:00.000Z', // 2pm UTC, 10am EDT
      '2026-03-16T15:00:00.000Z', // 3pm UTC, 11am EDT
      '2026-03-16T16:00:00.000Z', // 4pm UTC, 12pm EDT
      '2026-03-16T17:00:00.000Z', // 5pm UTC, 1pm EDT
      '2026-03-16T18:00:00.000Z', // 6pm UTC, 2pm EDT
      '2026-03-16T19:00:00.000Z', // 7pm UTC, 3pm EDT
      '2026-03-16T20:00:00.000Z', // 8pm UTC, 4pm EDT

      // Wednesday
      '2026-03-17T13:00:00.000Z', // 1pm UTC, 9am EDT
      '2026-03-17T14:00:00.000Z', // 2pm UTC, 10am EDT
      '2026-03-17T15:00:00.000Z', // 3pm UTC, 11am EDT
      '2026-03-17T16:00:00.000Z', // 4pm UTC, 12pm EDT
      '2026-03-17T17:00:00.000Z', // 5pm UTC, 1pm EDT
      '2026-03-17T18:00:00.000Z', // 6pm UTC, 2pm EDT
      '2026-03-17T19:00:00.000Z', // 7pm UTC, 3pm EDT
      '2026-03-17T20:00:00.000Z', // 8pm UTC, 4pm EDT
    ]);
  });

  test('no overlapping availability returns empty bundle', async () => {
    // Schedule A: Monday+Tuesday only; Schedule B: Friday only — no shared days
    const scheduleA = await makeSchedule(
      {
        consult: {
          duration: 60,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      {
        consult: {
          duration: 60,
          availability: fridayOnly,
        },
      },
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type': '|consult',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('issue');
    expect(response.body).toMatchObject({ resourceType: 'Bundle', type: 'searchset' });
    expect(response.body).not.toHaveProperty('entry');
  });

  test('busy slot on second schedule removes that interval from results', async () => {
    // Schedule A (practitioner): Mon-Tue 9am-5pm, 60min
    const scheduleA = await makeSchedule(
      {
        consult: {
          duration: 60,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    // Schedule B (location): Tue-Wed 1pm-6pm, 60min — overlap is Tue 1pm-5pm
    const scheduleB = await makeSchedule(
      {
        consult: {
          duration: 60,
          availability: tueWedAvailability,
        },
      },
      { actor: [createReference(location)] }
    );

    // Mark Tue 2pm-3pm EDT busy on Schedule B
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(scheduleB),
      status: 'busy',
      start: new Date('2026-03-17T14:00:00-04:00').toISOString(),
      end: new Date('2026-03-17T15:00:00-04:00').toISOString(),
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-18T00:00:00-04:00').toISOString(),
      'service-type': '|consult',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    const starts = (response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start) ?? [];
    expect(starts).toContain(new Date('2026-03-17T13:00:00-04:00').toISOString()); // 1pm EDT — ok
    expect(starts).not.toContain(new Date('2026-03-17T14:00:00-04:00').toISOString()); // 2pm EDT — blocked
    expect(starts).toContain(new Date('2026-03-17T15:00:00-04:00').toISOString()); // 3pm EDT — ok
    expect(starts).toContain(new Date('2026-03-17T16:00:00-04:00').toISOString()); // 4pm EDT — ok
  });

  test('each schedule can have its own timezone set in scheduling parameters', async () => {
    // Both actors have America/New_York timezone, but scheduling params override per-schedule.
    // Schedule A (practitioner): America/Phoenix (always UTC-7) — Mon 9am-5pm = 16:00-00:00 UTC
    // Schedule B (location):     Pacific/Honolulu (always UTC-10) — Mon 9am-5pm = 19:00-03:00 UTC
    // Overlap on Monday: 19:00-00:00 UTC → 5 one-hour slots (12pm-5pm Phoenix / 9am-2pm Honolulu)
    const scheduleA = await makeSchedule(
      {
        consult: {
          duration: 60,
          timezone: 'America/Phoenix',
          availability: {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'availableStartTime', valueTime: '09:00:00' },
                  { url: 'availableEndTime', valueTime: '17:00:00' },
                ],
              },
            ],
          },
        },
      },
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      {
        consult: {
          duration: 60,
          timezone: 'Pacific/Honolulu',
          availability: {
            url: 'availability',
            extension: [
              {
                url: 'availableTime',
                extension: [
                  { url: 'daysOfWeek', valueCode: 'mon' },
                  { url: 'availableStartTime', valueTime: '09:00:00' },
                  { url: 'availableEndTime', valueTime: '17:00:00' },
                ],
              },
            ],
          },
        },
      },
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00Z').toISOString(),
      end: new Date('2026-03-17T00:00:00Z').toISOString(),
      'service-type': '|consult',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('issue');

    expect((response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start)).toEqual([
      '2026-03-16T19:00:00.000Z', // 12pm Phoenix / 9am Honolulu
      '2026-03-16T20:00:00.000Z', // 1pm Phoenix / 10am Honolulu
      '2026-03-16T21:00:00.000Z', // 2pm Phoenix / 11am Honolulu
      '2026-03-16T22:00:00.000Z', // 3pm Phoenix / 12pm Honolulu
      '2026-03-16T23:00:00.000Z', // 4pm Phoenix / 1pm Honolulu
    ]);
  });

  test('errors when schedule parameter is omitted', async () => {
    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type': '|initial-visit',
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toMatch(/schedule/);
  });

  test('errors when a schedule reference cannot be resolved', async () => {
    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type': '|initial-visit',
      schedule: 'Schedule/00000000-0000-0000-0000-000000000001',
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('Loading schedule failed');
  });

  test('errors on a schedule with multiple actors', async () => {
    const schedule = await systemRepo.createResource<Schedule>({
      resourceType: 'Schedule',
      meta: { project: project.id },
      actor: [createReference(practitioner), createReference(location)],
      extension: [
        {
          url: 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters',
          extension: [
            { url: 'serviceType', valueCodeableConcept: { coding: [{ code: 'initial-visit' }] } },
            { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
            twoDaySchedule,
          ],
        },
      ],
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type': '|initial-visit',
      schedule: `Schedule/${schedule.id}`,
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe('$find only supported on schedules with exactly one actor');
  });

  test('errors when service type is not present on all schedules', async () => {
    // Schedule A has 'visit-a'; Schedule B has only 'visit-b'
    const scheduleA = await makeSchedule(
      {
        'visit-a': {
          duration: 30,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      {
        'visit-b': {
          duration: 30,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type': '|visit-a',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe(
      'No scheduling parameters found for the requested service type(s)'
    );
  });

  test('errors when service type duration differs across schedules', async () => {
    // Both schedules have 'office-visit' but with different durations (30 vs 60)
    const scheduleA = await makeSchedule(
      {
        'office-visit': {
          duration: 30,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      {
        'office-visit': {
          duration: 60,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-21T00:00:00-04:00').toISOString(),
      'service-type': '|office-visit',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });
    expect(response.status).toBe(400);
    expect(response.body.issue[0].details.text).toBe(
      'No scheduling parameters found for the requested service type(s)'
    );
  });

  test('returns results for valid service types and skips those with mismatched parameters', async () => {
    // Both schedules have 'good-visit' (duration=30, matching) and 'bad-visit' (duration mismatch: 30 vs 60)
    const scheduleA = await makeSchedule(
      {
        'good-visit': {
          duration: 30,
          availability: monTueAvailability,
        },
        'bad-visit': {
          duration: 30,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    const scheduleB = await makeSchedule(
      {
        'good-visit': {
          duration: 30,
          availability: monTueAvailability,
        },
        'bad-visit': {
          duration: 60,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-17T00:00:00-04:00').toISOString(), // Monday only
      'service-type': '|good-visit,|bad-visit',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('issue');
    expect((response.body as Bundle<Appointment>).entry?.length).toBeGreaterThan(0);
    // All results are for good-visit only; bad-visit was silently skipped
    for (const entry of (response.body as Bundle<Appointment>).entry ?? []) {
      expect(entry.resource?.serviceType?.[0]?.coding?.[0]?.code).toBe('good-visit');
    }
  });

  test('each schedule applies its own bufferBefore/bufferAfter independently', async () => {
    // scheduleA (practitioner): bufferBefore=30, duration=60, Mon/Tue 9am-5pm
    const scheduleA = await makeSchedule(
      {
        'team-visit': {
          bufferBefore: 30,
          duration: 60,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    // scheduleB (location): bufferAfter=30, duration=60, Mon/Tue 9am-5pm
    const scheduleB = await makeSchedule(
      {
        'team-visit': {
          bufferAfter: 30,
          duration: 60,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(location)] }
    );

    // Busy on scheduleA: 11:40am–11:55am EDT
    //   - blocks 11am slot directly (11:40am falls within the 11am–12pm appointment window)
    //   - blocks 12pm slot via bufferBefore (11:40am falls in the 11:30am–12pm buffer window)
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(scheduleA),
      status: 'busy',
      start: new Date('2026-03-16T11:40:00-04:00').toISOString(),
      end: new Date('2026-03-16T11:55:00-04:00').toISOString(),
    });

    // Busy on scheduleB: 03:05pm–03:25pm EDT
    //   - blocks 2pm slot via bufferAfter (2:05pm falls in the 2pm–2:30pm buffer window after the 2pm–3pm slot)
    //   - blocks 3pm slot directly (busy starts in the 3pm slot window)
    await systemRepo.createResource<Slot>({
      resourceType: 'Slot',
      meta: { project: project.id },
      schedule: createReference(scheduleB),
      status: 'busy',
      start: new Date('2026-03-16T15:05:00-04:00').toISOString(),
      end: new Date('2026-03-16T15:25:00-04:00').toISOString(),
    });

    const response = await makeRequest({
      start: new Date('2026-03-16T09:00:00-04:00').toISOString(),
      end: new Date('2026-03-16T18:00:00-04:00').toISOString(),
      'service-type': '|team-visit',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('issue');

    const starts = (response.body as Bundle<Appointment>).entry?.map((e) => e.resource?.start) ?? [];

    // 9am EDT: blocked on A — bufferBefore window (8:30–9am) falls before schedule A's availability start
    expect(starts).not.toContain(new Date('2026-03-16T09:00:00-04:00').toISOString());
    // 10am EDT: bufferBefore window (9:30–10am) clear on A; bufferAfter window (10–10:30am) clear on B -> available
    expect(starts).toContain(new Date('2026-03-16T10:00:00-04:00').toISOString());
    // 11am EDT: blocked on A directly by A's busy slot; clear on B
    expect(starts).not.toContain(new Date('2026-03-16T11:00:00-04:00').toISOString());
    // 12pm EDT: blocked on A — bufferBefore window (11:30am–12pm) overlaps A's busy slot; clear on B
    expect(starts).not.toContain(new Date('2026-03-16T12:00:00-04:00').toISOString());
    // 1pm EDT: bufferBefore window (12:30–1pm) clear on A; bufferAfter window (2–2:30pm) clear on B -> available
    expect(starts).toContain(new Date('2026-03-16T13:00:00-04:00').toISOString());
    // 2pm EDT: OK on A (bufferBefore 1:30–2pm is clear), but blocked on B — bufferAfter window (3–3:30pm) overlaps B's busy slot
    expect(starts).not.toContain(new Date('2026-03-16T14:00:00-04:00').toISOString());
    // 3pm EDT: OK on A; blocked on B directly by B's busy slot
    expect(starts).not.toContain(new Date('2026-03-16T15:00:00-04:00').toISOString());
  });

  test('_count is respected for multi-schedule results', async () => {
    // Mon,Tue, 9a-5p availability
    const scheduleA = await makeSchedule(
      {
        'follow-up': {
          duration: 60,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    // Tue,Wed, 1p-6p availability
    const scheduleB = await makeSchedule(
      {
        'follow-up': {
          duration: 60,
          availability: tueWedAvailability,
        },
      },
      { actor: [createReference(location)] }
    );

    // Overlap window is Tue 1pm-5pm EDT (4 × 60-min slots); requesting only 2
    const response = await makeRequest({
      start: new Date('2026-03-16T00:00:00-04:00').toISOString(),
      end: new Date('2026-03-18T00:00:00-04:00').toISOString(),
      'service-type': '|follow-up',
      _count: '2',
      schedule: [`Schedule/${scheduleA.id}`, `Schedule/${scheduleB.id}`],
    });

    expect(response.status).toBe(200);
    expect(response.body.entry).toHaveLength(2);
  });

  test('Appointments contain nested Slot resources for each schedule', async () => {
    // Mon,Tue, 9a-5p availability
    const practitionerSchedule = await makeSchedule(
      {
        'initial-visit': {
          duration: 30,
          bufferBefore: 20,
          bufferAfter: 15,
          availability: monTueAvailability,
        },
      },
      { actor: [createReference(practitioner)] }
    );

    // Tue,Wed, 1p-6p availability
    const locationSchedule = await makeSchedule(
      {
        'initial-visit': {
          duration: 30,
          availability: tueWedAvailability,
        },
      },
      { actor: [createReference(location)] }
    );

    const response = await makeRequest({
      start: new Date('2026-03-17T11:00:00-04:00').toISOString(),
      end: new Date('2026-03-17T14:00:00-04:00').toISOString(),
      'service-type': '|initial-visit',
      schedule: [`Schedule/${practitionerSchedule.id}`, `Schedule/${locationSchedule.id}`],
    });
    expect(response.body).not.toHaveProperty('issue');
    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Appointment',
            status: 'proposed',
            start: new Date('2026-03-17T13:00:00-04:00').toISOString(),
            end: new Date('2026-03-17T13:30:00-04:00').toISOString(),
            serviceType: [{ coding: [{ code: 'initial-visit' }] }],
            participant: [
              {
                actor: { reference: `Practitioner/${practitioner.id}` },
                required: 'required',
                status: 'needs-action',
              },
              {
                actor: { reference: `Location/${location.id}` },
                required: 'required',
                status: 'needs-action',
              },
            ],
            contained: [
              // practitioner schedule: main appointment block
              {
                resourceType: 'Slot',
                schedule: { reference: `Schedule/${practitionerSchedule.id}` },
                start: new Date('2026-03-17T13:00:00-04:00').toISOString(),
                end: new Date('2026-03-17T13:30:00-04:00').toISOString(),
                status: 'busy',
                serviceType: [{ coding: [{ code: 'initial-visit' }] }],
              },
              // practitioner schedule: buffer before block
              {
                resourceType: 'Slot',
                schedule: { reference: `Schedule/${practitionerSchedule.id}` },
                start: new Date('2026-03-17T12:40:00-04:00').toISOString(),
                end: new Date('2026-03-17T13:00:00-04:00').toISOString(),
                status: 'busy-unavailable',
                serviceType: [{ coding: [{ code: 'initial-visit' }] }],
                comment: 'buffer before appointment',
              },
              // practitioner schedule: buffer after block
              {
                resourceType: 'Slot',
                schedule: { reference: `Schedule/${practitionerSchedule.id}` },
                start: new Date('2026-03-17T13:30:00-04:00').toISOString(),
                end: new Date('2026-03-17T13:45:00-04:00').toISOString(),
                status: 'busy-unavailable',
                serviceType: [{ coding: [{ code: 'initial-visit' }] }],
                comment: 'buffer after appointment',
              },
              // location schedule: main appointment block
              {
                resourceType: 'Slot',
                schedule: { reference: `Schedule/${locationSchedule.id}` },
                start: new Date('2026-03-17T13:00:00-04:00').toISOString(),
                end: new Date('2026-03-17T13:30:00-04:00').toISOString(),
                status: 'busy',
                serviceType: [{ coding: [{ code: 'initial-visit' }] }],
              },
            ],
          },
        },
      ],
    });
  });
});
