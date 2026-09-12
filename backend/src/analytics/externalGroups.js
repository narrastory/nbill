import { isValidDateString } from '../validation.js';

function recordId(record) {
  return Number(record.ID ?? record.id);
}

function recordDate(record) {
  return record.FlowDate ?? record.flowDate ?? '';
}

function recordType(record) {
  return record.Type ?? record.type ?? '';
}

function amountCents(record) {
  const amount = Number(record.Amount ?? record.amount);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function relatedIds(record) {
  return String(record.RelatedID ?? record.relatedId ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function daysBetween(from, to) {
  const dayOrdinal = (date) => {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  return Math.max(0, dayOrdinal(to) - dayOrdinal(from));
}

function amountFromCents(cents) {
  return Math.round(cents) / 100;
}

export function buildExternalGroups(records, { asOf }) {
  if (!isValidDateString(asOf)) throw new Error('asOf must be a valid date in YYYY-MM-DD format');

  const eligible = records
    .filter((record) => isValidDateString(recordDate(record)) && recordDate(record) <= asOf)
    .filter((record) => Number.isInteger(recordId(record)) && recordId(record) > 0);
  const byId = new Map(eligible.map((record) => [recordId(record), record]));
  const adjacency = new Map([...byId.keys()].map((id) => [id, new Set()]));
  const danglingById = new Map();

  for (const record of eligible) {
    const id = recordId(record);
    for (const relatedId of relatedIds(record)) {
      if (byId.has(relatedId)) {
        adjacency.get(id).add(relatedId);
        adjacency.get(relatedId).add(id);
      } else {
        if (!danglingById.has(id)) danglingById.set(id, new Set());
        danglingById.get(id).add(relatedId);
      }
    }
  }

  const groups = [];
  const visited = new Set();
  for (const startId of [...byId.keys()].sort((a, b) => a - b)) {
    if (visited.has(startId)) continue;
    const pending = [startId];
    const ids = [];
    while (pending.length > 0) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      ids.push(id);
      for (const neighbor of adjacency.get(id)) {
        if (!visited.has(neighbor)) pending.push(neighbor);
      }
    }
    ids.sort((a, b) => a - b);

    let outCents = 0;
    let inCents = 0;
    const parties = new Set();
    const outDates = [];
    const dangling = new Set();
    for (const id of ids) {
      const record = byId.get(id);
      const type = recordType(record);
      if (type === 'OUT') {
        outCents += amountCents(record);
        outDates.push(recordDate(record));
      } else if (type === 'IN') {
        inCents += amountCents(record);
      }
      const party = String(record.RelatedParty ?? record.relatedParty ?? '').trim();
      if (party) parties.add(party);
      for (const danglingId of danglingById.get(id) ?? []) dangling.add(danglingId);
    }

    const outstandingCents = Math.max(outCents - inCents, 0);
    const overpaidCents = Math.max(inCents - outCents, 0);
    let status;
    if (outCents === 0 && inCents > 0) status = 'unmatched-in';
    else if (outstandingCents > 0) status = 'open';
    else if (overpaidCents > 0) status = 'overpaid';
    else status = 'settled';
    const earliestOutDate = outDates.length > 0 ? outDates.sort()[0] : null;

    groups.push({
      groupId: ids[0],
      transactionIds: ids,
      parties: [...parties].sort(),
      earliestOutDate,
      totalOut: amountFromCents(outCents),
      totalIn: amountFromCents(inCents),
      outstandingAmount: amountFromCents(outstandingCents),
      overpaidAmount: amountFromCents(overpaidCents),
      status,
      ageDays: status === 'open' && earliestOutDate ? daysBetween(earliestOutDate, asOf) : 0,
      danglingRelatedIds: [...dangling].sort((a, b) => a - b),
    });
  }

  return groups.sort((a, b) => (
    b.outstandingAmount - a.outstandingAmount
    || String(a.earliestOutDate ?? '9999-12-31').localeCompare(String(b.earliestOutDate ?? '9999-12-31'))
    || a.groupId - b.groupId
  ));
}

export function summarizeExternalGroups(groups) {
  const summary = {
    totalGroups: groups.length,
    openGroups: 0,
    settledGroups: 0,
    overpaidGroups: 0,
    unmatchedInGroups: 0,
    totalOutstanding: 0,
    totalOverpaid: 0,
  };
  let outstandingCents = 0;
  let overpaidCents = 0;
  for (const group of groups) {
    if (group.status === 'open') summary.openGroups += 1;
    else if (group.status === 'settled') summary.settledGroups += 1;
    else if (group.status === 'overpaid') summary.overpaidGroups += 1;
    else if (group.status === 'unmatched-in') summary.unmatchedInGroups += 1;
    outstandingCents += Math.round(group.outstandingAmount * 100);
    if (group.status === 'overpaid') {
      overpaidCents += Math.round(group.overpaidAmount * 100);
    }
  }
  summary.totalOutstanding = amountFromCents(outstandingCents);
  summary.totalOverpaid = amountFromCents(overpaidCents);
  return summary;
}

export function aggregateExternalByParty(groups) {
  const partyMap = new Map();
  for (const group of groups) {
    if (group.status !== 'open') continue;
    const party = group.parties.length === 1 ? group.parties[0] : 'Multiple';
    if (!partyMap.has(party)) {
      partyMap.set(party, { party, openGroups: 0, outstandingCents: 0, oldestAgeDays: 0 });
    }
    const entry = partyMap.get(party);
    entry.openGroups += 1;
    entry.outstandingCents += Math.round(group.outstandingAmount * 100);
    entry.oldestAgeDays = Math.max(entry.oldestAgeDays, group.ageDays);
  }
  return [...partyMap.values()]
    .map(({ outstandingCents, ...entry }) => ({
      ...entry,
      outstandingAmount: amountFromCents(outstandingCents),
    }))
    .sort((a, b) => b.outstandingAmount - a.outstandingAmount || a.party.localeCompare(b.party));
}

export default { aggregateExternalByParty, buildExternalGroups, summarizeExternalGroups };
