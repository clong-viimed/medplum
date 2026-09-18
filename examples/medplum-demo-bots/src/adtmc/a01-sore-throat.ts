import type { PlanDefinition, Questionnaire } from '@medplum/fhirtypes';
import type { AdtmcRuleTable } from './adtmc-evaluator';
import type { AdtmcAlgorithmPackage } from './adtmc-package';

export const A01_SORE_THROAT_VERSION = '1.0.0';

const BOOLEAN_ANSWER_OPTIONS = [
  { valueCoding: { system: 'urn:hiivehealth:adtmc-boolean', code: 'true', display: 'Yes' } },
  { valueCoding: { system: 'urn:hiivehealth:adtmc-boolean', code: 'false', display: 'No' } },
];

const RED_FLAGS_CLEARED = [
  'shortness-of-breath',
  'stridor',
  'deviated-uvula',
  'drooling-trouble-swallowing',
  'stiff-neck',
].map((question) => ({
  question,
  operator: '=' as const,
  answerCoding: { system: 'urn:hiivehealth:adtmc-boolean', code: 'false' },
}));

export const a01SoreThroatPlanDefinition: PlanDefinition = {
  resourceType: 'PlanDefinition',
  id: 'a01-sore-throat',
  url: 'https://ehr.hiivehealth.net/fhir/PlanDefinition/a01-sore-throat',
  identifier: [{ system: 'urn:hiivehealth:adtmc-algorithm', value: 'A-01' }],
  version: A01_SORE_THROAT_VERSION,
  status: 'draft',
  title: 'Sore Throat/Hoarseness, A-1',
  action: [
    { id: 'provider-now', title: 'Provider Now' },
    { id: 'aem-now', title: 'AEM Now' },
    { id: 'minor-care-protocols', title: 'Minor Care Protocols' },
  ],
};

export const a01SoreThroatQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'a01-sore-throat',
  url: 'https://ehr.hiivehealth.net/fhir/Questionnaire/a01-sore-throat',
  version: A01_SORE_THROAT_VERSION,
  name: 'a01-sore-throat',
  title: 'Sore Throat/Hoarseness, A-1',
  description: 'A sore throat is often due to a viral infection. Bacterial infections and other causes need to also be considered.',
  status: 'draft',
  item: [
    {
      linkId: 'initial-escalation-screen',
      text: 'Does the patient have any of the following Red Flags?',
      type: 'group',
      item: [
        { linkId: 'shortness-of-breath', text: 'Shortness of Breath', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'stridor', text: 'Stridor', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'deviated-uvula', text: 'Deviated Uvula', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        {
          linkId: 'drooling-trouble-swallowing',
          text: 'Drooling (Trouble Swallowing)',
          type: 'choice',
          required: true,
          answerOption: BOOLEAN_ANSWER_OPTIONS,
        },
        { linkId: 'stiff-neck', text: 'Stiff Neck', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        {
          linkId: 'red-flags-guidance',
          text: 'Red Flags. If the Soldier presents with any of the red flags, immediately disposition the Soldier as "Provider Now." One-sided severe sore throat with fever, trouble swallowing as shown by drooling, uvula displacement, hoarseness (hot potato voice), trismus (lock jaw), and enlarged, tender tonsils are signs of a deep neck space infection like a peritonsillar abscess. Shortness of breath and stridor are signs of upper airway obstruction due to severe pharyngeal inflammation.',
          type: 'display',
        },
      ],
    },
    {
      linkId: 'dp1-screen',
      text: 'Screening DP1:',
      type: 'group',
      enableWhen: RED_FLAGS_CLEARED,
      enableBehavior: 'all',
      item: [
        {
          linkId: 'dp1-question-prompt',
          text: 'Does patient have any of the following?',
          type: 'display',
        },
        { linkId: 'symptoms-more-than-10-days', text: 'Symptoms >10 days', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'immunosuppression', text: 'Immunosuppression', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'inhaled-steroid', text: 'Inhaled steroid', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'fever', text: 'Fever', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        {
          linkId: 'dp1-guidance',
          text: 'Symptoms greater than 10 days, immunosuppression, inhaled steroid medications are related to diseases that are unlikely to go away without treatment. Hoarseness longer than 2 weeks requires a full laryngeal exam.',
          type: 'display',
        },
      ],
    },
    {
      linkId: 'dp2-screen',
      text: 'Screening DP2:',
      type: 'group',
      enableWhen: [
        { question: 'symptoms-more-than-10-days', operator: '=', answerCoding: { system: 'urn:hiivehealth:adtmc-boolean', code: 'false' } },
        { question: 'immunosuppression', operator: '=', answerCoding: { system: 'urn:hiivehealth:adtmc-boolean', code: 'false' } },
        { question: 'inhaled-steroid', operator: '=', answerCoding: { system: 'urn:hiivehealth:adtmc-boolean', code: 'false' } },
        { question: 'fever', operator: '=', answerCoding: { system: 'urn:hiivehealth:adtmc-boolean', code: 'false' } },
      ],
      enableBehavior: 'all',
      item: [
        {
          linkId: 'dp2-question-prompt',
          text: 'Does patient have any of the following?',
          type: 'display',
        },
        { linkId: 'dp2-fever', text: 'Fever', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'no-cough', text: 'No cough', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'tonsillar-exudate', text: 'Tonsillar exudate', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        {
          linkId: 'swollen-anterior-cervical-nodes',
          text: 'Swollen anterior cervical nodes',
          type: 'choice',
          required: true,
          answerOption: BOOLEAN_ANSWER_OPTIONS,
        },
      ],
    },
    {
      linkId: 'strep-test',
      text: 'Perform Rapid Strep +/- Culture Test',
      type: 'group',
      item: [
        {
          linkId: 'rapid-strep-culture-result',
          text: 'Rapid strep/culture test result',
          type: 'choice',
          required: true,
          answerOption: [
            { valueCoding: { code: 'positive', display: 'Positive' } },
            { valueCoding: { code: 'negative', display: 'Negative' } },
          ],
        },
      ],
    },
    {
      linkId: 'additional-screen',
      text: 'Screen Cold, Skin, Ear Pain if present',
      type: 'group',
      item: [
        { linkId: 'cold-present', text: 'Cold present', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'skin-condition-present', text: 'Skin condition present', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
        { linkId: 'ear-pain-present', text: 'Ear pain present', type: 'choice', required: true, answerOption: BOOLEAN_ANSWER_OPTIONS },
      ],
    },
  ],
};

const noInitialEscalation = [
  { linkId: 'symptoms-more-than-10-days', operator: 'equals' as const, value: false },
  { linkId: 'immunosuppression', operator: 'equals' as const, value: false },
  { linkId: 'inhaled-steroid', operator: 'equals' as const, value: false },
  { linkId: 'fever', operator: 'equals' as const, value: false },
];

const additionalScreenCompleted = [
  { linkId: 'cold-present', operator: 'exists' as const },
  { linkId: 'skin-condition-present', operator: 'exists' as const },
  { linkId: 'ear-pain-present', operator: 'exists' as const },
];

export const a01SoreThroatRuleTable: AdtmcRuleTable = {
  algorithmId: 'A-01',
  version: A01_SORE_THROAT_VERSION,
  rules: [
    ...[
      'shortness-of-breath',
      'stridor',
      'deviated-uvula',
      'drooling-trouble-swallowing',
      'stiff-neck',
      'symptoms-more-than-10-days',
      'immunosuppression',
      'inhaled-steroid',
      'fever',
    ].map((linkId) => ({
      id: `provider-now-${linkId}`,
      conditions: [{ linkId, operator: 'equals' as const, value: true }],
      disposition: 'provider-now',
      guidance: 'Provider Now.',
    })),
    {
      id: 'aem-now-positive-rapid-strep-or-culture',
      conditions: [
        ...noInitialEscalation,
        { linkId: 'strep-criteria-count', operator: 'greater-than', value: 2 },
        { linkId: 'rapid-strep-culture-result', operator: 'equals', value: 'positive' },
      ],
      disposition: 'aem-now',
      guidance: 'AEM Now.',
    },
    {
      id: 'minor-care-negative-rapid-strep-or-culture',
      conditions: [
        ...noInitialEscalation,
        { linkId: 'strep-criteria-count', operator: 'greater-than', value: 2 },
        { linkId: 'rapid-strep-culture-result', operator: 'equals', value: 'negative' },
        ...additionalScreenCompleted,
      ],
      disposition: 'minor-care-protocols',
      guidance: 'Screen Cold, Skin, Ear Pain if present. Follow the MCP sore throat or MCP hoarseness treatment protocol.',
    },
    {
      id: 'minor-care-zero-to-two-strep-criteria',
      conditions: [
        ...noInitialEscalation,
        { linkId: 'strep-criteria-count', operator: 'less-than', value: 3 },
        ...additionalScreenCompleted,
      ],
      disposition: 'minor-care-protocols',
      guidance: 'Screen Cold, Skin, Ear Pain if present. Follow the MCP sore throat or MCP hoarseness treatment protocol.',
    },
  ],
};

export const a01SoreThroatPackage: AdtmcAlgorithmPackage = {
  algorithmId: 'A-01',
  version: A01_SORE_THROAT_VERSION,
  status: 'draft',
  sourceDocument: { reference: 'DocumentReference/adtmc-medcom-pam-40-7-21-page-20' },
  questionnaire: { reference: 'Questionnaire/a01-sore-throat' },
  ruleTable: { reference: 'Library/a01-sore-throat-rules' },
  dispositionPolicies: [
    {
      code: 'provider-now',
      taskPriority: 'stat',
      taskOwner: { reference: 'HealthcareService/provider-now-queue' },
      requiresServiceRequest: false,
    },
    {
      code: 'aem-now',
      taskPriority: 'stat',
      taskOwner: { reference: 'HealthcareService/aem-now-queue' },
      requiresServiceRequest: false,
    },
    {
      code: 'minor-care-protocols',
      taskPriority: 'routine',
      taskOwner: { reference: 'HealthcareService/minor-care-protocols-queue' },
      requiresServiceRequest: false,
    },
  ],
  testFixtures: [
    {
      name: 'provider now for shortness of breath',
      answers: { 'shortness-of-breath': true },
      expectedDisposition: 'provider-now',
    },
    {
      name: 'provider now for symptoms greater than 10 days',
      answers: { 'symptoms-more-than-10-days': true },
      expectedDisposition: 'provider-now',
    },
    {
      name: 'aem now for positive rapid strep with three criteria',
      answers: {
        'symptoms-more-than-10-days': false,
        immunosuppression: false,
        'inhaled-steroid': false,
        fever: false,
        'strep-criteria-count': 3,
        'rapid-strep-culture-result': 'positive',
      },
      expectedDisposition: 'aem-now',
    },
    {
      name: 'minor care for negative rapid strep with three criteria',
      answers: {
        'symptoms-more-than-10-days': false,
        immunosuppression: false,
        'inhaled-steroid': false,
        fever: false,
        'strep-criteria-count': 3,
        'rapid-strep-culture-result': 'negative',
        'cold-present': false,
        'skin-condition-present': false,
        'ear-pain-present': false,
      },
      expectedDisposition: 'minor-care-protocols',
    },
    {
      name: 'minor care for zero to two strep criteria',
      answers: {
        'symptoms-more-than-10-days': false,
        immunosuppression: false,
        'inhaled-steroid': false,
        fever: false,
        'strep-criteria-count': 2,
        'cold-present': true,
        'skin-condition-present': false,
        'ear-pain-present': false,
      },
      expectedDisposition: 'minor-care-protocols',
    },
  ],
};