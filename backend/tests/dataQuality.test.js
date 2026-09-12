import { expect } from 'chai';
import { inspectDataQuality } from '../src/analytics/dataQuality.js';

function validFixture() {
  return {
    transactions: [
      { ID: 1, Type: 'Expense', BillDate: '2026-09-01', Category: '餐饮', Subcategory: '正餐', Tag: '日常', Amount: 25 },
      { ID: 2, Type: 'Income', BillDate: '2026-09-02', Category: '工资', Subcategory: '工资', Tag: '', Amount: 5000 },
    ],
    externalTransactions: [
      { ID: 1, RelatedID: '', Type: 'OUT', FlowDate: '2026-09-03', FlowType: '借款', RelatedParty: '张三', Amount: 300 },
      { ID: 2, RelatedID: '1', Type: 'IN', FlowDate: '2026-09-04', FlowType: '还款', RelatedParty: '张三', Amount: 300 },
    ],
    billCategories: [
      { Type: 'Expense', Category: '餐饮', Subcategory: '正餐' },
      { Type: 'Income', Category: '工资', Subcategory: '工资' },
    ],
    billTags: [{ Tag: '日常' }],
    exFlowType: [{ Flowtype: '借款' }, { Flowtype: '还款' }],
    exRelatedParty: [{ Relatedparty: '张三' }],
    counters: { transactions: 2, externalTransactions: 2 },
    checkedAt: '2026-09-11T00:00:00.000Z',
  };
}

describe('Data quality inspection', function () {
  it('reports a healthy result for internally consistent data', function () {
    const result = inspectDataQuality(validFixture());

    expect(result).to.deep.equal({
      healthy: true,
      checkedAt: '2026-09-11T00:00:00.000Z',
      summary: { error: 0, warning: 0, total: 0 },
      issues: [],
    });
  });

  it('detects invalid records, broken references, and lagging counters', function () {
    const fixture = validFixture();
    fixture.transactions.push(
      { ID: 2, Type: 'Other', BillDate: '2026-02-30', Category: '不存在', Subcategory: '不存在', Tag: '未知', Amount: 0 },
      { ID: 'bad', Type: 'Expense', BillDate: '2026-09-05', Category: '餐饮', Subcategory: '正餐', Tag: '', Amount: 1 },
    );
    fixture.externalTransactions.push({
      ID: 3,
      RelatedID: '99',
      Type: 'SIDEWAYS',
      FlowDate: 'bad-date',
      FlowType: '未知',
      RelatedParty: '李四',
      Amount: 'NaN',
    });
    fixture.counters = { transactions: 1, externalTransactions: 1 };

    const result = inspectDataQuality(fixture);
    const codes = new Set(result.issues.map((issue) => issue.code));

    expect(result.healthy).to.equal(false);
    expect(codes).to.include.members([
      'INVALID_ID',
      'DUPLICATE_ID',
      'INVALID_DATE',
      'INVALID_AMOUNT',
      'INVALID_TYPE',
      'UNKNOWN_CATEGORY',
      'UNKNOWN_TAG',
      'UNKNOWN_FLOW_TYPE',
      'UNKNOWN_RELATED_PARTY',
      'DANGLING_RELATED_ID',
      'COUNTER_BEHIND',
    ]);
    expect(result.summary.error).to.be.greaterThan(0);
    expect(result.summary.warning).to.equal(2);
    expect(result.summary.total).to.equal(result.issues.length);
  });
});
