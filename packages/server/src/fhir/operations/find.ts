// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  arrayify,
  badRequest,
  createReference,
  DEFAULT_MAX_SEARCH_COUNT,
  DEFAULT_SEARCH_COUNT,
  isDefined,
  isResource,
  OperationOutcomeError,
  Operator,
  resolveId,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Appointment,
  Bundle,
  HealthcareService,
  OperationDefinition,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { flatMapMax } from '../../util/array';
import { addMinutes } from '../../util/date';
import { invariant } from '../../util/invariant';
import { findAlignedSlotTimes } from './utils/find';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { applyExistingSlots, getTimeZone, overlappingIntervals, resolveAvailability } from './utils/scheduling';
import { chooseSchedulingParameters } from './utils/scheduling-parameters';

const scheduleFindOperation = {
  resourceType: 'OperationDefinition',
  name: 'find',
  status: 'active',
  kind: 'operation',
  code: 'find',
  resource: ['Schedule'],
  system: false,
  type: false,
  instance: true,
  parameter: [
    { use: 'in', name: 'start', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'end', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'service-type', type: 'string', min: 1, max: '1' },
    { use: 'in', name: '_count', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

const appointmentFindOperation = {
  resourceType: 'OperationDefinition',
  name: 'find',
  status: 'active',
  kind: 'operation',
  code: 'find',
  resource: ['Appointment'],
  system: false,
  type: true,
  instance: false,
  parameter: [
    { use: 'in', name: 'start', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'end', type: 'dateTime', min: 1, max: '1' },
    { use: 'in', name: 'service-type', type: 'string', min: 1, max: '1' },
    { use: 'in', name: 'schedule', type: 'string', min: 1, max: '*', searchType: 'reference' },
    { use: 'in', name: '_count', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'return', type: 'Bundle', min: 0, max: '1' },
  ],
} as const satisfies OperationDefinition;

type ScheduleFindParameters = {
  start: string;
  end: string;
  'service-type': string;
  _count?: number;
};

type AppointmentFindParameters = {
  start: string;
  end: string;
  'service-type': string;
  schedule: string | string[];
  _count?: number;
};

// Internal implementation of $find logic
async function handler(params: {
  start: string;
  end: string;
  serviceTypeTokens: string[];
  _count?: number;
  scheduleRefs: Reference<Schedule>[];
}): Promise<Appointment[]> {
  const ctx = getAuthenticatedContext();
  const { start, end, serviceTypeTokens, _count } = params;
  const pageSize = _count ?? DEFAULT_SEARCH_COUNT;
  if (pageSize < 1) {
    throw new OperationOutcomeError(badRequest('Invalid _count, minimum required is 1'));
  }
  if (pageSize > DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest(`Invalid _count, maximum allowed is ${DEFAULT_MAX_SEARCH_COUNT}`));
  }

  const range = { start: new Date(params.start), end: new Date(params.end) };

  if (range.start >= range.end) {
    throw new OperationOutcomeError(badRequest('Invalid search time range'));
  }

  const diffMilliseconds = range.end.valueOf() - range.start.valueOf();
  const diffDays = diffMilliseconds / (24 * 60 * 60 * 1000);
  if (diffDays > 31) {
    throw new OperationOutcomeError(badRequest('Search range cannot exceed 31 days'));
  }

  const healthcareServiceSearch: Promise<HealthcareService[]> = ctx.repo.searchResources<HealthcareService>({
    resourceType: 'HealthcareService',
    filters: [
      {
        code: 'service-type',
        operator: Operator.EQUALS,
        value: serviceTypeTokens.join(','),
      },
    ],
  });

  const [schedules, slots, healthcareServices] = await Promise.all([
    ctx.repo.readReferences<Schedule>(params.scheduleRefs),
    ctx.repo.searchResources<Slot>({
      resourceType: 'Slot',

      count: DEFAULT_MAX_SEARCH_COUNT,

      filters: [
        {
          code: 'schedule',
          operator: Operator.EQUALS,
          value: params.scheduleRefs.map((ref) => ref.reference).join(','),
        },

        {
          code: '_filter',
          operator: Operator.EQUALS,
          // Slot starts sometime in range, OR
          // Slot ends sometime in range, OR
          // Slot time fully contains range
          value: `((start ge "${start}" and start le "${end}") or (end ge "${start}" and end le "${end}") or (start lt "${start}" and end gt "${end}"))`,
        },

        {
          code: 'status',
          operator: Operator.EQUALS,
          value: 'busy,busy-tentative,busy-unavailable,free',
        },
      ],
    }),
    healthcareServiceSearch,
  ]);

  // If we filled a full search page of slots, then there may be slots we
  // didn't fetch that would impact availability. Fail loudly here.
  if (slots.length === DEFAULT_MAX_SEARCH_COUNT) {
    throw new OperationOutcomeError(badRequest('Too many slots found in range; try searching with smaller bounds'));
  }

  if (!schedules.every((schedule) => isResource(schedule))) {
    const idx = schedules.findIndex((schedule) => !isResource(schedule));
    throw new OperationOutcomeError(badRequest('Loading schedule failed', `schedule[${idx}]`));
  }

  if (schedules.some((schedule) => schedule.actor.length !== 1)) {
    throw new OperationOutcomeError(badRequest('$find only supported on schedules with exactly one actor'));
  }

  const actors = await ctx.repo.readReferences(schedules.map((schedule) => schedule.actor[0]));
  if (!actors.every((actor) => isResource(actor))) {
    const idx = actors.findIndex((actor) => !isResource(actor));
    throw new OperationOutcomeError(badRequest('Loading schedule.actor failed', `schedule[${idx}]`));
  }

  const schedulingParameterGroups = chooseSchedulingParameters(schedules, healthcareServices, serviceTypeTokens);

  if (schedulingParameterGroups.length === 0) {
    throw new OperationOutcomeError(badRequest('No scheduling parameters found for the requested service type(s)'));
  }

  return flatMapMax(
    schedulingParameterGroups,
    (schedulingParameterGroup, _idx, maxCount) => {
      const serviceType = schedulingParameterGroup[0].serviceType;
      const allAvailability = schedules.map((schedule, idx) => {
        const schedulingParameters = schedulingParameterGroup[1].get(schedule);
        invariant(schedulingParameters);

        const actor = actors[idx];
        const actorTimeZone = getTimeZone(actor);
        const activeTimeZone = schedulingParameters.timezone ?? actorTimeZone;
        if (!activeTimeZone) {
          throw new OperationOutcomeError(badRequest('No timezone specified on Schedule.actor', `schedule[${idx}]`));
        }
        const scheduleSlots = slots.filter((slot) => resolveId(slot.schedule) === schedule.id);
        const availability = resolveAvailability(schedulingParameters, range, activeTimeZone);
        const availabilityWithSlots = applyExistingSlots({
          availability,
          slots: scheduleSlots,
          range,
          serviceType: schedulingParameters.serviceType,
        });

        // Trim off bufferBefore/bufferAfter frmo availability
        const availabilityWithBuffers = availabilityWithSlots.map((interval) => ({
          start: addMinutes(interval.start, schedulingParameters.bufferBefore),
          end: addMinutes(interval.end, -1 * schedulingParameters.bufferAfter),
        }));

        const realAvailability = availabilityWithBuffers.filter(
          (interval) => addMinutes(interval.start, schedulingParameters.duration) <= interval.end
        );

        return realAvailability;
      });

      const intersectingAvailability = allAvailability.reduce((acc, val) => overlappingIntervals(acc, val));

      const intervals = flatMapMax(
        intersectingAvailability,
        (interval, _idx, innerMaxCount) =>
          findAlignedSlotTimes(interval, {
            alignment: schedulingParameterGroup[0].alignmentInterval,
            offsetMinutes: schedulingParameterGroup[0].alignmentOffset,
            durationMinutes: schedulingParameterGroup[0].duration,
            maxCount: innerMaxCount,
          }),
        maxCount
      );

      return intervals.map((interval) => {
        const start = interval.start.toISOString();
        const end = interval.end.toISOString();
        const slots: Slot[] = schedules.flatMap((schedule) => {
          const parameters = schedulingParameterGroup[1].get(schedule);
          invariant(parameters);

          const result: Slot[] = [
            {
              resourceType: 'Slot',
              start,
              end,
              schedule: createReference(schedule),
              status: 'busy',
              serviceType: [serviceType],
            },
          ];

          if (parameters.bufferBefore) {
            result.push({
              resourceType: 'Slot',
              start: addMinutes(interval.start, -1 * parameters.bufferBefore).toISOString(),
              end: start,
              schedule: createReference(schedule),
              status: 'busy-unavailable',
              serviceType: [serviceType],
              comment: 'buffer before appointment',
            });
          }

          if (parameters.bufferAfter) {
            result.push({
              resourceType: 'Slot',
              start: end,
              end: addMinutes(interval.end, parameters.bufferAfter).toISOString(),
              schedule: createReference(schedule),
              status: 'busy-unavailable',
              serviceType: [serviceType],
              comment: 'buffer after appointment',
            });
          }

          return result;
        });

        const appointment = {
          resourceType: 'Appointment',
          start: interval.start.toISOString(),
          end: interval.end.toISOString(),
          status: 'proposed',
          serviceType: [serviceType],
          participant: actors.map((actor) => ({
            actor: createReference(actor),
            required: 'required',
            status: 'needs-action',
          })),
          contained: slots,
        } satisfies Appointment;

        return appointment;
      });
    },
    pageSize
  );
}

/**
 * Handles HTTP requests for the Schedule $find operation.
 *
 * Endpoints:
 *   [fhir base]/Schedule/[id]/$find
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function scheduleFindHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ScheduleFindParameters>(scheduleFindOperation, req);

  const { start, end, _count } = params;

  // service types are in `${system}|${code}` format, in a comma separated list
  const serviceTypeTokens = params['service-type'].split(',');

  const appointments = await handler({
    start,
    end,
    _count,
    serviceTypeTokens,
    scheduleRefs: [{ reference: `Schedule/${req.params.id}` }],
  });

  const slots = appointments
    .map((appointment) => appointment.contained?.find((resource) => isResource<Slot>(resource, 'Slot')))
    .filter(isDefined);

  const bundle: Bundle<Slot> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: slots
      .filter((slot) => slot.status === 'busy')
      .map((slot) => ({
        resource: {
          ...slot,
          status: 'free',
        },
      })),
  };

  return [allOk, buildOutputParameters(scheduleFindOperation, bundle)];
}

/**
 * Handles HTTP requests for the Appointment $find operation.
 *
 * Endpoints:
 *   [fhir base]/Appointment/$find
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function appointmentFindHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<AppointmentFindParameters>(appointmentFindOperation, req);

  const { schedule, start, end, _count } = params;

  // service types are in `${system}|${code}` format, in a comma separated list
  const serviceTypeTokens = params['service-type'].split(',');

  const scheduleRefs = arrayify(schedule).map((reference) => ({ reference }));

  const appointments = await handler({
    start,
    end,
    _count,
    serviceTypeTokens,
    scheduleRefs,
  });

  const bundle: Bundle<Appointment> = {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: appointments.map((appointment) => ({
      resource: appointment,
    })),
  };

  return [allOk, buildOutputParameters(appointmentFindOperation, bundle)];
}
