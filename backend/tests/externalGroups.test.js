import { expect } from 'chai';
import {
  aggregateExternalByParty,
  buildExternalGroups,
  summarizeExternalGroups,
} from '../src/analytics/externalGroups.js';

describe('External transaction groups', function () {
  it('keeps a partially repaid OUT group open', function () {
    const groups = buildExternalGroups([
      { ID: 1, RelatedID: '', Type: 'OUT', FlowDate: '2026-01-01', RelatedParty: 'A', Amount: 300 },
      { ID: 2, RelatedID: '1', Type: 'IN', FlowDate: '2026-02-01', RelatedParty: 'A', Amount: 100 },
    ], { asOf: '2026-03-01' });

    expect(groups).to.have.length(1);
    expect(groups[0]).to.include({
      totalOut: 300,
      totalIn: 100,
      outstandingAmount: 200,
      overpaidAmount: 0,
      status: 'open',
      ageDays: 59,
    });
  });

  it('forms one settled group when one IN references multiple OUT records', function () {
    const groups = buildExternalGroups([
      { ID: 10, RelatedID: '', Type: 'OUT', FlowDate: '2026-01-01', RelatedParty: 'A', Amount: 120 },
      { ID: 11, RelatedID: '', Type: 'OUT', FlowDate: '2026-01-02', RelatedParty: 'A', Amount: 80 },
      { ID: 12, RelatedID: '10,11', Type: 'IN', FlowDate: '2026-01-05', RelatedParty: 'A', Amount: 200 },
    ], { asOf: '2026-01-10' });

    expect(groups).to.have.length(1);
    expect(groups[0]).to.include({
      totalOut: 200,
      totalIn: 200,
      outstandingAmount: 0,
      status: 'settled',
      ageDays: 0,
    });
    expect(groups[0].transactionIds).to.deep.equal([10, 11, 12]);
  });

  it('reports unmatched IN and dangling IDs without dropping records', function () {
    const groups = buildExternalGroups([
      { ID: 20, RelatedID: '99', Type: 'IN', FlowDate: '2026-01-01', RelatedParty: 'B', Amount: 50 },
    ], { asOf: '2026-01-02' });

    expect(groups).to.have.length(1);
    expect(groups[0]).to.include({ totalIn: 50, totalOut: 0, status: 'unmatched-in' });
    expect(groups[0].danglingRelatedIds).to.deep.equal([99]);
  });

  it('ignores future records and summarizes groups without double-counting parties', function () {
    const groups = buildExternalGroups([
      { ID: 1, RelatedID: '', Type: 'OUT', FlowDate: '2026-01-01', RelatedParty: 'A', Amount: 100.1 },
      { ID: 2, RelatedID: '1', Type: 'IN', FlowDate: '2026-01-02', RelatedParty: 'A', Amount: 10 },
      { ID: 3, RelatedID: '', Type: 'OUT', FlowDate: '2026-01-03', RelatedParty: 'B', Amount: 20 },
      { ID: 4, RelatedID: '3', Type: 'IN', FlowDate: '2026-02-01', RelatedParty: 'B', Amount: 20 },
    ], { asOf: '2026-01-10' });

    expect(summarizeExternalGroups(groups)).to.deep.equal({
      totalGroups: 2,
      openGroups: 2,
      settledGroups: 0,
      overpaidGroups: 0,
      unmatchedInGroups: 0,
      totalOutstanding: 110.1,
      totalOverpaid: 0,
    });
    expect(aggregateExternalByParty(groups)).to.deep.equal([
      { party: 'A', openGroups: 1, outstandingAmount: 90.1, oldestAgeDays: 9 },
      { party: 'B', openGroups: 1, outstandingAmount: 20, oldestAgeDays: 7 },
    ]);
  });

  it('does not classify standalone unmatched inflows as overpaid money', function () {
    const groups = buildExternalGroups([
      { ID: 1, RelatedID: '', Type: 'IN', FlowDate: '2026-01-01', RelatedParty: 'A', Amount: 500 },
      { ID: 2, RelatedID: '', Type: 'OUT', FlowDate: '2026-01-02', RelatedParty: 'B', Amount: 100 },
      { ID: 3, RelatedID: '2', Type: 'IN', FlowDate: '2026-01-03', RelatedParty: 'B', Amount: 120 },
    ], { asOf: '2026-01-10' });

    expect(summarizeExternalGroups(groups)).to.deep.equal({
      totalGroups: 2,
      openGroups: 0,
      settledGroups: 0,
      overpaidGroups: 1,
      unmatchedInGroups: 1,
      totalOutstanding: 0,
      totalOverpaid: 20,
    });
  });

  it('counts calendar age correctly across a daylight-saving transition', function () {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      const groups = buildExternalGroups([
        { ID: 1, RelatedID: '', Type: 'OUT', FlowDate: '2026-03-08', RelatedParty: 'A', Amount: 100 },
      ], { asOf: '2026-03-09' });

      expect(groups[0].ageDays).to.equal(1);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });
});
