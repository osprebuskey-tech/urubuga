const env = require('../config/env');

const money = (n, c = 'RWF') => `${Number(n).toLocaleString('en-US')} ${c}`;

/** The standard clauses of every Imbehe service contract. The job-specific parts come from the accepted quotation. */
function buildContent({ request, quotation, termsVersion }) {
  const price = quotation.price;
  return {
    serviceDescription: `${request.title}\n\n${quotation.description}`.slice(0, 3000),
    agreedPrice: price,
    currency: 'RWF',
    deliverables: [...(quotation.deliverables || [])],
    deadline: request.preferredDate || undefined,
    estimatedDuration: quotation.estimatedDuration,
    customerResponsibilities: ['Describe the job accurately and give access to the place or materials needed.', 'Reply to the provider in good time and pay through Imbehe as agreed.', 'Check the work when it is marked complete and report any problem within the reporting period.'],
    providerResponsibilities: ['Do the work described above with reasonable skill and care, and deliver the agreed deliverables.', 'Keep to the agreed time or tell the customer early if it will change.', 'Keep the customer\'s details private and do not move the job or its payment outside Imbehe.'],
    paymentTerms: `The agreed price is ${money(price)}. The customer pays through Imbehe as instructed on the job page. Imbehe records the payment and keeps its platform commission; the provider receives the rest after the job. No extra charge is due unless both sides accept a changed contract.${quotation.terms ? ` Provider's terms: ${quotation.terms}` : ''}`.slice(0, 2000),
    cancellationTerms: 'Before work starts, either side may cancel the job. After work has started, a side that wants to stop must report a problem so that an administrator can review it. A completed job can be reported within the reporting period only.',
    disputeResolution: `If something goes wrong, either side reports a problem on the job page within ${env.DISPUTE_WINDOW_DAYS} days of completion. An administrator reviews the contract and the records on the platform, may ask both sides for information, and decides whether the job is completed or cancelled and whether a refund is due. Imbehe's Terms and Conditions apply.`,
    platformTermsVersion: termsVersion,
  };
}

module.exports = { buildContent };
