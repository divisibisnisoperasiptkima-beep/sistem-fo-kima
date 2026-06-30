import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, selectMock, queryResult, queryState } = vi.hoisted(() => {
  const queryState = {
    currentTable: null,
    queryLog: [],
  };

  const queryResult = {
    data: [],
    error: null,
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
  };

  const selectMock = vi.fn((selectClause) => {
    queryState.queryLog.push({
      table: queryState.currentTable,
      selectClause,
    });
    return queryResult;
  });

  const fromMock = vi.fn((table) => {
    queryState.currentTable = table;
    return { select: selectMock };
  });

  return {
    fromMock,
    selectMock,
    queryResult,
    queryState,
  };
});

vi.mock('../supabase', () => ({
  supabase: {
    from: fromMock,
  },
  sendSavedEntityNotificationEmails: vi.fn(),
}));

describe('monitoringApi.getAlerts', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    queryResult.data = [];
    queryResult.error = null;
    queryResult.eq.mockClear();
    queryResult.is.mockClear();
    queryResult.in.mockClear();
    queryResult.order.mockClear();
    queryResult.or.mockClear();
    queryState.currentTable = null;
    queryState.queryLog = [];
  });

  it('tidak meminta kolom customers.contract_period_* yang tidak ada di schema aktif', async () => {
    const { monitoringApi } = await import('../api');

    await monitoringApi.getAlerts({
      year: 2026,
      latestRouteByCustomerId: new Map(),
    });

    const contractsQuery = queryState.queryLog.find((entry) => entry.table === 'contracts')?.selectClause ?? '';
    const invoicesQuery = queryState.queryLog.find((entry) => entry.table === 'invoices')?.selectClause ?? '';

    const normalize = (value) => String(value).replace(/\s+/g, ' ').trim();

    expect(normalize(contractsQuery)).toContain('customer:customers(id, name, status)');
    expect(normalize(invoicesQuery)).toContain('customer:customers(id, name, status)');
    expect(normalize(contractsQuery)).not.toContain('contract_period_start');
    expect(normalize(contractsQuery)).not.toContain('contract_period_end');
    expect(normalize(invoicesQuery)).not.toContain('contract_period_start');
    expect(normalize(invoicesQuery)).not.toContain('contract_period_end');
  });
});
