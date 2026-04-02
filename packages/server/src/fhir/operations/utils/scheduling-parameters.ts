// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { codeableConceptMatchesToken, EMPTY, isDefined } from '@medplum/core';
import type {
  CodeableConcept,
  Duration,
  HealthcareService,
  HealthcareServiceAvailableTime,
  Period,
  Schedule,
} from '@medplum/fhirtypes';
import { invariant } from '../../../util/invariant';

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';

// The duration units we allow in the SchedulingParameters extension
// - "ms", "s" are not allowed due to being too fine grained (scheduling works at minute intervals only)
// - "mo", "a" are not allowed due to being ambiguous (months have different lengths, leap years have different length)
type DurationUnit = 'h' | 'min' | 'd' | 'wk';

// The SchedulingParameters extension constrains durations:
// - No comparator allowed; only exact durations supported
// - `value` is required
// - `unit` is required, and must be in a subset of values
type HardDuration = {
  value: number;
  unit: DurationUnit;
};

// Similar to a Temporal.PlainTime; represents a time without a date or time
// zone, as seen in the FHIR `time` type. Segments may be zero padded.
type WallClockTime = `${number}:${number}:${number}`;

// Nested extension types for `availability`, encoding the R5 `Availability` datatype
// in valid R4 extension form. Note: `daysOfWeek` repeats once per day value.
type AvailabilityR4AvailableTime = {
  url: 'availableTime';
  extension: (
    | { url: 'daysOfWeek'; valueCode: DayOfWeek }
    | { url: 'allDay'; valueBoolean: boolean }
    | { url: 'availableStartTime'; valueTime: WallClockTime }
    | { url: 'availableEndTime'; valueTime: WallClockTime }
  )[];
};

// Typed for completeness / future use; not yet processed by parseSchedulingParametersExtensions.
type AvailabilityR4NotAvailableTime = {
  url: 'notAvailableTime';
  extension: ({ url: 'description'; valueString: string } | { url: 'during'; valuePeriod: Period })[];
};

// The allowed nested extensions
export type SchedulingParametersExtensionExtension =
  | { url: 'bufferBefore'; valueDuration: HardDuration }
  | { url: 'bufferAfter'; valueDuration: HardDuration }
  | { url: 'alignmentInterval'; valueDuration: HardDuration }
  | { url: 'alignmentOffset'; valueDuration: HardDuration }
  | { url: 'duration'; valueDuration: HardDuration }
  | { url: 'serviceType'; valueCodeableConcept: CodeableConcept }
  | { url: 'timezone'; valueCode: string }
  | {
      url: 'availability';
      extension: (AvailabilityR4AvailableTime | AvailabilityR4NotAvailableTime)[];
    };

export type SchedulingParametersExtension = {
  url: typeof SchedulingParametersURI;
  extension: SchedulingParametersExtensionExtension[];
};

type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type SchedulingParametersAvailability = {
  dayOfWeek: DayOfWeek[];
  availableStartTime: WallClockTime;
  availableEndTime: WallClockTime;
};

export type SchedulingParameters = {
  availability: SchedulingParametersAvailability[];
  bufferBefore: number; // minutes
  bufferAfter: number; // minutes
  alignmentInterval: number; // minutes
  alignmentOffset: number; // minutes
  duration: number; // minutes
  serviceType: CodeableConcept[]; // codes that may be booked into this availability
  timezone?: string;
};

type CommonSchedulingParameters = {
  duration: number;
  alignmentInterval: number;
  alignmentOffset: number;
  serviceType: CodeableConcept;
};

type SchedulingParameterGroup = [CommonSchedulingParameters, Map<Schedule, SchedulingParameters>];

function durationToMinutes(duration: Duration): number {
  const { value, unit } = duration;
  if (value === undefined) {
    throw new Error('Got duration without value');
  }
  switch (unit) {
    case 'wk':
      return value * 60 * 24 * 7;
    case 'd':
      return value * 60 * 24;
    case 'h':
      return value * 60;
    case 'min':
      return value;
    default:
      throw new Error(`Got unhandled unit "${unit}"`);
  }
}

function atMostOne<T>(arr: T[], attribute: string, _resourceType: string): T | undefined {
  if (arr.length > 1) {
    throw new Error(`Scheduling parameter attribute '${attribute}' has too many values`);
  }
  return arr[0];
}

function atLeastOne<T>(arr: T[], attribute: string, _resourceType: string): T[] {
  if (arr.length < 1) {
    throw new Error(`Required scheduling parameter attribute '${attribute}' is missing`);
  }
  return arr;
}

function exactlyOne<T>(arr: T[], attribute: string, _resourceType: string): T {
  if (arr.length < 1) {
    throw new Error(`Required scheduling parameter attribute '${attribute}' is missing`);
  }
  if (arr.length > 1) {
    throw new Error(`Scheduling parameter attribute '${attribute}' has too many values`);
  }
  return arr[0];
}

function exactlyZero(arr: unknown[], attribute: string, resourceType: string): void {
  if (arr.length > 0) {
    throw new Error(`Scheduling parameter attribute '${attribute}' is not allowed on ${resourceType}`);
  }
}

function allMatch(values: unknown[]): boolean {
  const first = values[0];
  return values.every((value) => value === first);
}

/**
 * Given Schedules, HealthcareServices, and an array of input service type
 * tokens, return an array of [CommonSchedulingParameters, Map<Schedule,
 * SchedulingParameters>] pairs that satisfy the requested service types.
 *
 * Priority order for each Schedule: (highest to lowest):
 *  1. Entries from the Schedule matching a requested service-type
 *  2. Entries from HealthcareService matching a requested service-type
 *
 * If matches are found at a given priority level, lower-priority levels are not returned.
 *
 * @param schedules - The schedule resources to consider
 * @param healthcareServices - HealthcareServices to consider
 * @param serviceTypeTokens - Service type tokens to restrict scheduling parameters to
 * @returns pairs of [SchedulingParameters, CodeableConcept]
 */
export function chooseSchedulingParameters(
  schedules: Schedule[],
  healthcareServices: HealthcareService[],
  serviceTypeTokens: string[]
): SchedulingParameterGroup[] {
  const allSchedulingParameters = schedules.map((schedule) => parseSchedulingParametersExtensions(schedule));

  const healthcareServiceParameters = new Map<HealthcareService, SchedulingParameters[]>();
  for (const healthcareService of healthcareServices) {
    healthcareServiceParameters.set(healthcareService, parseSchedulingParametersExtensions(healthcareService));
  }

  const results: SchedulingParameterGroup[] = [];

  const seenTokens = new Set<string>();

  for (const token of serviceTypeTokens) {
    if (seenTokens.has(token)) {
      continue;
    }

    // Open question: how to handle multiple matching services?  Initial
    // implementation: assume that they are distinct, so returning the first
    // match is sufficient.
    // TODO: Follow up on multiple matches.
    const services = healthcareServices.filter((service) => {
      return service.type?.some((serviceType) => codeableConceptMatchesToken(serviceType, token));
    });
    if (services.length > 1) {
      throw new Error(`Multiple matching HealthcareService resources found for service type token "${token}"`);
    }
    const serviceParams = healthcareServiceParameters.get(services[0]);

    // Find matching scheduling parameters to use for each schedule
    const paramsPerSchedule = allSchedulingParameters.map((parametersOptions) => {
      // Open question: should this use `filter` instead of `find`? That is,
      // can you have multiple parameters with the same service-type token?
      // probably yes, makes matching much harder though... For initial
      // implementation we assume that service types are distinct.
      const found = parametersOptions.find((parameters) =>
        parameters.serviceType.some((concept) => codeableConceptMatchesToken(concept, token))
      );
      if (found) {
        return found;
      }

      // If we didn't find matching params on the schedule, try to use ones
      // from a HealthcareService (which we already filtered to match the search token).
      // Inital implementation assumes that there is at most one match.
      // TODO: Follow up on multiple matches.
      return serviceParams?.[0];
    });

    if (!paramsPerSchedule.every(isDefined)) {
      continue;
    }
    if (!allMatch(paramsPerSchedule.map((p) => p.duration))) {
      continue;
    }
    if (!allMatch(paramsPerSchedule.map((p) => p.alignmentInterval))) {
      continue;
    }
    if (!allMatch(paramsPerSchedule.map((p) => p.alignmentOffset))) {
      continue;
    }

    // Open question: should we do something special if the service types
    // aren't all identical? For example, should we choose the service type
    // that is the most/least expansive by number of codes, or prefer one with
    // a `text` attribute?  For initial implementation we grab the first match
    // and use it.
    const serviceType = paramsPerSchedule[0].serviceType.find((concept) => codeableConceptMatchesToken(concept, token));
    invariant(serviceType);

    // Add tokens from this service type to our "seenTokens" list so we can skip
    // processing them and avoid emitting the same service type multiple times.
    for (const coding of serviceType.coding ?? EMPTY) {
      seenTokens.add(`${coding.system ?? ''}|${coding.code ?? ''}`);
    }

    results.push([
      {
        duration: paramsPerSchedule[0].duration,
        alignmentInterval: paramsPerSchedule[0].alignmentInterval,
        alignmentOffset: paramsPerSchedule[0].alignmentOffset,
        serviceType,
      },
      new Map(schedules.map((schedule, idx) => [schedule, paramsPerSchedule[idx]])),
    ]);
  }

  return results;
}

// Convert a single availability extension into SchedulingParametersAvailability entries.
// notAvailableTime sub-extensions are ignored for now.
function extractAvailabilityR4(ext: {
  url: 'availability';
  extension: (AvailabilityR4AvailableTime | AvailabilityR4NotAvailableTime)[];
}): SchedulingParametersAvailability[] {
  return ext.extension
    .filter((sub) => sub.url === 'availableTime')
    .map((availTime) => {
      const dayOfWeek = availTime.extension.filter((e) => e.url === 'daysOfWeek').map((e) => e.valueCode);

      const allDay = availTime.extension.find((e) => e.url === 'allDay')?.valueBoolean;
      if (allDay) {
        // FHIR doesn't allow representing end-of-day as `24:00:00` in a time
        //
        // We follow a convention where when end <= start, we treat it as
        // belonging to the next day. In other words, this availability is from
        // the start of the given weekdays to the start of the subsequent day.
        //
        // Note that we don't use a sentinel value like `23:59:59`, as we don't
        // want to introduce a 1sec gap in availability; some events are
        // scheduled to cross that boundary.
        return { dayOfWeek, availableStartTime: '00:00:00' as const, availableEndTime: '00:00:00' as const };
      }

      const start = availTime.extension.find((e) => e.url === 'availableStartTime')?.valueTime;
      const end = availTime.extension.find((e) => e.url === 'availableEndTime')?.valueTime;
      if (start && end) {
        return { dayOfWeek, availableStartTime: start, availableEndTime: end };
      }
      return undefined;
    })
    .filter(isDefined);
}

// Convert HealthcareService.availability entries into a format matching
// our extension.availability values
function extractAvailability(
  availableTime: HealthcareServiceAvailableTime
): SchedulingParametersAvailability | undefined {
  if (availableTime.allDay) {
    return {
      dayOfWeek: availableTime.daysOfWeek ?? [],
      availableStartTime: '00:00:00',
      availableEndTime: '00:00:00',
    };
  }

  if (availableTime.availableStartTime && availableTime.availableEndTime) {
    return {
      dayOfWeek: availableTime.daysOfWeek ?? [],
      availableStartTime: availableTime.availableStartTime as WallClockTime,
      availableEndTime: availableTime.availableEndTime as WallClockTime,
    };
  }

  return undefined;
}

/**
 * @param resource - A Schedule or HealthcareService to extract scheduling information from
 * @returns SchedulingParameters[] - An array of objects describing scheduling configuration
 */
export function parseSchedulingParametersExtensions(resource: Schedule | HealthcareService): SchedulingParameters[] {
  const extensions = (resource.extension ?? []).filter(
    (ext) => ext.url === SchedulingParametersURI
  ) as SchedulingParametersExtension[];

  // Holds scheduling parameters extracted from attributes of the resource, to be merged into
  // each extension on the resource
  const resourceParameters: Partial<SchedulingParameters> = {};
  if (resource.resourceType === 'HealthcareService') {
    resourceParameters.serviceType = resource.type ?? [];
    resourceParameters.availability = (resource.availableTime ?? EMPTY).map(extractAvailability).filter(isDefined);
  }

  return extensions.map((extension) => {
    const duration = exactlyOne(
      extension.extension.filter((ext) => ext.url === 'duration'),
      'duration',
      resource.resourceType
    );

    // `availability` is required in Schedule, and not allowed in
    // HealthcareService (where we read from availableTime instead).
    const rawAvailability = extension.extension.filter((ext) => ext.url === 'availability');
    if (resource.resourceType === 'Schedule') {
      atLeastOne(rawAvailability, 'availability', resource.resourceType);
    } else {
      exactlyZero(rawAvailability, 'availability', resource.resourceType);
    }

    const availability = resourceParameters.availability ?? rawAvailability.flatMap(extractAvailabilityR4);

    const bufferBefore = atMostOne(
      extension.extension.filter((ext) => ext.url === 'bufferBefore'),
      'bufferBefore',
      resource.resourceType
    );
    const bufferAfter = atMostOne(
      extension.extension.filter((ext) => ext.url === 'bufferAfter'),
      'bufferAfter',
      resource.resourceType
    );
    const alignmentOffset = atMostOne(
      extension.extension.filter((ext) => ext.url === 'alignmentOffset'),
      'alignmentOffset',
      resource.resourceType
    );
    const rawAlignmentInterval = atMostOne(
      extension.extension.filter((ext) => ext.url === 'alignmentInterval'),
      'alignmentInterval',
      resource.resourceType
    );
    const timezone = atMostOne(
      extension.extension.filter((ext) => ext.url === 'timezone'),
      'timezone',
      resource.resourceType
    );

    // `serviceType` is expected in Schedule, not allowed in HealthcareService
    // (where we read from HealthcareService.type instead)
    const rawServiceType = extension.extension.filter((ext) => ext.url === 'serviceType');
    if (resource.resourceType === 'HealthcareService') {
      exactlyZero(rawServiceType, 'serviceType', resource.resourceType);
    }
    const serviceType = resourceParameters.serviceType ?? rawServiceType.map((ext) => ext.valueCodeableConcept);

    // default alignmentInterval is "on the hour" (0)
    let alignmentInterval = rawAlignmentInterval ? durationToMinutes(rawAlignmentInterval.valueDuration) : 0;

    // Convert "on the hour" alignment from the structure (0) to one usable as a modulus (60)
    alignmentInterval = alignmentInterval === 0 ? 60 : alignmentInterval;

    return {
      serviceType, // HealthcareService.type or `serviceType` extension parameter
      availability, // HealthcareService.availableTime or `availability` extension parameter

      // These attributes always come from the extension
      bufferBefore: bufferBefore ? durationToMinutes(bufferBefore.valueDuration) : 0,
      bufferAfter: bufferAfter ? durationToMinutes(bufferAfter.valueDuration) : 0,
      alignmentInterval,
      alignmentOffset: alignmentOffset ? durationToMinutes(alignmentOffset.valueDuration) : 0,
      duration: durationToMinutes(duration.valueDuration),
      timezone: timezone?.valueCode,
    };
  });
}
