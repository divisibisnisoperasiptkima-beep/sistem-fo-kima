import {
  buildInvoiceScheduleReconciliation,
  buildInvoiceScheduleRows,
  getIspContractRowCoverage,
  resolveCustomerOperationalStatus,
  resolveInvoiceDueMonthIsoDate,
} from '../app/utils';
import { sendSavedEntityNotificationEmails, supabase } from './supabase';

/**
 * API Service untuk Supabase REST API
 * Menggantikan fetch calls ke backend NestJS dengan Supabase client
 */

const LIST_PAGE_SIZE = 500;
const QUERY_CHUNK_SIZE = 100;
const QUERY_CHUNK_CONCURRENCY = 4;
const ISP_LIST_CACHE_TTL_MS = 60_000;
const NOTIFICATION_LIST_CACHE_TTL_MS = 15_000;

let ispListCache = {
  data: null,
  expiresAt: 0,
  promise: null,
};

const notificationListCache = new Map();

const cloneIspList = (items) => (Array.isArray(items) ? items.map((isp) => ({
  ...isp,
  entryPoints: Array.isArray(isp.entryPoints)
    ? isp.entryPoints.map((point) => ({ ...point }))
    : isp.entryPoints,
})) : []);

const cloneNotifications = (items) => (Array.isArray(items)
  ? items.map((item) => ({ ...item, metadata: item.metadata ? { ...item.metadata } : item.metadata }))
  : []);

const clearIspListCache = () => {
  ispListCache = {
    data: null,
    expiresAt: 0,
    promise: null,
  };
};

const clearNotificationListCache = () => {
  notificationListCache.clear();
};

const triggerSavedEntityNotificationEmails = ({ entityType, entityId }) => {
  void sendSavedEntityNotificationEmails({ entityType, entityId }).catch((notificationError) => {
    console.warn(`Failed to send ${entityType} save notification emails:`, notificationError);
  });
};

export const clearSessionCaches = () => {
  clearIspListCache();
  clearNotificationListCache();
};

const mapIspAccount = (mapping) => mapping ? ({
  id: mapping.id ?? null,
  authUserId: mapping.auth_user_id ?? mapping.authUserId ?? null,
  ispId: mapping.isp_id ?? mapping.ispId ?? null,
  email: mapping.email ?? null,
  displayName: mapping.display_name ?? mapping.displayName ?? null,
  isp: mapping.isp ? mapIsp(mapping.isp) : null,
}) : null;

const resolveInvoiceDueDate = (periodStartDate) => resolveInvoiceDueMonthIsoDate(periodStartDate);

const resolveBillingCycleInvoiceAmount = (monthlyAmount, billingCycle) => {
  const amount = Number(monthlyAmount ?? 0);
  const every = Number(billingCycle?.every ?? 1);
  const unit = String(billingCycle?.unit ?? 'bulan');

  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(every) || every <= 0) {
    return 0;
  }

  if (unit === 'tahun') {
    return amount * every * 12;
  }
  if (unit === 'bulan') {
    return amount * every;
  }
  if (unit === 'hari') {
    return Math.round((amount / 30) * every);
  }

  return amount;
};

const chunkArray = (items, size = QUERY_CHUNK_SIZE) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const fetchInChunks = async (items, fetchChunk, size = QUERY_CHUNK_SIZE, concurrency = QUERY_CHUNK_CONCURRENCY) => {
  const chunks = chunkArray(items, size).filter((chunk) => chunk.length > 0);
  if (chunks.length === 0) return [];

  const results = [];
  for (let index = 0; index < chunks.length; index += concurrency) {
    const batch = chunks.slice(index, index + concurrency);
    const batchResults = await Promise.all(batch.map((chunk) => fetchChunk(chunk)));
    results.push(...batchResults);
  }

  return results.flatMap((data) => Array.isArray(data) ? data : []);
};

const getErrorText = (error) => [
  error?.message,
  error?.details,
  error?.hint,
  error?.code,
  error?.status,
].filter(Boolean).join(' ').toLowerCase();

const getApiErrorFields = (text) => {
  const fields = new Set();

  if (text.includes('email') || text.includes('user already registered') || text.includes('already been registered')) {
    fields.add('userEmail');
  }
  if (text.includes('name') || text.includes('nama')) {
    fields.add('name');
  }
  if (text.includes('customer_code') || text.includes('customer code')) {
    fields.add('customerCode');
  }
  if (text.includes('contract_number') || text.includes('contract number')) {
    fields.add('contractNumber');
  }
  if (text.includes('invoice_number') || text.includes('invoice number')) {
    fields.add('invoiceNumber');
  }
  if (text.includes('nomor_dokumen') || text.includes('document number') || text.includes('dokumen')) {
    fields.add('documentNumber');
  }
  if (text.includes('contract_period_start') || text.includes('period_start') || text.includes('start_date')) {
    fields.add('contractPeriodStart');
  }
  if (text.includes('contract_period_end') || text.includes('period_end') || text.includes('end_date')) {
    fields.add('contractPeriodEnd');
  }
  if (text.includes('isp_id') || text.includes('isp') || text.includes('foreign key')) {
    fields.add('selectedIspId');
  }

  return Array.from(fields);
};

export const getApiErrorDetails = (error, fallbackMessage = 'Terjadi kesalahan. Silakan coba lagi.') => {
  const text = getErrorText(error);
  const status = Number(error?.status ?? 0);
  const code = String(error?.code ?? '');
  const fields = getApiErrorFields(text);

  if (
    text.includes('user already registered')
    || text.includes('already been registered')
    || text.includes('email address already')
    || (text.includes('email') && text.includes('already exists'))
  ) {
    return {
      message: 'Email akses sudah terdaftar. Gunakan email lain.',
      fields: fields.includes('userEmail') ? fields : ['userEmail'],
      fieldMessages: {
        userEmail: 'Email ini sudah dipakai akun lain.',
      },
    };
  }

  if (code === '23505' || status === 409 || text.includes('duplicate key value') || text.includes('already exists')) {
    if (text.includes('isps') || text.includes('isp')) {
      return {
        message: 'Data ISP sudah terdaftar. Periksa nama ISP atau email akses.',
        fields: fields.length > 0 ? fields : ['name', 'userEmail'],
        fieldMessages: {
          name: 'Nama ISP sudah digunakan.',
          userEmail: 'Email akses sudah digunakan.',
        },
      };
    }
    if (text.includes('customers') || text.includes('customer') || text.includes('pelanggan')) {
      return {
        message: 'Data pelanggan/lokasi sudah terdaftar. Periksa kembali field yang ditandai.',
        fields: fields.length > 0 ? fields : ['name'],
      };
    }
    if (text.includes('invoice')) {
      return {
        message: 'Data invoice sudah terdaftar. Periksa kembali nomor atau periode invoice.',
        fields: fields.length > 0 ? fields : ['invoiceNumber'],
      };
    }
    if (text.includes('contract')) {
      return {
        message: 'Data kontrak sudah terdaftar. Periksa kembali nomor atau periode kontrak.',
        fields: fields.length > 0 ? fields : ['contractNumber'],
      };
    }
    if (text.includes('document') || text.includes('dokumen')) {
      return {
        message: 'Data dokumen sudah terdaftar. Periksa kembali nomor dokumen yang digunakan.',
        fields: fields.length > 0 ? fields : ['documentNumber'],
      };
    }
    return {
      message: 'Data sudah terdaftar. Periksa kembali field yang ditandai.',
      fields,
    };
  }

  if (code === '23503' || text.includes('foreign key')) {
    return {
      message: 'Data referensi tidak valid. Pastikan data terkait masih tersedia sebelum menyimpan.',
      fields: fields.length > 0 ? fields : ['selectedIspId'],
    };
  }

  if (code === '23502' || text.includes('not-null') || text.includes('null value')) {
    return {
      message: 'Ada data wajib yang belum diisi. Periksa kembali field yang ditandai.',
      fields,
    };
  }

  if (code === '42501' || text.includes('permission denied') || text.includes('row-level security')) {
    return {
      message: 'Anda tidak memiliki izin untuk melakukan aksi ini.',
      fields: [],
    };
  }

  if (code === '23514' || text.includes('invalid input') || text.includes('violates check constraint')) {
    return {
      message: 'Format data tidak valid. Periksa kembali field yang ditandai.',
      fields,
    };
  }

  return {
    message: error instanceof Error && error.message ? error.message : fallbackMessage,
    fields,
  };
};

export const formatApiError = (error, fallbackMessage = 'Terjadi kesalahan. Silakan coba lagi.') => getApiErrorDetails(error, fallbackMessage).message;

const getCurrentActor = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return {
    user,
    actor: {
      actor_user_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      actor_role: user?.user_metadata?.role ?? 'guest',
    },
  };
};

const getBrowserContext = () => {
  if (typeof window === 'undefined') return {};
  return {
    user_agent: window.navigator?.userAgent ?? null,
  };
};

const createActivityLog = async ({ metadata = {}, ...payload }) => {
  try {
    const { actor } = await getCurrentActor();
    if (!actor.actor_user_id) return null;

    const { error } = await supabase
      .from('activity_logs')
      .insert({
        ...actor,
        ...getBrowserContext(),
        ...payload,
        entity_id: payload.entity_id !== undefined && payload.entity_id !== null ? String(payload.entity_id) : null,
        metadata,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to write activity log:', error);
    return null;
  }
};

export const sessionApi = {
  clearCaches: clearSessionCaches,

  async getCurrentIspAccount() {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user?.id) return null;

    const { data, error } = await supabase
      .from('isp_user_accounts')
      .select(`
        id,
        auth_user_id,
        isp_id,
        email,
        display_name,
        isp:isps(
          id,
          name,
          status,
          logo_url,
          contract_reference,
          contract_start_date,
          contract_period_start,
          contract_period_end,
          bak_file_name,
          contract_file_name,
          paket,
          jumlah,
          billing_period_mode,
          activation_fee_amount,
          created_at,
          updated_at,
          user_id,
          deleted_at
        )
      `)
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (data?.isp?.deleted_at) return null;
    return mapIspAccount(data);
  },
};

const softDeleteRows = async ({ table, ids = [], deletedBy = null, now = new Date().toISOString() }) => {
  const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => Number(id))
    .filter(Number.isFinite)));

  if (normalizedIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from(table)
    .update({ deleted_at: now, deleted_by: deletedBy, updated_at: now })
    .in('id', normalizedIds);

  if (error) throw error;
};

const pickChangedFields = (before = {}, after = {}, fields = []) => {
  const changedFields = [];
  const beforeValues = {};
  const afterValues = {};

  fields.forEach((field) => {
    const beforeValue = before?.[field] ?? null;
    const afterValue = after?.[field] ?? null;
    if (beforeValue !== afterValue) {
      changedFields.push(field);
      beforeValues[field] = beforeValue;
      afterValues[field] = afterValue;
    }
  });

  return {
    changed_fields: changedFields,
    before: beforeValues,
    after: afterValues,
  };
};

const ACTIVITY_ENTITY_CONFIG = {
  isps: { entityType: 'isp', nameFields: ['name'] },
  customers: { entityType: 'customer', nameFields: ['name'] },
  contracts: { entityType: 'contract', nameFields: ['contract_number'] },
  contract_versions: { entityType: 'contract_version', nameFields: ['version_number', 'change_note', 'remarks'] },
  invoices: { entityType: 'invoice', nameFields: ['invoice_number'] },
  documents: { entityType: 'document', nameFields: ['nomor_dokumen', 'jenis_dokumen'] },
  customer_route_versions: { entityType: 'route', nameFields: ['change_note', 'flow_status', 'version_number'] },
};

const getEntityDisplayName = (row, fallback = 'Data') => {
  if (!row) return fallback;
  return row.name
    ?? row.contract_number
    ?? row.invoice_number
    ?? row.nomor_dokumen
    ?? row.jenis_dokumen
    ?? (row.version_number && row.contract_id ? `Versi Kontrak ${row.version_number}` : null)
    ?? row.change_note
    ?? (row.version_number ? `Jalur v${row.version_number}` : null)
    ?? row.flow_status
    ?? fallback;
};

const getNotificationSeverityRank = (severity) => ({ critical: 0, warning: 1, info: 2 }[severity] ?? 3);
const isCustomerOperationalForDashboard = (customer, todayIso = getTodayIso()) => {
  const rawStatus = String(customer?.status ?? customer?.rawStatus ?? '').trim().toLowerCase();
  if (rawStatus === 'belum_diperpanjang' || rawStatus === 'belum diperpanjang') {
    return true;
  }
  const status = resolveCustomerOperationalStatus(customer, todayIso);
  return status === 'aktif' || status === 'belum_beroperasi';
};
const getNotificationDueTimestamp = (notification) => {
  const dueTimestamp = getDateValue(notification?.dueDate);
  return dueTimestamp > 0 ? dueTimestamp : Number.MAX_SAFE_INTEGER;
};
const getNotificationCreatedTimestamp = (notification) => {
  const createdTimestamp = getDateValue(notification?.createdAt);
  return createdTimestamp > 0 ? createdTimestamp : Number.MAX_SAFE_INTEGER;
};

const mapAlertToNotification = (alert, index) => {
  const alertCode = alert.code || alert.type || 'notification';
  const customerId = Number(alert.customerId);
  const targetTab = alertCode.includes('contract')
    ? 'contracts'
    : alertCode.includes('invoice') || alertCode.includes('payment')
    ? 'invoices'
    : alertCode.includes('route')
      ? 'jalur'
      : 'overview';
  const targetPath = Number.isFinite(customerId)
    ? `/customers/${customerId}${targetTab !== 'overview' ? `?tab=${targetTab}` : ''}`
    : null;

  return {
    id: `${alertCode}-${alert.customerId ?? 'general'}-${index}`,
    source: 'monitoring',
    type: alert.type || alertCode,
    code: alertCode,
    severity: alert.severity || 'warning',
    title: alert.title || 'Notifikasi',
    message: alert.message || alert.title || 'Ada data yang perlu ditindaklanjuti.',
    customerId: Number.isFinite(customerId) ? customerId : null,
    customerName: alert.customerName || null,
    actionLabel: targetTab === 'invoices'
      ? 'Buka Invoice'
      : targetTab === 'jalur'
        ? 'Buka Jalur'
        : 'Buka Detail',
    targetPath,
    dueDate: alert.dueDate || null,
    createdAt: alert.createdAt || new Date().toISOString(),
    readAt: null,
    resolvedAt: null,
  };
};

const getNotificationTargetPath = (customerId, tab = 'overview') => (
  customerId ? `/customers/${customerId}${tab !== 'overview' ? `?tab=${tab}` : ''}` : null
);

const getCustomerNotificationTargetPath = (customerId, { tab = 'overview', ispId = null } = {}) => {
  if (!customerId) return null;
  const searchParams = new URLSearchParams();
  if (tab && tab !== 'overview') {
    searchParams.set('tab', tab);
  }
  if (ispId !== null && ispId !== undefined) {
    searchParams.set('isp', String(ispId));
  }
  const query = searchParams.toString();
  return `/customers/${customerId}${query ? `?${query}` : ''}`;
};

const getNotificationTargetTab = (notification) => {
  if (notification.type === 'contract_expiring' || notification.type === 'contract_renewal') return 'contracts';
  if (notification.type === 'route_setup' || notification.type === 'route_attention') return 'jalur';
  if (String(notification.type || '').startsWith('invoice_') || notification.type === 'invoice_attention') return 'invoices';

  try {
    const url = new URL(notification.targetPath || '/', 'https://local.invalid');
    return url.searchParams.get('tab') || 'overview';
  } catch {
    return 'overview';
  }
};

const ADMIN_CONTRACT_NOTIFICATION_TYPES = new Set(['contract_expiring', 'contract_renewal']);
const TEKNISI_ROUTE_NOTIFICATION_TYPES = new Set(['route_setup', 'route_attention']);

const getNotificationIspIds = (notification) => {
  const ids = [];
  const directIspId = Number(notification.ispId);
  if (Number.isFinite(directIspId) && directIspId > 0) ids.push(directIspId);
  if (Array.isArray(notification.metadata?.ispIds)) {
    notification.metadata.ispIds.forEach((value) => {
      const ispId = Number(value);
      if (Number.isFinite(ispId) && ispId > 0) ids.push(ispId);
    });
  }
  return Array.from(new Set(ids));
};

const canReceiveInAppNotification = ({ role, ispId }, notification) => {
  if (role === 'super_admin') return true;
  if (role === 'admin') return ADMIN_CONTRACT_NOTIFICATION_TYPES.has(notification.type);
  if (role === 'teknisi') return TEKNISI_ROUTE_NOTIFICATION_TYPES.has(notification.type);
  if (role === 'isp') {
    const scopedIspIds = getNotificationIspIds(notification);
    if (scopedIspIds.length > 0) return scopedIspIds.includes(Number(ispId));
    return Number.isFinite(Number(notification.customerId));
  }
  return false;
};

const scopeNotificationTargetForRole = ({ role, ispId }, notification) => {
  const customerId = Number(notification.customerId);
  if (!Number.isFinite(customerId) || customerId <= 0) return notification;

  if (role === 'admin') {
    return {
      ...notification,
      actionLabel: notification.actionLabel || 'Buka Kontrak',
      targetPath: getCustomerNotificationTargetPath(customerId, { tab: 'contracts' }),
    };
  }

  if (role === 'teknisi') {
    return {
      ...notification,
      actionLabel: notification.actionLabel || 'Buka Jalur',
      targetPath: getCustomerNotificationTargetPath(customerId, { tab: 'jalur' }),
    };
  }

  if (role === 'isp') {
    return {
      ...notification,
      targetPath: getCustomerNotificationTargetPath(customerId, {
        tab: getNotificationTargetTab(notification),
        ispId,
      }),
    };
  }

  return notification;
};

const getCurrentNotificationScope = async (user) => {
  const role = user?.user_metadata?.role || 'guest';
  if (role !== 'isp' || !user?.id) {
    return { role, ispId: null };
  }

  const { data, error } = await supabase
    .from('isp_user_accounts')
    .select('isp_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return {
    role,
    ispId: data?.isp_id ?? null,
  };
};

const addDaysToIsoDate = (dateValue, dayOffset) => {
  if (!dateValue) return null;
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
};

const getFirstDayOfNextMonthIso = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
};

const inferNextContractPeriod = (startDateValue, endDateValue) => {
  const startDate = new Date(`${String(startDateValue ?? '').slice(0, 10)}T00:00:00.000Z`);
  const endDate = new Date(`${String(endDateValue ?? '').slice(0, 10)}T00:00:00.000Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return { startDate: null, endDate: null };
  }

  const durationDays = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
  const nextStartDate = addDaysToIsoDate(endDateValue, 1);
  const nextEndDate = addDaysToIsoDate(nextStartDate, durationDays);

  return {
    startDate: nextStartDate,
    endDate: nextEndDate,
  };
};

const getIsoDateValue = (dateValue) => {
  const timestamp = dateValue ? new Date(`${String(dateValue).slice(0, 10)}T00:00:00.000Z`).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getLatestRouteVersionByCustomerId = async () => {
  try {
    const { data, error } = await supabase
      .from('customer_route_versions')
      .select('customer_id,version_number,flow_status,created_at')
      .order('customer_id', { ascending: true })
      .order('version_number', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const latestByCustomerId = new Map();
    (data || []).forEach((routeVersion) => {
      const customerId = Number(routeVersion.customer_id);
      if (Number.isFinite(customerId) && !latestByCustomerId.has(customerId)) {
        latestByCustomerId.set(customerId, routeVersion);
      }
    });
    return latestByCustomerId;
  } catch (error) {
    console.warn('Gagal memuat versi jalur terbaru per customer; lanjut tanpa data jalur.', error);
    return new Map();
  }
};

const createDerivedNotification = ({ code, type, severity = 'warning', title, message, customerId, customerName, actionLabel = 'Buka Detail', targetTab = 'overview', dueDate = null }) => ({
  id: `${code}-${customerId ?? 'general'}${dueDate ? `-${dueDate}` : ''}`,
  source: 'derived',
  type,
  code,
  severity,
  title,
  message,
  customerId: customerId ?? null,
  customerName: customerName ?? null,
  actionLabel,
  targetPath: getNotificationTargetPath(customerId, targetTab),
  dueDate,
  createdAt: new Date().toISOString(),
  readAt: null,
  resolvedAt: null,
});

const getIspNotificationTargetPath = (ispId, tab = 'overview') => (
  ispId ? `/isps/${ispId}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}` : null
);

const createIspDerivedNotification = ({
  code,
  type,
  severity = 'warning',
  title,
  message,
  ispId,
  ispName,
  actionLabel = 'Buka ISP',
  targetTab = 'overview',
  rowId = null,
  followUpId = null,
  actionType = null,
}) => ({
  id: [code, ispId ?? 'general', rowId, followUpId].filter((part) => part !== null && part !== undefined && part !== '').join('-'),
  source: 'derived',
  type,
  code,
  severity,
  title,
  message,
  customerId: null,
  ispId: ispId ?? null,
  customerName: ispName ?? null,
  rowId,
  followUpId,
  actionType,
  actionLabel,
  targetPath: getIspNotificationTargetPath(ispId, targetTab),
  dueDate: null,
  createdAt: new Date().toISOString(),
  readAt: null,
  resolvedAt: null,
});

const getIspDerivedNotifications = async () => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [ispsResult, missingBakResult, missingContractResult, contractRowsResult] = await Promise.all([
    supabase
      .from('isps')
      .select('id,name,status,contract_reference,contract_start_date,contract_period_start,contract_period_end')
      .is('deleted_at', null),
    supabase
      .from('isps')
      .select('id')
      .is('deleted_at', null)
      .or('bak_file_url.is.null,bak_file_url.eq.'),
    supabase
      .from('isps')
      .select('id')
      .is('deleted_at', null)
      .or('contract_file_url.is.null,contract_file_url.eq.'),
    supabase
      .from('isp_contract_rows')
      .select(`
        id,
        isp_id,
        contract_reference,
        contract_start_date,
        period_start,
        period_end,
        renewal_status,
        bak_file_url,
        contract_file_url,
        renewal_file_url,
        response_file_url,
        renewalFollowUps:isp_renewal_follow_ups(
          id,
          row_id,
          split_order,
          status,
          renewal_file_url,
          response_file_url,
          response_decision,
          created_at,
          updated_at
        )
      `)
      .is('deleted_at', null)
      .eq('renewal_status', 'active'),
  ]);

  if (ispsResult.error) throw ispsResult.error;
  if (missingBakResult.error) throw missingBakResult.error;
  if (missingContractResult.error) throw missingContractResult.error;
  if (contractRowsResult.error) throw contractRowsResult.error;

  const missingBakIds = new Set((missingBakResult.data || []).map((isp) => Number(isp.id)));
  const missingContractIds = new Set((missingContractResult.data || []).map((isp) => Number(isp.id)));

  // Group contract rows by ISP ID
  const contractRowsByIspId = new Map();
  (contractRowsResult.data || []).forEach((row) => {
    const ispId = Number(row.isp_id);
    if (!contractRowsByIspId.has(ispId)) {
      contractRowsByIspId.set(ispId, []);
    }
    contractRowsByIspId.get(ispId).push(row);
  });

  const getActiveContractRowCoverage = (ispId) => getIspContractRowCoverage(contractRowsByIspId.get(Number(ispId)) || []);

  return (ispsResult.data || []).flatMap((isp) => {
    const ispId = isp.id;
    const ispName = isp.name || `ISP #${ispId}`;
    const ispStatus = String(isp.status || '').trim().toLowerCase();
    if (['berhenti', 'nonaktif'].includes(ispStatus)) return [];
    const activeContractRowCoverage = getActiveContractRowCoverage(ispId);

    const notifications = [];
    if (!String(isp.contract_reference || '').trim() && !activeContractRowCoverage.hasReference) {
      notifications.push(createIspDerivedNotification({
        code: 'isp_contract_reference_missing',
        type: 'isp_contract',
        title: 'Nomor kontrak ISP belum diisi',
        message: `${ispName} belum memiliki nomor kontrak/referensi kontrak.`,
        ispId,
        ispName,
        actionLabel: 'Buka Kontrak',
        targetTab: 'contracts',
      }));
    }
    if (!isp.contract_start_date && !activeContractRowCoverage.hasStartDate) {
      notifications.push(createIspDerivedNotification({
        code: 'isp_contract_start_missing',
        type: 'isp_contract',
        title: 'Awal kontrak ISP belum diisi',
        message: `${ispName} belum memiliki tanggal awal kontrak.`,
        ispId,
        ispName,
        actionLabel: 'Buka Kontrak',
        targetTab: 'contracts',
      }));
    }
    if ((!isp.contract_period_start || !isp.contract_period_end) && !activeContractRowCoverage.hasPeriod) {
      notifications.push(createIspDerivedNotification({
        code: 'isp_contract_period_missing',
        type: 'isp_contract',
        title: 'Periode berjalan ISP belum lengkap',
        message: `${ispName} belum memiliki periode berjalan awal dan akhir yang lengkap.`,
        ispId,
        ispName,
        actionLabel: 'Buka Kontrak',
        targetTab: 'contracts',
      }));
    }
    if (missingBakIds.has(Number(ispId)) && !activeContractRowCoverage.hasBakFile) {
      notifications.push(createIspDerivedNotification({
        code: 'isp_bak_missing',
        type: 'isp_document',
        title: 'BAK ISP belum diupload',
        message: `${ispName} belum memiliki file BAK.`,
        ispId,
        ispName,
        actionLabel: 'Buka Kontrak',
        targetTab: 'contracts',
      }));
    }
    if (missingContractIds.has(Number(ispId)) && !activeContractRowCoverage.hasContractFile) {
      notifications.push(createIspDerivedNotification({
        code: 'isp_contract_file_missing',
        type: 'isp_document',
        title: 'File kontrak ISP belum diupload',
        message: `${ispName} belum memiliki file kontrak.`,
        ispId,
        ispName,
        actionLabel: 'Buka Kontrak',
        targetTab: 'contracts',
      }));
    }

    // Check contract renewal notifications
    const contractRows = contractRowsByIspId.get(Number(ispId)) || [];
    contractRows.forEach((row) => {
      const periodEnd = row.period_end;
      if (!periodEnd) return;

      const threeMonthsBefore = addDaysToIsoDate(periodEnd, -90);
      const twoMonthsBefore = addDaysToIsoDate(periodEnd, -60);
      const oneMonthBefore = addDaysToIsoDate(periodEnd, -30);
      const followUps = Array.isArray(row.renewalFollowUps) ? row.renewalFollowUps : [];
      const sortedFollowUps = [...followUps].sort((left, right) => {
        const splitDiff = Number(right?.split_order ?? 0) - Number(left?.split_order ?? 0);
        if (splitDiff !== 0) return splitDiff;
        return String(right?.updated_at ?? right?.created_at ?? '').localeCompare(String(left?.updated_at ?? left?.created_at ?? ''));
      });
      const pendingResponseFollowUp = sortedFollowUps.find((followUp) => (
        followUp?.status !== 'completed'
        && followUp?.renewal_file_url
        && String(followUp.renewal_file_url).trim()
        && !(followUp?.response_file_url && String(followUp.response_file_url).trim())
      )) ?? null;
      const latestFollowUp = pendingResponseFollowUp ?? sortedFollowUps[0] ?? null;
      const hasRenewalFile = !!(
        (row.renewal_file_url && String(row.renewal_file_url).trim())
        || sortedFollowUps.some((followUp) => followUp?.renewal_file_url && String(followUp.renewal_file_url).trim())
      );
      const hasResponseFile = !!(
        (row.response_file_url && String(row.response_file_url).trim())
        || sortedFollowUps.some((followUp) => followUp?.response_file_url && String(followUp.response_file_url).trim())
      );

      if (todayIso > periodEnd && !hasResponseFile) {
        notifications.push(createIspDerivedNotification({
          code: 'isp_renewal_overdue',
          type: 'isp_renewal',
          severity: 'critical',
          title: 'Kontrak ISP belum diperpanjang',
          message: `Kontrak ${row.contract_reference || 'ISP'} untuk ${ispName} telah berakhir pada ${periodEnd}. Status: Belum Diperpanjang.`,
          ispId,
          ispName,
          rowId: row.id,
          followUpId: latestFollowUp?.id ?? null,
          actionType: hasRenewalFile ? 'response' : 'renewal',
          actionLabel: 'Buka Kontrak',
          targetTab: 'contracts',
        }));
      } else if (todayIso >= oneMonthBefore && todayIso < periodEnd && hasRenewalFile && !hasResponseFile) {
        notifications.push(createIspDerivedNotification({
          code: 'isp_renewal_warning_1m',
          type: 'isp_renewal',
          severity: 'critical',
          title: 'Peringatan ke-3: Kontrak akan berakhir dalam 1 bulan',
          message: `Kontrak ${row.contract_reference || 'ISP'} untuk ${ispName} akan berakhir pada ${periodEnd}. Belum ada tanggapan dari ISP.`,
          ispId,
          ispName,
          rowId: row.id,
          followUpId: pendingResponseFollowUp?.id ?? latestFollowUp?.id ?? null,
          actionType: 'response',
          actionLabel: 'Buka Kontrak',
          targetTab: 'contracts',
        }));
      } else if (todayIso >= twoMonthsBefore && todayIso < periodEnd && hasRenewalFile && !hasResponseFile) {
        notifications.push(createIspDerivedNotification({
          code: 'isp_renewal_warning_2m',
          type: 'isp_renewal',
          title: 'Peringatan ke-2: Menunggu tanggapan perpanjangan',
          message: `Kontrak ${row.contract_reference || 'ISP'} untuk ${ispName} akan berakhir pada ${periodEnd}. Surat perpanjangan sudah dikirim, menunggu tanggapan ISP.`,
          ispId,
          ispName,
          rowId: row.id,
          followUpId: pendingResponseFollowUp?.id ?? latestFollowUp?.id ?? null,
          actionType: 'response',
          actionLabel: 'Buka Kontrak',
          targetTab: 'contracts',
        }));
      } else if (todayIso >= threeMonthsBefore && todayIso < periodEnd && !hasRenewalFile) {
        notifications.push(createIspDerivedNotification({
          code: 'isp_renewal_warning_3m',
          type: 'isp_renewal',
          title: 'Kontrak ISP akan berakhir dalam 3 bulan',
          message: `Kontrak ${row.contract_reference || 'ISP'} untuk ${ispName} akan berakhir pada ${periodEnd}. Segera buat surat perpanjangan.`,
          ispId,
          ispName,
          rowId: row.id,
          followUpId: latestFollowUp?.id ?? null,
          actionType: 'renewal',
          actionLabel: 'Buka Kontrak',
          targetTab: 'contracts',
        }));
      }
    });

    return notifications;
  });
};

const getDerivedNotifications = async (latestRouteByCustomerId = null) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const baseInvoiceColumns = 'id,customer_id,invoice_number,amount,due_date,period_start_date,period_end_date,status,schedule_status';
  const [customersResult, incompleteInvoicesResult, missingFileInvoicesResult] = await Promise.all([
    supabase
      .from('customers')
      .select(`
        id,
        name,
        status,
        activation_fee_amount,
        activation_fee_paid_at,
        contracts(
          id,
          contract_number,
          status,
          start_date,
          end_date,
          versions:contract_versions(id, start_date, end_date, deleted_at)
        ),
        documents(id, contract_id, jenis_dokumen, file_url, deleted_at)
      `)
      .is('deleted_at', null),
    supabase
      .from('invoices')
      .select(baseInvoiceColumns)
      .in('status', ['belum_bayar', 'terlambat', 'belum_ditagih'])
      .eq('schedule_status', 'active')
      .is('deleted_at', null)
      .or('due_date.is.null,amount.lte.0'),
    supabase
      .from('invoices')
      .select(baseInvoiceColumns)
      .in('status', ['belum_bayar', 'terlambat', 'belum_ditagih'])
      .eq('schedule_status', 'active')
      .is('deleted_at', null)
      .or('due_date.not.is.null,period_end_date.not.is.null')
      .or('invoice_file_url.is.null,invoice_file_url.eq.')
      .or('payment_proof_file_url.is.null,payment_proof_file_url.eq.'),
  ]);

  if (customersResult.error) throw customersResult.error;
  if (incompleteInvoicesResult.error) throw incompleteInvoicesResult.error;
  if (missingFileInvoicesResult.error) throw missingFileInvoicesResult.error;

  const routeByCustomerId = latestRouteByCustomerId ?? await getLatestRouteVersionByCustomerId();

  const invoicesByCustomerId = new Map();
  const invoicesById = new Map();
  (incompleteInvoicesResult.data || []).forEach((invoice) => {
    invoicesById.set(invoice.id, { ...invoice, isIncomplete: true, isMissingFiles: false });
  });
  (missingFileInvoicesResult.data || []).forEach((invoice) => {
    invoicesById.set(invoice.id, {
      ...(invoicesById.get(invoice.id) || invoice),
      ...invoice,
      isMissingFiles: true,
    });
  });

  Array.from(invoicesById.values()).forEach((invoice) => {
    const list = invoicesByCustomerId.get(invoice.customer_id) || [];
    list.push(invoice);
    invoicesByCustomerId.set(invoice.customer_id, list);
  });

  return (customersResult.data || []).flatMap((customer) => {
    const customerId = customer.id;
    const customerName = customer.name || `Pelanggan #${customerId}`;
    const customerStatus = resolveCustomerOperationalStatus(customer, todayIso);
    const notifications = [];

    if (customerStatus === 'aktif' && Number(customer.activation_fee_amount || 0) > 0 && !customer.activation_fee_paid_at) {
      notifications.push(createDerivedNotification({
        code: 'activation_fee_unpaid',
        type: 'activation_fee',
        severity: 'warning',
        title: 'Biaya aktivasi belum dibayar',
        message: `${customerName} masih memiliki biaya aktivasi outstanding.`,
        customerId,
        customerName,
        actionLabel: 'Buka Detail',
      }));
    }

    const contracts = Array.isArray(customer.contracts) ? customer.contracts : [];
    const activeContract = contracts.find((contract) => String(contract.status || '').toLowerCase() === 'aktif') ?? contracts[0];
    const contractNumber = String(activeContract?.contract_number || '').trim();
    if (customerStatus === 'aktif' && activeContract && (!contractNumber || contractNumber.startsWith('NO-BAK-'))) {
      notifications.push(createDerivedNotification({
        code: 'contract_number_missing',
        type: 'contract_admin',
        severity: 'warning',
        title: 'Nomor kontrak belum diisi',
        message: `${customerName} belum memiliki nomor kontrak final.`,
        customerId,
        customerName,
        actionLabel: 'Buka Kontrak',
        targetTab: 'contracts',
      }));
    }

    if (customerStatus === 'aktif' && activeContract) {
      const activeContractId = Number(activeContract.id);
      const documents = Array.isArray(customer.documents) ? customer.documents : [];
      const activeContractDocuments = documents.filter((document) => (
        Number(document.contract_id) === activeContractId
        && !document.deleted_at
        && String(document.file_url || '').trim()
      ));
      const hasContractFile = activeContractDocuments.some((document) => (
        String(document.jenis_dokumen || '').trim().toLowerCase() === 'kontrak'
      ));
      const hasBakFile = activeContractDocuments.some((document) => (
        String(document.jenis_dokumen || '').trim().toLowerCase() === 'bak'
      ));

      if (!hasContractFile) {
        notifications.push(createDerivedNotification({
          code: 'contract_file_missing',
          type: 'contract_admin',
          severity: 'warning',
          title: 'Berkas kontrak belum diunggah',
          message: `${customerName} belum memiliki berkas kontrak yang diunggah.`,
          customerId,
          customerName,
          actionLabel: 'Upload Kontrak',
          targetTab: 'contracts',
        }));
      }

      if (!hasBakFile) {
        notifications.push(createDerivedNotification({
          code: 'bak_missing',
          type: 'contract_admin',
          severity: 'warning',
          title: 'BAK belum tersedia',
          message: `${customerName} belum memiliki Berita Acara Koneksi/BAK.`,
          customerId,
          customerName,
          actionLabel: 'Buka Kontrak',
          targetTab: 'contracts',
        }));
      }
    }

    const latestRoute = routeByCustomerId.get(Number(customerId)) ?? null;
    if (customerStatus === 'aktif' && !latestRoute?.flow_status) {
      notifications.push(createDerivedNotification({
        code: 'missing_route',
        type: 'route_setup',
        severity: 'warning',
        title: 'Data jalur belum lengkap',
        message: `${customerName} belum memiliki data jalur aktif.`,
        customerId,
        customerName,
        actionLabel: 'Buka Jalur',
        targetTab: 'jalur',
      }));
    }

    const invoices = customerStatus === 'aktif' ? invoicesByCustomerId.get(customer.id) || [] : [];
    invoices.forEach((invoice) => {
        const dueDate = invoice.due_date || (invoice.period_start_date ? resolveInvoiceDueMonthIsoDate(invoice.period_start_date) : null) || invoice.period_end_date || null;
        const amount = Number(invoice.amount || 0);

        if (invoice.isIncomplete && (!dueDate || amount <= 0)) {
          notifications.push(createDerivedNotification({
            code: 'invoice_setup_incomplete',
            type: 'invoice_setup',
            severity: 'warning',
            title: 'Lengkapi set date dan jumlah dibayar',
            message: `${customerName} memiliki invoice yang belum lengkap tanggal jatuh tempo atau nominalnya.`,
            customerId,
            customerName,
            actionLabel: 'Buka Invoice',
            targetTab: 'invoices',
          }));
        }

        const reminderDate = addDaysToIsoDate(dueDate, -7);
        if (invoice.isMissingFiles && dueDate && reminderDate && reminderDate <= todayIso) {
          notifications.push(createDerivedNotification({
            code: 'invoice_h_minus_7',
            type: 'invoice_reminder',
            severity: 'warning',
            title: 'Reminder bulan jatuh tempo',
            message: `${customerName} sudah memasuki reminder bulan jatuh tempo. Upload invoice pembayaran diperlukan.`,
            customerId,
            customerName,
            actionLabel: 'Buka Invoice',
            targetTab: 'invoices',
            dueDate,
          }));
        }
      });

    return notifications;
  });
};

const upsertNotificationState = async (notificationKey, values) => {
  const { user } = await getCurrentActor();
  if (!user?.id || !notificationKey) return null;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('notification_states')
    .upsert({
      notification_key: notificationKey,
      actor_user_id: user.id,
      ...values,
      updated_at: now,
    }, { onConflict: 'notification_key,actor_user_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
};

const notificationsApi = {
  async list({ year = new Date().getUTCFullYear(), limit = 30, includeResolved = false } = {}) {
    const cappedLimit = Math.max(1, Math.min(Number(limit) || 30, 500));
    const { user } = await getCurrentActor();
    const cacheKey = [
      user?.id ?? 'anonymous',
      user?.user_metadata?.role ?? 'guest',
      Number(year) || new Date().getUTCFullYear(),
      cappedLimit,
      includeResolved ? 'resolved' : 'active',
    ].join(':');
    const now = Date.now();
    const cached = notificationListCache.get(cacheKey);
    if (cached?.data && cached.expiresAt > now) {
      return cloneNotifications(cached.data);
    }

    if (!cached?.promise) {
      const promise = (async () => {
        const notificationScope = await getCurrentNotificationScope(user);
        const latestRouteByCustomerId = await getLatestRouteVersionByCustomerId();
        const [result, customerDerivedNotifications, ispDerivedNotifications] = await Promise.all([
          monitoringApi.getAlerts({ year, latestRouteByCustomerId }),
          getDerivedNotifications(latestRouteByCustomerId),
          getIspDerivedNotifications(),
        ]);
        const alerts = Array.isArray(result) ? result : (result?.alerts ?? []);
        const notifications = [
          ...alerts.map(mapAlertToNotification),
          ...customerDerivedNotifications,
          ...ispDerivedNotifications,
        ]
          .filter((notification) => canReceiveInAppNotification(notificationScope, notification))
          .map((notification) => scopeNotificationTargetForRole(notificationScope, notification));
        const notificationKeys = notifications.map((item) => item.id);
        let stateByKey = new Map();

        if (user?.id && notificationKeys.length > 0) {
          const states = await fetchInChunks(notificationKeys, async (notificationKeyChunk) => {
            const { data, error } = await supabase
              .from('notification_states')
              .select('notification_key,read_at,resolved_at')
              .eq('actor_user_id', user.id)
              .in('notification_key', notificationKeyChunk);

            if (error) throw error;
            return data || [];
          });
          stateByKey = new Map((states || []).map((state) => [state.notification_key, state]));
        }

        return notifications
          .map((notification) => {
            const state = stateByKey.get(notification.id);
            return {
              ...notification,
              readAt: state?.read_at ?? null,
              resolvedAt: state?.resolved_at ?? null,
            };
          })
          .filter((notification) => includeResolved || !notification.resolvedAt)
          .sort((left, right) => {
            const unreadDiff = Number(Boolean(left.readAt)) - Number(Boolean(right.readAt));
            if (unreadDiff !== 0) return unreadDiff;
            const severityDiff = getNotificationSeverityRank(left.severity) - getNotificationSeverityRank(right.severity);
            if (severityDiff !== 0) return severityDiff;
            const dueDateDiff = getNotificationDueTimestamp(left) - getNotificationDueTimestamp(right);
            if (dueDateDiff !== 0) return dueDateDiff;
            const createdAtDiff = getNotificationCreatedTimestamp(left) - getNotificationCreatedTimestamp(right);
            if (createdAtDiff !== 0) return createdAtDiff;
            return String(left.customerName || '').localeCompare(String(right.customerName || ''));
          })
          .slice(0, cappedLimit);
      })();
      notificationListCache.set(cacheKey, { data: null, expiresAt: 0, promise });
    }

    const activeCacheEntry = notificationListCache.get(cacheKey);
    try {
      const notifications = await activeCacheEntry.promise;
      notificationListCache.set(cacheKey, {
        data: notifications,
        expiresAt: Date.now() + NOTIFICATION_LIST_CACHE_TTL_MS,
        promise: null,
      });
      return cloneNotifications(notifications);
    } catch (error) {
      notificationListCache.delete(cacheKey);
      throw error;
    }
  },

  async markRead(notificationKey) {
    const data = await upsertNotificationState(notificationKey, { read_at: new Date().toISOString() });
    clearNotificationListCache();
    return data;
  },

  async markResolved(notificationKey) {
    const now = new Date().toISOString();
    const data = await upsertNotificationState(notificationKey, { read_at: now, resolved_at: now });
    clearNotificationListCache();
    return data;
  },
};

const activityLogsApi = {
  async list({ search = '', entityType = '', entityId = '', action = '', dateFrom = '', dateTo = '', limit = 100 } = {}) {
    let query = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (entityType) query = query.eq('entity_type', entityType);
    if (entityId) query = query.eq('entity_id', entityId);
    if (action) query = query.eq('action', action);
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);
    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`actor_email.ilike.${term},action.ilike.${term},entity_name.ilike.${term},description.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    return createActivityLog(payload);
  },

  async deleteMany(ids = []) {
    const normalizedIds = Array.from(new Set((Array.isArray(ids) ? ids : [])
      .map((id) => Number(id))
      .filter(Number.isFinite)));

    if (normalizedIds.length === 0) {
      return { deletedCount: 0 };
    }

    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .in('id', normalizedIds);

    if (error) throw error;
    return { deletedCount: normalizedIds.length };
  },

  async deleteAll() {
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .not('id', 'is', null);

    if (error) throw error;
    return { success: true };
  },
};

// ============================================================================
// CUSTOMERS API
// ============================================================================

const mapInvoiceFollowUp = (followUp) => ({
  ...followUp,
  invoiceId: followUp.invoiceId ?? followUp.invoice_id ?? null,
  splitOrder: followUp.splitOrder ?? followUp.split_order ?? 1,
  source: followUp.source ?? null,
  triggerCode: followUp.triggerCode ?? followUp.trigger_code ?? null,
  title: followUp.title ?? null,
  description: followUp.description ?? null,
  status: followUp.status ?? null,
  invoiceNumber: followUp.invoiceNumber ?? followUp.invoice_number ?? null,
  invoiceFileUrl: followUp.invoiceFileUrl ?? followUp.invoice_file_url ?? null,
});

const mapContractVersionRenewalFollowUp = (followUp) => ({
  ...followUp,
  versionId: followUp.versionId ?? followUp.version_id ?? null,
  splitOrder: followUp.splitOrder ?? followUp.split_order ?? 1,
  renewalFileUrl: followUp.renewalFileUrl ?? followUp.renewal_file_url ?? null,
  renewalFileName: followUp.renewalFileName ?? followUp.renewal_file_name ?? null,
  responseFileUrl: followUp.responseFileUrl ?? followUp.response_file_url ?? null,
  responseFileName: followUp.responseFileName ?? followUp.response_file_name ?? null,
  responseStatus: followUp.responseStatus ?? followUp.response_decision ?? null,
});

const mapContractVersion = (version) => ({
  ...version,
  contractId: version.contractId ?? version.contract_id ?? null,
  contractNumber: version.contractNumber ?? version.contract_number ?? null,
  versionNumber: version.versionNumber ?? version.version_number ?? 1,
  startDate: version.startDate ?? version.start_date ?? null,
  endDate: version.endDate ?? version.end_date ?? null,
  coreType: version.coreType ?? version.core_type ?? null,
  coreTotal: version.coreTotal ?? version.core_total ?? null,
  sharedCoreRatio: version.sharedCoreRatio ?? version.shared_core_ratio ?? null,
  monthlyAmount: version.monthlyAmount ?? version.monthly_amount ?? null,
  yearlyAmount: version.yearlyAmount ?? version.yearly_amount ?? null,
  bakDocumentId: version.bakDocumentId ?? version.bak_document_id ?? null,
  renewalFollowUps: Array.isArray(version.renewalFollowUps)
    ? version.renewalFollowUps.map(mapContractVersionRenewalFollowUp)
    : [],
});

const mapCustomerContract = (contract) => ({
  ...contract,
  customerId: contract.customerId ?? contract.customer_id ?? null,
  contractNumber: contract.contractNumber ?? contract.contract_number ?? null,
  startDate: contract.startDate ?? contract.start_date ?? null,
  endDate: contract.endDate ?? contract.end_date ?? null,
  coreType: contract.coreType ?? contract.core_type ?? null,
  coreTotal: contract.coreTotal ?? contract.core_total ?? null,
  sharingRatio: contract.sharingRatio ?? contract.sharing_ratio ?? null,
  billingEvery: contract.billingEvery ?? contract.billing_every ?? null,
  billingUnit: contract.billingUnit ?? contract.billing_unit ?? null,
  versions: Array.isArray(contract.versions)
    ? contract.versions.map(mapContractVersion).sort((left, right) => Number(right.versionNumber ?? 0) - Number(left.versionNumber ?? 0))
    : [],
});

const mapCustomerInvoice = (invoice) => ({
  ...invoice,
  customerId: invoice.customerId ?? invoice.customer_id ?? null,
  contractId: invoice.contractId ?? invoice.contract_id ?? null,
  contractVersionId: invoice.contractVersionId ?? invoice.contract_version_id ?? null,
  contractNumber: invoice.contractNumber ?? invoice.contract_number ?? null,
  periodYear: invoice.periodYear ?? invoice.period_year ?? null,
  periodMonth: invoice.periodMonth ?? invoice.period_month ?? null,
  periodStartDate: invoice.periodStartDate ?? invoice.period_start_date ?? null,
  periodEndDate: invoice.periodEndDate ?? invoice.period_end_date ?? null,
  invoiceNumber: invoice.invoiceNumber ?? invoice.invoice_number ?? null,
  invoiceFileUrl: invoice.invoiceFileUrl ?? invoice.invoice_file_url ?? null,
  paymentProofFileUrl: invoice.paymentProofFileUrl ?? invoice.payment_proof_file_url ?? null,
  paidAt: invoice.paidAt ?? invoice.paid_at ?? null,
  dueDate: invoice.dueDate ?? invoice.due_date ?? null,
  scheduleStatus: invoice.scheduleStatus ?? invoice.schedule_status ?? null,
  invoiceFollowUps: Array.isArray(invoice.invoiceFollowUps)
    ? invoice.invoiceFollowUps.map(mapInvoiceFollowUp)
    : [],
});

const mapCustomerDocument = (document) => ({
  ...document,
  customerId: document.customerId ?? document.customer_id ?? null,
  contractId: document.contractId ?? document.contract_id ?? null,
  jenisDokumen: document.jenisDokumen ?? document.jenis_dokumen ?? null,
  nomorDokumen: document.nomorDokumen ?? document.nomor_dokumen ?? null,
  tanggalDokumen: document.tanggalDokumen ?? document.tanggal_dokumen ?? null,
  fileUrl: document.fileUrl ?? document.file_url ?? null,
  fileName: document.fileName ?? document.file_name ?? null,
});

const mapCustomerPaymentRealization = (paymentRealization) => ({
  ...paymentRealization,
  customerId: paymentRealization.customerId ?? paymentRealization.customer_id ?? null,
  contractId: paymentRealization.contractId ?? paymentRealization.contract_id ?? null,
  contractVersionId: paymentRealization.contractVersionId ?? paymentRealization.contract_version_id ?? null,
  periodStartMonth: paymentRealization.periodStartMonth ?? paymentRealization.period_start_month ?? null,
  periodEndMonth: paymentRealization.periodEndMonth ?? paymentRealization.period_end_month ?? null,
  amount: Number(paymentRealization.amount ?? 0),
  paymentFileUrl: paymentRealization.paymentFileUrl ?? paymentRealization.payment_file_url ?? null,
  paymentFileName: paymentRealization.paymentFileName ?? paymentRealization.payment_file_name ?? null,
  notes: paymentRealization.notes ?? null,
});

const mapRoutePoint = (point) => ({
  ...point,
  routeVersionId: point.routeVersionId ?? point.route_version_id ?? null,
  pointType: point.pointType ?? point.point_type ?? null,
  sequenceNumber: point.sequenceNumber ?? point.order_number ?? 0,
});

const mapRouteVersion = (version) => ({
  ...version,
  customerId: version.customerId ?? version.customer_id ?? null,
  versionNumber: version.versionNumber ?? version.version_number ?? 1,
  flowStatus: version.flowStatus ?? version.flow_status ?? null,
  changeNote: version.changeNote ?? version.change_note ?? null,
  points: Array.isArray(version.points)
    ? version.points.map(mapRoutePoint).sort((left, right) => Number(left.sequenceNumber ?? 0) - Number(right.sequenceNumber ?? 0))
    : [],
});

const mapRouteHistory = (history) => ({
  ...history,
  customerId: history.customerId ?? history.customer_id ?? null,
  routeVersionId: history.routeVersionId ?? history.route_version_id ?? null,
  fromStatus: history.fromStatus ?? history.from_status ?? null,
  toStatus: history.toStatus ?? history.to_status ?? null,
  changeNote: history.changeNote ?? history.change_note ?? null,
  snapshotBefore: history.snapshotBefore ?? history.snapshot_before ?? null,
  snapshotAfter: history.snapshotAfter ?? history.snapshot_after ?? null,
  createdAt: history.createdAt ?? history.created_at ?? null,
});

const mapIspEntryPoint = (point) => point ? ({
  ...point,
  ispId: point.ispId ?? point.isp_id ?? null,
  latitude: point.latitude ?? null,
  longitude: point.longitude ?? null,
  description: point.description ?? null,
  capacityNote: point.capacityNote ?? point.capacity_note ?? null,
  fiberType: point.fiberType ?? point.fiber_type ?? null,
  coreCapacity: point.coreCapacity ?? point.core_capacity ?? null,
  isDefault: point.isDefault ?? point.is_default ?? false,
}) : point;

const mapCustomerIspEntryPoint = (selection) => selection ? ({
  ...selection,
  customerId: selection.customerId ?? selection.customer_id ?? null,
  ispId: selection.ispId ?? selection.isp_id ?? null,
  ispEntryPointId: selection.ispEntryPointId ?? selection.isp_entry_point_id ?? null,
  entryPoint: mapIspEntryPoint(selection.entryPoint ?? selection.entry_point ?? selection.ispEntryPoint ?? null),
}) : selection;

const mapIspEntryPointPayload = (point = {}, ispId = null) => {
  const payload = {};
  if (ispId) payload.isp_id = ispId;
  assignIfPresent(payload, point, ['isp_id', 'ispId'], 'isp_id');
  assignIfPresent(payload, point, ['label'], 'label', (value) => String(value || '').trim());
  assignIfPresent(payload, point, ['latitude'], 'latitude', (value) => Number(value));
  assignIfPresent(payload, point, ['longitude'], 'longitude', (value) => Number(value));
  assignIfPresent(payload, point, ['status'], 'status', (value) => value || 'aktif');
  assignIfPresent(payload, point, ['description'], 'description', (value) => value || null);
  assignIfPresent(payload, point, ['capacity_note', 'capacityNote'], 'capacity_note', (value) => value || null);
  assignIfPresent(payload, point, ['fiber_type', 'fiberType'], 'fiber_type', (value) => value || null);
  assignIfPresent(payload, point, ['core_capacity', 'coreCapacity'], 'core_capacity', (value) => value === '' || value === null || value === undefined ? null : Number(value));
  assignIfPresent(payload, point, ['is_default', 'isDefault'], 'is_default', Boolean);
  return payload;
};

const mapCustomerIspEntryPointPayload = (selection = {}, customerId = null) => {
  const payload = {};
  if (customerId) payload.customer_id = customerId;
  assignIfPresent(payload, selection, ['customer_id', 'customerId'], 'customer_id');
  assignIfPresent(payload, selection, ['isp_id', 'ispId'], 'isp_id');
  assignIfPresent(payload, selection, ['isp_entry_point_id', 'ispEntryPointId'], 'isp_entry_point_id');
  assignIfPresent(payload, selection, ['priority'], 'priority', (value) => Math.max(1, Number(value || 1)));
  assignIfPresent(payload, selection, ['role'], 'role', (value) => value || 'utama');
  assignIfPresent(payload, selection, ['notes'], 'notes', (value) => value || null);
  return payload;
};

const getDateValue = (value) => {
  const timestamp = value ? new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};
const getTodayIso = () => new Date().toISOString().slice(0, 10);
const getPeriodStart = (item) => item?.startDate ?? item?.start_date ?? null;
const getPeriodEnd = (item) => item?.endDate ?? item?.end_date ?? null;
const isInPeriod = (item, date) => getPeriodStart(item) <= date && getPeriodEnd(item) >= date;

const sortContractVersions = (versions = []) => [...versions]
  .filter(version => !(version?.deletedAt ?? version?.deleted_at))
  .sort((left, right) => {
    const versionDiff = Number(right.versionNumber ?? right.version_number ?? 0) - Number(left.versionNumber ?? left.version_number ?? 0);
    if (versionDiff !== 0) {
      return versionDiff;
    }

    return getDateValue(right.endDate ?? right.end_date ?? right.startDate ?? right.start_date)
      - getDateValue(left.endDate ?? left.end_date ?? left.startDate ?? left.start_date);
  });

const getLatestContractVersion = (contract) => sortContractVersions(contract?.versions)[0] ?? null;

const getEffectiveContractVersion = (contract, date = getTodayIso()) => (
  sortContractVersions(contract?.versions).find(version => isInPeriod(version, date))
  ?? null
);

const resolveActiveContractPeriodForAlert = (contract, todayIso) => {
  const activeVersion = sortContractVersions(contract?.versions).find((version) => {
    const startDate = String(version?.startDate ?? version?.start_date ?? '').slice(0, 10);
    const endDate = String(version?.endDate ?? version?.end_date ?? '').slice(0, 10);
    return startDate && endDate && startDate <= todayIso && endDate >= todayIso;
  });
  const source = activeVersion ?? contract;
  const endDate = String(source?.endDate ?? source?.end_date ?? '').slice(0, 10);
  const startDate = String(source?.startDate ?? source?.start_date ?? '').slice(0, 10);

  return {
    startDate,
    endDate,
    contractNumber:
      source?.contractNumber
      ?? source?.contract_number
      ?? contract?.contractNumber
      ?? contract?.contract_number
      ?? null,
    versionId: activeVersion?.id ?? null,
  };
};

const getContractLatestPeriodTimestamp = (contract) => {
  const latestVersion = getLatestContractVersion(contract);
  return getDateValue(
    latestVersion?.endDate
      ?? latestVersion?.end_date
      ?? latestVersion?.startDate
      ?? latestVersion?.start_date
      ?? contract?.endDate
      ?? contract?.end_date
      ?? contract?.startDate
      ?? contract?.start_date,
  );
};

const normalizeBillingSchedule = (mode, customEvery, customUnit) => {
  if (mode === '3bulanan') return { billing_every: 3, billing_unit: 'bulan' };
  if (mode === 'custom') {
    return {
      billing_every: Math.max(1, Number(customEvery || 1)),
      billing_unit: customUnit || 'bulan',
    };
  }
  return { billing_every: 1, billing_unit: 'bulan' };
};

const getCustomerCode = () => {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `CUST-${timestamp}`;
};

const assignIfPresent = (payload, source, keys, targetKey, transform = (value) => value) => {
  const key = keys.find((item) => Object.prototype.hasOwnProperty.call(source, item));
  if (!key) return;
  payload[targetKey] = transform(source[key]);
};

const withUpdatedAt = (payload) => ({
  ...payload,
  updated_at: new Date().toISOString(),
});

const mapDocumentPayload = (documentData = {}) => {
  const payload = {};
  assignIfPresent(payload, documentData, ['customer_id', 'customerId'], 'customer_id');
  assignIfPresent(payload, documentData, ['contract_id', 'contractId'], 'contract_id');
  assignIfPresent(payload, documentData, ['contract_version_id', 'contractVersionId'], 'contract_version_id');
  assignIfPresent(payload, documentData, ['contract_number', 'contractNumber'], 'contract_number');
  assignIfPresent(payload, documentData, ['jenis_dokumen', 'jenisDokumen'], 'jenis_dokumen');
  assignIfPresent(payload, documentData, ['nomor_dokumen', 'nomorDokumen'], 'nomor_dokumen');
  assignIfPresent(payload, documentData, ['tanggal_dokumen', 'tanggalDokumen'], 'tanggal_dokumen');
  assignIfPresent(payload, documentData, ['file_url', 'fileUrl'], 'file_url');
  return payload;
};

const normalizeStatusValue = (value) => String(value ?? '').trim().toLowerCase();

const normalizeIspStatusForDb = (value) => {
  const raw = normalizeStatusValue(value);
  if (['aktif', 'beroperasi', 'active'].includes(raw)) return 'aktif';
  if (['expired', 'belum_diperpanjang'].includes(raw)) return 'expired';
  if (['berhenti', 'nonaktif', 'terminated'].includes(raw)) return 'berhenti';
  return raw || null;
};

const normalizeIspContractRowStatusForDb = (value) => {
  const raw = normalizeStatusValue(value);
  if (['aktif', 'beroperasi', 'active'].includes(raw)) return 'aktif';
  if (['expired', 'belum_diperpanjang'].includes(raw)) return 'expired';
  if (['berhenti', 'nonaktif', 'terminated'].includes(raw)) return 'berhenti';
  return raw || null;
};

const mapInvoicePayload = (invoiceData = {}) => {
  const payload = {};
  assignIfPresent(payload, invoiceData, ['customer_id', 'customerId'], 'customer_id');
  assignIfPresent(payload, invoiceData, ['invoice_number', 'invoiceNumber'], 'invoice_number');
  assignIfPresent(payload, invoiceData, ['contract_id', 'contractId'], 'contract_id');
  assignIfPresent(payload, invoiceData, ['contract_version_id', 'contractVersionId'], 'contract_version_id');
  assignIfPresent(payload, invoiceData, ['contract_number', 'contractNumber'], 'contract_number');
  assignIfPresent(payload, invoiceData, ['period_month', 'periodMonth'], 'period_month');
  assignIfPresent(payload, invoiceData, ['period_year', 'periodYear'], 'period_year');
  assignIfPresent(payload, invoiceData, ['period_start_date', 'periodStartDate'], 'period_start_date');
  assignIfPresent(payload, invoiceData, ['period_end_date', 'periodEndDate'], 'period_end_date');
  assignIfPresent(payload, invoiceData, ['due_date', 'dueDate'], 'due_date');
  assignIfPresent(payload, invoiceData, ['amount'], 'amount', (value) => Number(value || 0));
  assignIfPresent(payload, invoiceData, ['status'], 'status');
  assignIfPresent(payload, invoiceData, ['schedule_version', 'scheduleVersion'], 'schedule_version');
  assignIfPresent(payload, invoiceData, ['schedule_status', 'scheduleStatus'], 'schedule_status');
  assignIfPresent(payload, invoiceData, ['document_id', 'documentId'], 'document_id');
  assignIfPresent(payload, invoiceData, ['paid_at', 'paidAt'], 'paid_at');
  assignIfPresent(payload, invoiceData, ['invoice_file_url', 'invoiceFileUrl'], 'invoice_file_url');
  assignIfPresent(payload, invoiceData, ['payment_proof_file_url', 'paymentProofFileUrl'], 'payment_proof_file_url');
  return payload;
};

const mapContractPayload = (contractData = {}) => {
  const payload = {};
  assignIfPresent(payload, contractData, ['customer_id', 'customerId'], 'customer_id');
  assignIfPresent(payload, contractData, ['contract_number', 'contractNumber'], 'contract_number');
  assignIfPresent(payload, contractData, ['start_date', 'startDate'], 'start_date');
  assignIfPresent(payload, contractData, ['end_date', 'endDate'], 'end_date');
  assignIfPresent(payload, contractData, ['core_type', 'coreType'], 'core_type');
  assignIfPresent(payload, contractData, ['core_total', 'coreTotal'], 'core_total', (value) => Number(value || 0));
  assignIfPresent(payload, contractData, ['sharing_ratio', 'sharingRatio'], 'sharing_ratio');
  assignIfPresent(payload, contractData, ['status'], 'status');
  assignIfPresent(payload, contractData, ['billing_every', 'billingEvery'], 'billing_every', (value) => Number(value || 1));
  assignIfPresent(payload, contractData, ['billing_unit', 'billingUnit'], 'billing_unit');
  return payload;
};

const mapContractVersionPayload = (versionData = {}) => {
  const payload = {};
  assignIfPresent(payload, versionData, ['contract_id', 'contractId'], 'contract_id');
  assignIfPresent(payload, versionData, ['customer_id', 'customerId'], 'customer_id');
  assignIfPresent(payload, versionData, ['contract_number', 'contractNumber'], 'contract_number');
  assignIfPresent(payload, versionData, ['version_number', 'versionNumber'], 'version_number');
  assignIfPresent(payload, versionData, ['start_date', 'startDate'], 'start_date');
  assignIfPresent(payload, versionData, ['end_date', 'endDate'], 'end_date');
  assignIfPresent(payload, versionData, ['core_type', 'coreType'], 'core_type');
  assignIfPresent(payload, versionData, ['core_total', 'coreTotal'], 'core_total', (value) => Number(value || 0));
  assignIfPresent(payload, versionData, ['shared_core_ratio', 'sharedCoreRatio'], 'shared_core_ratio');
  assignIfPresent(payload, versionData, ['bak_document_id', 'bakDocumentId'], 'bak_document_id');
  assignIfPresent(payload, versionData, ['renewal_file_url', 'renewalFileUrl'], 'renewal_file_url');
  assignIfPresent(payload, versionData, ['renewal_file_name', 'renewalFileName'], 'renewal_file_name');
  assignIfPresent(payload, versionData, ['response_file_url', 'responseFileUrl'], 'response_file_url');
  assignIfPresent(payload, versionData, ['response_file_name', 'responseFileName'], 'response_file_name');
  assignIfPresent(payload, versionData, ['monthly_amount', 'monthlyAmount'], 'monthly_amount', (value) => Number(value || 0));
  assignIfPresent(payload, versionData, ['yearly_amount', 'yearlyAmount'], 'yearly_amount', (value) => Number(value || 0));
  assignIfPresent(payload, versionData, ['remarks'], 'remarks');
  return payload;
};

const mapPaymentRealizationPayload = (paymentRealizationData = {}) => {
  const payload = {};
  assignIfPresent(payload, paymentRealizationData, ['customer_id', 'customerId'], 'customer_id');
  assignIfPresent(payload, paymentRealizationData, ['contract_id', 'contractId'], 'contract_id');
  assignIfPresent(payload, paymentRealizationData, ['contract_version_id', 'contractVersionId'], 'contract_version_id');
  assignIfPresent(payload, paymentRealizationData, ['period_start_month', 'periodStartMonth'], 'period_start_month');
  assignIfPresent(payload, paymentRealizationData, ['period_end_month', 'periodEndMonth'], 'period_end_month');
  assignIfPresent(payload, paymentRealizationData, ['amount'], 'amount', (value) => Number(value || 0));
  assignIfPresent(payload, paymentRealizationData, ['payment_file_url', 'paymentFileUrl'], 'payment_file_url');
  assignIfPresent(payload, paymentRealizationData, ['payment_file_name', 'paymentFileName'], 'payment_file_name');
  assignIfPresent(payload, paymentRealizationData, ['notes'], 'notes', (value) => value || null);
  return payload;
};

const mapIspContractRowPayload = (rowData = {}) => {
  const payload = {};
  assignIfPresent(payload, rowData, ['isp_id', 'ispId'], 'isp_id');
  assignIfPresent(payload, rowData, ['contract_reference', 'contractReference'], 'contract_reference');
  assignIfPresent(payload, rowData, ['contract_start_date', 'contractStartDate'], 'contract_start_date');
  assignIfPresent(payload, rowData, ['period_start', 'periodStart', 'start_date', 'startDate'], 'period_start');
  assignIfPresent(payload, rowData, ['period_end', 'periodEnd', 'end_date', 'endDate'], 'period_end');
  assignIfPresent(payload, rowData, ['renewal_status', 'renewalStatus'], 'renewal_status');
  assignIfPresent(payload, rowData, ['status'], 'status', normalizeIspContractRowStatusForDb);
  assignIfPresent(payload, rowData, ['bak_file_url', 'bakFileUrl'], 'bak_file_url');
  assignIfPresent(payload, rowData, ['bak_file_name', 'bakFileName'], 'bak_file_name');
  assignIfPresent(payload, rowData, ['renewal_file_url', 'renewalFileUrl'], 'renewal_file_url');
  assignIfPresent(payload, rowData, ['renewal_file_name', 'renewalFileName'], 'renewal_file_name');
  assignIfPresent(payload, rowData, ['response_file_url', 'responseFileUrl'], 'response_file_url');
  assignIfPresent(payload, rowData, ['response_file_name', 'responseFileName'], 'response_file_name');
  assignIfPresent(payload, rowData, ['contract_file_url', 'contractFileUrl'], 'contract_file_url');
  assignIfPresent(payload, rowData, ['contract_file_name', 'contractFileName'], 'contract_file_name');
  return payload;
};

const mapInvoiceFollowUpPayload = (followUpData = {}) => {
  const payload = {};
  assignIfPresent(payload, followUpData, ['invoice_id', 'invoiceId'], 'invoice_id');
  assignIfPresent(payload, followUpData, ['split_order', 'splitOrder'], 'split_order');
  assignIfPresent(payload, followUpData, ['source'], 'source');
  assignIfPresent(payload, followUpData, ['trigger_code', 'triggerCode'], 'trigger_code');
  assignIfPresent(payload, followUpData, ['title'], 'title');
  assignIfPresent(payload, followUpData, ['description'], 'description');
  assignIfPresent(payload, followUpData, ['status'], 'status');
  assignIfPresent(payload, followUpData, ['invoice_number', 'invoiceNumber'], 'invoice_number');
  assignIfPresent(payload, followUpData, ['invoice_file_url', 'invoiceFileUrl'], 'invoice_file_url');
  return payload;
};

const mapRenewalFollowUpPayload = (followUpData = {}) => {
  const payload = {};
  assignIfPresent(payload, followUpData, ['version_id', 'versionId'], 'version_id');
  assignIfPresent(payload, followUpData, ['row_id', 'rowId'], 'row_id');
  assignIfPresent(payload, followUpData, ['split_order', 'splitOrder'], 'split_order');
  assignIfPresent(payload, followUpData, ['source'], 'source');
  assignIfPresent(payload, followUpData, ['trigger_code', 'triggerCode'], 'trigger_code');
  assignIfPresent(payload, followUpData, ['title'], 'title');
  assignIfPresent(payload, followUpData, ['description'], 'description');
  assignIfPresent(payload, followUpData, ['status'], 'status');
  assignIfPresent(payload, followUpData, ['renewal_file_url', 'renewalFileUrl'], 'renewal_file_url');
  assignIfPresent(payload, followUpData, ['renewal_file_name', 'renewalFileName'], 'renewal_file_name');
  assignIfPresent(payload, followUpData, ['response_file_url', 'responseFileUrl'], 'response_file_url');
  assignIfPresent(payload, followUpData, ['response_file_name', 'responseFileName'], 'response_file_name');
  assignIfPresent(payload, followUpData, ['response_decision', 'responseDecision', 'response_status', 'responseStatus'], 'response_decision');
  return payload;
};

const mapRouteHistoryPayload = (customerId, historyData = {}) => ({
  customer_id: customerId,
  operation: historyData.operation ?? historyData.title ?? null,
  note: historyData.note ?? historyData.description ?? null,
  snapshot_before: historyData.snapshot_before ?? historyData.snapshotBefore ?? null,
  snapshot_after: historyData.snapshot_after ?? historyData.snapshotAfter ?? historyData.metadata ?? null,
});

const mapCustomerDetail = (customer) => {
  const contracts = Array.isArray(customer.contracts)
    ? customer.contracts
      .map(mapCustomerContract)
      .filter(contract => !(contract?.deletedAt ?? contract?.deleted_at))
      .sort((left, right) => getContractLatestPeriodTimestamp(right) - getContractLatestPeriodTimestamp(left))
    : [];
  const today = getTodayIso();
  const activeContract = contracts.find(contract => isInPeriod(contract, today))
    ?? contracts.find(contract => getPeriodStart(contract) > today)
    ?? contracts[0]
    ?? null;
  const initialContract = [...contracts].sort((left, right) => getDateValue(left.startDate ?? left.start_date) - getDateValue(right.startDate ?? right.start_date))[0] ?? null;
  const effectiveContractVersion = getEffectiveContractVersion(activeContract, today);
  const latestContractVersion = getLatestContractVersion(activeContract);
  const routeVersions = Array.isArray(customer.routeVersions)
    ? customer.routeVersions.map(mapRouteVersion).sort((left, right) => Number(right.versionNumber ?? 0) - Number(left.versionNumber ?? 0))
    : [];
  const activeRouteVersion = routeVersions[0] ?? null;

  return {
    ...customer,
    rawStatus: customer.status ?? null,
    status: resolveCustomerOperationalStatus(customer, today),
    customerId: customer.customerId ?? customer.customer_code ?? `CUST-${customer.id}`,
    activationFeeAmount: customer.activationFeeAmount ?? customer.activation_fee_amount ?? 0,
    activationFeePaidAt: customer.activationFeePaidAt ?? customer.activation_fee_paid_at ?? null,
    contractStartDate: customer.contract_start_date ?? initialContract?.startDate ?? null,
    contractPeriodStart: effectiveContractVersion?.startDate ?? latestContractVersion?.startDate ?? activeContract?.startDate ?? null,
    contractPeriodEnd: effectiveContractVersion?.endDate ?? latestContractVersion?.endDate ?? activeContract?.endDate ?? null,
    isps: Array.isArray(customer.ispMemberships)
      ? customer.ispMemberships.map(membership => mapIsp(membership.isp)).filter(Boolean)
      : [],
    selectedEntryPoints: Array.isArray(customer.selectedEntryPoints)
      ? customer.selectedEntryPoints
        .filter(selection => !(selection?.deleted_at ?? selection?.deletedAt))
        .map(mapCustomerIspEntryPoint)
        .sort((left, right) => Number(left.priority ?? 1) - Number(right.priority ?? 1))
      : [],
    contracts,
    contractVersions: contracts.flatMap(contract => (
      Array.isArray(contract.versions)
        ? contract.versions.map(version => ({
          ...version,
          contractId: version.contractId ?? contract.id,
          contractNumber: version.contractNumber ?? contract.contractNumber,
          contractStartDate: contract.startDate ?? contract.start_date ?? null,
          contractEndDate: contract.endDate ?? contract.end_date ?? null,
          contractCoreType: contract.coreType ?? contract.core_type ?? null,
          contractCoreTotal: contract.coreTotal ?? contract.core_total ?? null,
          contractSharingRatio: contract.sharingRatio ?? contract.sharing_ratio ?? null,
        }))
        : []
    )),
    invoices: Array.isArray(customer.invoices) ? customer.invoices.map(mapCustomerInvoice) : [],
    paymentRealizations: Array.isArray(customer.paymentRealizations)
      ? customer.paymentRealizations.map(mapCustomerPaymentRealization)
      : [],
    latestDocuments: Array.isArray(customer.documents) ? customer.documents.map(mapCustomerDocument) : [],
    route: {
      activeFlowStatus: activeRouteVersion?.flowStatus ?? 'aktif',
      points: activeRouteVersion?.points ?? [],
      versions: routeVersions,
      history: Array.isArray(customer.routeHistory) ? customer.routeHistory.map(mapRouteHistory) : [],
    },
  };
};

const getCustomerDetailStaleActiveInvoiceIds = (detail) => {
  const invoices = Array.isArray(detail?.invoices) ? detail.invoices : [];
  const contracts = Array.isArray(detail?.contracts) ? detail.contracts : [];
  const contractVersions = Array.isArray(detail?.contractVersions) ? detail.contractVersions : [];
  const todayIso = getTodayIso();

  const contractById = new Map();
  contracts.forEach((contract) => {
    const key = Number(contract?.id);
    if (Number.isFinite(key)) {
      contractById.set(key, contract);
    }
  });

  const versionById = new Map();
  contractVersions.forEach((version) => {
    const key = Number(version?.id);
    if (Number.isFinite(key)) {
      versionById.set(key, version);
    }
  });

  return invoices
    .filter((invoice) => {
      if (String(invoice?.scheduleStatus ?? invoice?.schedule_status ?? "").toLowerCase() === "history") {
        return false;
      }

      const invoiceStatus = String(invoice?.status ?? "").toLowerCase();
      const hasPaidMarker = typeof invoice?.paidAt === "string"
        ? invoice.paidAt.trim().length > 0
        : typeof invoice?.paid_at === "string" && invoice.paid_at.trim().length > 0;
      const hasPaymentProof = typeof invoice?.paymentProofFileUrl === "string"
        ? invoice.paymentProofFileUrl.trim().length > 0
        : typeof invoice?.payment_proof_file_url === "string" && invoice.payment_proof_file_url.trim().length > 0;
      if (invoiceStatus === "lunas" || hasPaidMarker || hasPaymentProof) {
        return false;
      }

      const versionKey = Number(invoice?.contractVersionId ?? invoice?.contract_version_id);
      if (Number.isFinite(versionKey)) {
        const version = versionById.get(versionKey);
        const versionEnd = getPeriodEnd(version);
        return Boolean(versionEnd && versionEnd < todayIso);
      }

      const contractKey = Number(invoice?.contractId ?? invoice?.contract_id);
      if (!Number.isFinite(contractKey)) {
        return false;
      }

      const contract = contractById.get(contractKey);
      if (!contract) {
        return false;
      }

      const contractEnd = getPeriodEnd(contract);
      const contractStatus = String(contract?.status ?? "").toLowerCase();

      return (
        contractStatus === "expired" ||
        contractStatus === "nonaktif" ||
        Boolean(contractEnd && contractEnd < todayIso)
      );
    })
    .map((invoice) => Number(invoice?.id))
    .filter(Number.isFinite);
};

const syncPastDueContractInvoicesToHistory = async (detail) => {
  const staleInvoiceIds = getCustomerDetailStaleActiveInvoiceIds(detail);
  if (staleInvoiceIds.length === 0) {
    return false;
  }

  const { error } = await supabase
    .from('invoices')
    .update(withUpdatedAt({ schedule_status: 'history' }))
    .in('id', staleInvoiceIds);

  if (error) throw error;
  return true;
};

const CUSTOMER_DETAIL_SELECT = `
  id,
  customer_code,
  isp_name,
  name,
  status,
  logo_url,
  activation_fee_amount,
  activation_fee_paid_at,
  contract_start_date,
  notes,
  created_at,
  updated_at,
  deleted_at,
  deleted_by,
  ispMemberships:customer_isp_memberships(
    id,
    customer_id,
    isp_id,
    created_at,
    updated_at,
    isp:isps(
      id,
      name,
      status,
      logo_url,
      contract_reference,
      contract_start_date,
      contract_period_start,
      contract_period_end,
      paket,
      jumlah,
      billing_period_mode,
      billing_custom_every,
      billing_custom_unit,
      activation_fee_amount,
      activation_fee_paid_at,
      created_at,
      updated_at,
      entryPoints:isp_entry_points(
        id,
        isp_id,
        label,
        latitude,
        longitude,
        status,
        description,
        capacity_note,
        fiber_type,
        core_capacity,
        is_default,
        created_at,
        updated_at,
        deleted_at,
        deleted_by
      )
    )
  ),
  selectedEntryPoints:customer_isp_entry_points(
    id,
    customer_id,
    isp_id,
    isp_entry_point_id,
    priority,
    role,
    notes,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    entryPoint:isp_entry_points(
      id,
      isp_id,
      label,
      latitude,
      longitude,
      status,
      description,
      capacity_note,
      fiber_type,
      core_capacity,
      is_default,
      created_at,
      updated_at,
      deleted_at,
      deleted_by
    )
  ),
  contracts(
    id,
    customer_id,
    contract_number,
    start_date,
    end_date,
    core_type,
    core_total,
    sharing_ratio,
    status,
    billing_every,
    billing_unit,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    versions:contract_versions(
      id,
      contract_id,
      customer_id,
      contract_number,
      version_number,
      start_date,
      end_date,
      core_type,
      core_total,
      shared_core_ratio,
      bak_document_id,
      renewal_file_url,
      renewal_file_name,
      response_file_url,
      response_file_name,
      monthly_amount,
      yearly_amount,
      remarks,
      created_at,
      updated_at,
      deleted_at,
      deleted_by,
      renewalFollowUps:contract_version_renewal_follow_ups(
        id,
        version_id,
        split_order,
        source,
        trigger_code,
        title,
        description,
        status,
        renewal_file_url,
        renewal_file_name,
        response_file_url,
        response_file_name,
        response_decision,
        created_at,
        updated_at
      )
    )
  ),
  invoices(
    id,
    customer_id,
    invoice_number,
    contract_id,
    contract_version_id,
    contract_number,
    period_month,
    period_year,
    period_start_date,
    period_end_date,
    due_date,
    amount,
    status,
    schedule_version,
    schedule_status,
    document_id,
    paid_at,
    invoice_file_url,
    payment_proof_file_url,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    invoiceFollowUps:invoice_follow_ups(
      id,
      invoice_id,
      split_order,
      source,
      trigger_code,
      title,
      description,
      status,
      invoice_number,
      invoice_file_url,
      created_at,
      updated_at
    )
  ),
  documents(
    id,
    customer_id,
    contract_id,
    contract_version_id,
    contract_number,
    jenis_dokumen,
    nomor_dokumen,
    tanggal_dokumen,
    file_url,
    created_at,
    deleted_at,
    deleted_by
  ),
  routeVersions:customer_route_versions(
    id,
    customer_id,
    version_number,
    flow_status,
    change_mode,
    change_note,
    based_on_version_id,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    points:customer_route_points(
      id,
      route_version_id,
      order_number,
      path_name,
      point_type,
      note,
      created_at,
      updated_at,
      deleted_at,
      deleted_by
    )
  ),
  routeHistory:customer_route_history(
    id,
    customer_id,
    operation,
    note,
    snapshot_before,
    snapshot_after,
    created_at
  )
`;

export const customersApi = {
  // Get all customers
  async getAll({ limit = LIST_PAGE_SIZE, offset = 0 } = {}) {
    const from = Math.max(0, Number(offset) || 0);
    const to = from + Math.max(1, Number(limit) || LIST_PAGE_SIZE) - 1;

    const { data: customers, error, count } = await supabase
      .from('customers')
      .select(CUSTOMER_DETAIL_SELECT, { count: 'exact' })
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!Array.isArray(customers) || customers.length === 0) {
      return {
        data: [],
        count: count ?? 0,
        limit: Math.max(1, Number(limit) || LIST_PAGE_SIZE),
        offset: from,
        hasMore: false,
      };
    }

    const rows = customers.map(mapCustomerDetail);

    return {
      data: rows,
      count: count ?? rows.length,
      limit: Math.max(1, Number(limit) || LIST_PAGE_SIZE),
      offset: from,
      hasMore: from + rows.length < (count ?? rows.length),
    };
  },

  // Get customer by ID
  async getById(id) {
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_DETAIL_SELECT)
      .eq('id', id)
      .single();

    if (error) throw error;
    const mappedDetail = mapCustomerDetail(data);
    const didSyncStaleInvoices = await syncPastDueContractInvoicesToHistory(mappedDetail);
    const refreshInvoices = async () => {
      try {
        const freshInvoices = await invoicesApi.getByCustomerId(id);
        return Array.isArray(freshInvoices) ? freshInvoices.map(mapCustomerInvoice) : [];
      } catch (invoiceError) {
        console.warn('Failed to refresh customer invoices after detail fetch:', invoiceError);
        return Array.isArray(mappedDetail.invoices) ? mappedDetail.invoices : [];
      }
    };
    const refreshPaymentRealizations = async () => {
      try {
        return await paymentRealizationsApi.getByCustomerId(id);
      } catch (paymentRealizationError) {
        if (isMissingTableError(paymentRealizationError)) {
          return [];
        }
        console.warn('Failed to refresh customer payment realizations after detail fetch:', paymentRealizationError);
        return Array.isArray(mappedDetail.paymentRealizations) ? mappedDetail.paymentRealizations : [];
      }
    };

    if (!didSyncStaleInvoices) {
      return {
        ...mappedDetail,
        invoices: await refreshInvoices(),
        paymentRealizations: await refreshPaymentRealizations(),
      };
    }

    const { data: refreshedData, error: refreshedError } = await supabase
      .from('customers')
      .select(CUSTOMER_DETAIL_SELECT)
      .eq('id', id)
      .single();

    if (refreshedError) throw refreshedError;
    return {
      ...mapCustomerDetail(refreshedData),
      invoices: await refreshInvoices(),
      paymentRealizations: await refreshPaymentRealizations(),
    };
  },

  // Create customer
  async create(customerData) {
    const now = new Date().toISOString();
    const ispIds = Array.isArray(customerData.ispIds)
      ? customerData.ispIds.map((id) => Number(id)).filter(Number.isFinite)
      : [];
    const primaryIspId = ispIds[0] ?? null;

    let ispName = customerData.ispName ?? customerData.isp_name ?? null;
    if (!ispName && primaryIspId) {
      const { data: ispData, error: ispError } = await supabase
        .from('isps')
        .select('name')
        .eq('id', primaryIspId)
        .single();

      if (ispError) throw ispError;
      ispName = ispData?.name ?? null;
    }

    const customerCode = customerData.customer_code ?? customerData.customerCode ?? getCustomerCode();
    const customerPayload = {
      customer_code: customerCode,
      isp_name: ispName || 'Provider Mandiri',
      name: customerData.name,
      status: customerData.status || 'aktif',
      activation_fee_amount: Number(customerData.activationFeeAmount ?? customerData.activation_fee_amount ?? 0),
      contract_start_date: customerData.contractStartDate ?? customerData.contract_start_date ?? customerData.contractPeriodStart ?? null,
      updated_at: now,
    };
    if (customerData.logoUrl) customerPayload.logo_url = customerData.logoUrl;

    const { data, error } = await supabase
      .from('customers')
      .insert(customerPayload)
      .select()
      .single();

    if (error) throw error;

    const rollbackCustomerCreate = async () => {
      await supabase.from('documents').delete().eq('customer_id', data.id);
      await supabase.from('invoices').delete().eq('customer_id', data.id);
      await supabase.from('contract_versions').delete().eq('customer_id', data.id);
      await supabase.from('contracts').delete().eq('customer_id', data.id);
      await supabase.from('customer_isp_memberships').delete().eq('customer_id', data.id);
      await supabase.from('customers').delete().eq('id', data.id);
    };

    try {
      if (ispIds.length > 0) {
        const membershipPayload = ispIds.map((ispId) => ({
          customer_id: data.id,
          isp_id: ispId,
          updated_at: now,
        }));
        const { error: membershipError } = await supabase
          .from('customer_isp_memberships')
          .insert(membershipPayload);

        if (membershipError) throw membershipError;
      }

      if (customerData.contractPeriodStart && customerData.contractPeriodEnd) {
        const isCore = customerData.paket === 'core';
        const billingSchedule = normalizeBillingSchedule(
          customerData.billingPeriodMode,
          customerData.billingCustomEvery,
          customerData.billingCustomUnit,
        );
        const contractNumber = customerData.contractNumber
          ?? customerData.contract_number
          ?? `NO-BAK-${customerCode}-${String(customerData.contractPeriodStart).replaceAll('-', '')}`;

        const { data: contractData, error: contractError } = await supabase
          .from('contracts')
          .insert({
            customer_id: data.id,
            contract_number: contractNumber,
            start_date: customerData.contractPeriodStart,
            end_date: customerData.contractPeriodEnd,
            core_type: isCore ? 'core' : 'sharing_core',
            core_total: isCore ? Math.max(0, Number(customerData.jumlah || 0)) : 0,
            sharing_ratio: isCore ? null : customerData.contractSharingRatio ?? null,
            status: 'aktif',
            ...billingSchedule,
            updated_at: now,
          })
          .select('id, contract_number')
          .single();

        if (contractError) throw contractError;

        const monthlyAmount = Number(customerData.monthlyAmount ?? customerData.monthly_amount ?? 0);
        const yearlyAmount = Number(customerData.yearlyAmount ?? customerData.yearly_amount ?? (monthlyAmount * 12));

        const { data: contractVersionData, error: contractVersionError } = await supabase
          .from('contract_versions')
          .insert(withUpdatedAt({
            contract_id: contractData.id,
            customer_id: data.id,
            contract_number: contractData.contract_number,
            version_number: 1,
            start_date: customerData.contractPeriodStart,
            end_date: customerData.contractPeriodEnd,
            core_type: isCore ? 'core' : 'sharing_core',
            core_total: isCore ? Math.max(0, Number(customerData.jumlah || 0)) : 0,
            shared_core_ratio: isCore ? null : customerData.contractSharingRatio ?? null,
            monthly_amount: Number.isFinite(monthlyAmount) && monthlyAmount > 0 ? monthlyAmount : 0,
            yearly_amount: Number.isFinite(yearlyAmount) && yearlyAmount > 0 ? yearlyAmount : Math.max(0, monthlyAmount * 12),
            remarks: 'Versi awal dibuat otomatis saat lokasi dibuat.',
          }))
          .select('id, monthly_amount')
          .single();

        if (contractVersionError) throw contractVersionError;

        const invoiceRows = buildInvoiceScheduleRows(
          customerData.contractPeriodStart,
          customerData.contractPeriodEnd,
          {
            every: billingSchedule.billing_every,
            unit: billingSchedule.billing_unit,
          },
        );

        if (invoiceRows.length > 0) {
          const invoicePayload = invoiceRows.map((row) => {
            const periodDate = new Date(`${row.periodStartDate}T00:00:00.000Z`);
            const periodYear = Number.isFinite(periodDate.getTime())
              ? periodDate.getUTCFullYear()
              : null;
            const periodMonth = Number.isFinite(periodDate.getTime())
              ? periodDate.getUTCMonth() + 1
              : null;

            return {
              customer_id: data.id,
              contract_id: contractData.id,
              contract_version_id: contractVersionData.id,
              contract_number: contractData.contract_number,
              period_start_date: row.periodStartDate,
              period_end_date: row.periodEndDate,
              period_year: periodYear,
              period_month: periodMonth,
              due_date: resolveInvoiceDueDate(row.periodStartDate),
              amount: resolveBillingCycleInvoiceAmount(contractVersionData.monthly_amount, {
                every: billingSchedule.billing_every,
                unit: billingSchedule.billing_unit,
              }),
              status: 'belum_ditagih',
              schedule_status: 'active',
              updated_at: now,
            };
          });

          const { error: invoiceError } = await supabase
            .from('invoices')
            .insert(invoicePayload);

          if (invoiceError) throw invoiceError;
        }

        if (customerData.bakFileUrl) {
          const { error: bakError } = await supabase.from('documents').insert({
            customer_id: data.id,
            contract_id: contractData.id,
            jenis_dokumen: 'bak',
            nomor_dokumen: contractData.contract_number,
            file_url: customerData.bakFileUrl,
            updated_at: now,
          });
          if (bakError) throw bakError;
        }

        if (customerData.contractFileUrl) {
          const { error: contractFileError } = await supabase.from('documents').insert({
            customer_id: data.id,
            contract_id: contractData.id,
            jenis_dokumen: 'kontrak',
            nomor_dokumen: contractData.contract_number,
            file_url: customerData.contractFileUrl,
            updated_at: now,
          });
          if (contractFileError) throw contractFileError;
        }
      }
    } catch (relatedError) {
      try {
        await rollbackCustomerCreate();
      } catch (rollbackError) {
        console.error('Failed to rollback customer create:', rollbackError);
      }
      throw relatedError;
    }

    await createActivityLog({
      action: 'customer.created',
      entity_type: 'customer',
      entity_id: data.id,
      entity_name: data.name,
      description: `Menambahkan pelanggan baru ${data.name}`,
      metadata: {
        customer_code: data.customer_code,
        isp_name: data.isp_name,
        status: data.status,
      },
    });

    clearNotificationListCache();
    triggerSavedEntityNotificationEmails({
      entityType: 'customer',
      entityId: data.id,
    });
    return data;
  },

  // Update customer
  async update(id, customerData) {
    const { data: previousCustomer, error: previousError } = await supabase
      .from('customers')
      .select('id,name,status,isp_name,customer_code,activation_fee_paid_at')
      .eq('id', id)
      .single();

    if (previousError) throw previousError;

    const updatePayload = {
      updated_at: new Date().toISOString(),
    };
    if (Object.prototype.hasOwnProperty.call(customerData, 'name')) updatePayload.name = customerData.name;
    if (Object.prototype.hasOwnProperty.call(customerData, 'status')) updatePayload.status = customerData.status;
    if (Object.prototype.hasOwnProperty.call(customerData, 'logoUrl')) updatePayload.logo_url = customerData.logoUrl;
    if (Object.prototype.hasOwnProperty.call(customerData, 'activationFeePaidAt')) updatePayload.activation_fee_paid_at = customerData.activationFeePaidAt;
    if (Object.prototype.hasOwnProperty.call(customerData, 'activation_fee_paid_at')) updatePayload.activation_fee_paid_at = customerData.activation_fee_paid_at;

    const { data, error } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const statusChanged = previousCustomer?.status !== data?.status;
    const activationFeePaid = !previousCustomer?.activation_fee_paid_at && Boolean(data?.activation_fee_paid_at);
    const activationFeePaymentReverted = Boolean(previousCustomer?.activation_fee_paid_at) && !data?.activation_fee_paid_at;
    await createActivityLog({
      action: activationFeePaid
        ? 'customer.activation_fee_paid'
        : activationFeePaymentReverted
          ? 'customer.activation_fee_payment_reverted'
          : statusChanged ? 'customer.status_changed' : 'customer.updated',
      entity_type: 'customer',
      entity_id: data.id,
      entity_name: data.name,
      description: activationFeePaid
        ? `Menandai biaya aktivasi pelanggan ${data.name} sudah dibayar`
        : activationFeePaymentReverted
          ? `Membatalkan status lunas biaya aktivasi pelanggan ${data.name}`
          : statusChanged
            ? `Mengubah status pelanggan ${data.name}`
            : `Mengubah data pelanggan ${data.name}`,
      metadata: pickChangedFields(previousCustomer, data, ['name', 'status', 'isp_name', 'customer_code', 'activation_fee_paid_at']),
    });

    clearNotificationListCache();
    return data;
  },

  // Delete customer (soft delete or permanent delete)
  async delete(id, { permanent = false } = {}) {
    const { user } = await getCurrentActor();
    const deletedAt = new Date().toISOString();
    const { data: previousCustomer, error: previousError } = await supabase
      .from('customers')
      .select('id,name,status,isp_name,customer_code')
      .eq('id', id)
      .single();

    if (previousError) throw previousError;

    if (permanent) {
      await deleteCustomerTrashGroup([id]);
      await createActivityLog({
        action: 'customer.deleted',
        entity_type: 'customer',
        entity_id: id,
        entity_name: previousCustomer?.name,
        description: `Menghapus PERMANEN pelanggan ${previousCustomer?.name || id}`,
        metadata: {
          before: previousCustomer,
          deleted_at: deletedAt,
          deleted_by: user?.id ?? null,
          permanent: true,
        },
      });
      clearNotificationListCache();
      return;
    }

    const { error } = await supabase
      .from('customers')
      .update({
        deleted_at: deletedAt,
        deleted_by: user?.id
      })
      .eq('id', id);

    if (error) throw error;

    await createActivityLog({
      action: 'customer.deleted',
      entity_type: 'customer',
      entity_id: id,
      entity_name: previousCustomer?.name,
      description: `Menghapus pelanggan ${previousCustomer?.name || id}`,
      metadata: {
        before: previousCustomer,
        deleted_at: deletedAt,
        deleted_by: user?.id ?? null,
      },
    });

    clearNotificationListCache();
  },
};

// ============================================================================
// ISPs API
// ============================================================================

const mapIspRenewalFollowUp = (followUp) => ({
  ...followUp,
  rowId: followUp.rowId ?? followUp.row_id ?? null,
  splitOrder: followUp.splitOrder ?? followUp.split_order ?? 1,
  renewalFileUrl: followUp.renewalFileUrl ?? followUp.renewal_file_url ?? null,
  renewalFileName: followUp.renewalFileName ?? followUp.renewal_file_name ?? null,
  responseFileUrl: followUp.responseFileUrl ?? followUp.response_file_url ?? null,
  responseFileName: followUp.responseFileName ?? followUp.response_file_name ?? null,
  responseStatus: followUp.responseStatus ?? followUp.response_decision ?? null,
});

const mapIspContractRow = (row) => ({
  ...row,
  contractReference: row.contractReference ?? row.contract_reference ?? row.contract_number ?? null,
  contractFileUrl: row.contractFileUrl ?? row.contract_file_url ?? null,
  contractFileName: row.contractFileName ?? row.contract_file_name ?? null,
  contractStartDate: row.contractStartDate ?? row.contract_start_date ?? null,
  periodStart: row.periodStart ?? row.period_start ?? row.start_date ?? null,
  periodEnd: row.periodEnd ?? row.period_end ?? row.end_date ?? null,
  bakFileUrl: row.bakFileUrl ?? row.bak_file_url ?? null,
  bakFileName: row.bakFileName ?? row.bak_file_name ?? null,
  responseFileUrl: row.responseFileUrl ?? row.response_file_url ?? null,
  responseFileName: row.responseFileName ?? row.response_file_name ?? null,
  renewalStatus: row.renewalStatus ?? row.renewal_status ?? null,
  renewalFollowUps: Array.isArray(row.renewalFollowUps)
    ? row.renewalFollowUps.map(mapIspRenewalFollowUp)
    : [],
});

const mapIspPayload = (ispData = {}) => {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(ispData, 'name')) payload.name = ispData.name;
  if (Object.prototype.hasOwnProperty.call(ispData, 'status')) payload.status = normalizeIspStatusForDb(ispData.status);
  if (Object.prototype.hasOwnProperty.call(ispData, 'logoUrl')) payload.logo_url = ispData.logoUrl;
  if (Object.prototype.hasOwnProperty.call(ispData, 'logo_url')) payload.logo_url = ispData.logo_url;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contractReference')) payload.contract_reference = ispData.contractReference || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contract_reference')) payload.contract_reference = ispData.contract_reference || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contractStartDate')) payload.contract_start_date = ispData.contractStartDate || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contract_start_date')) payload.contract_start_date = ispData.contract_start_date || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contractPeriodStart')) payload.contract_period_start = ispData.contractPeriodStart || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contract_period_start')) payload.contract_period_start = ispData.contract_period_start || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contractPeriodEnd')) payload.contract_period_end = ispData.contractPeriodEnd || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contract_period_end')) payload.contract_period_end = ispData.contract_period_end || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'bakFileDataUrl')) payload.bak_file_url = ispData.bakFileDataUrl || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'bakFileUrl')) payload.bak_file_url = ispData.bakFileUrl || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'bak_file_url')) payload.bak_file_url = ispData.bak_file_url || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'bakFileName')) payload.bak_file_name = ispData.bakFileName || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'bak_file_name')) payload.bak_file_name = ispData.bak_file_name || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contractFileDataUrl')) payload.contract_file_url = ispData.contractFileDataUrl || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contractFileUrl')) payload.contract_file_url = ispData.contractFileUrl || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contract_file_url')) payload.contract_file_url = ispData.contract_file_url || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contractFileName')) payload.contract_file_name = ispData.contractFileName || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'contract_file_name')) payload.contract_file_name = ispData.contract_file_name || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'packageName')) {
    payload.paket = String(ispData.packageName).toLowerCase() === 'core' ? 'core' : 'shared';
  }
  if (Object.prototype.hasOwnProperty.call(ispData, 'paket')) payload.paket = ispData.paket;
  if (Object.prototype.hasOwnProperty.call(ispData, 'packageQuantity')) payload.jumlah = Number(ispData.packageQuantity || 0);
  if (Object.prototype.hasOwnProperty.call(ispData, 'jumlah')) payload.jumlah = ispData.jumlah;
  if (Object.prototype.hasOwnProperty.call(ispData, 'billingPeriodMode')) payload.billing_period_mode = ispData.billingPeriodMode || 'monthly';
  if (Object.prototype.hasOwnProperty.call(ispData, 'billing_period_mode')) payload.billing_period_mode = ispData.billing_period_mode || 'monthly';
  if (Object.prototype.hasOwnProperty.call(ispData, 'activationFeeAmount')) payload.activation_fee_amount = Number(ispData.activationFeeAmount || 0);
  if (Object.prototype.hasOwnProperty.call(ispData, 'activation_fee_amount')) payload.activation_fee_amount = Number(ispData.activation_fee_amount || 0);
  if (Object.prototype.hasOwnProperty.call(ispData, 'userEmail')) payload.user_id = ispData.userEmail || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'user_id')) payload.user_id = ispData.user_id || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'passwordPlain')) payload.password_plain = ispData.passwordPlain || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'userPassword')) payload.password_plain = ispData.userPassword || null;
  if (Object.prototype.hasOwnProperty.call(ispData, 'password_plain')) payload.password_plain = ispData.password_plain || null;

  return payload;
};

const mapIsp = (isp) => isp ? ({
  ...isp,
  logoUrl: isp.logoUrl ?? isp.logo_url ?? null,
  contractReference: isp.contractReference ?? isp.contract_reference ?? null,
  contractStartDate: isp.contractStartDate ?? isp.contract_start_date ?? null,
  contractPeriodStart: isp.contractPeriodStart ?? isp.contract_period_start ?? null,
  contractPeriodEnd: isp.contractPeriodEnd ?? isp.contract_period_end ?? null,
  bakFileUrl: isp.bakFileUrl ?? isp.bak_file_url ?? null,
  bakFileName: isp.bakFileName ?? isp.bak_file_name ?? null,
  contractFileUrl: isp.contractFileUrl ?? isp.contract_file_url ?? null,
  contractFileName: isp.contractFileName ?? isp.contract_file_name ?? null,
  userId: isp.userId ?? isp.user_id ?? null,
  userEmail: isp.userEmail ?? isp.user_id ?? null,
  passwordPlain: isp.passwordPlain ?? isp.password_plain ?? null,
  entryPoints: Array.isArray(isp.entryPoints)
    ? isp.entryPoints.filter(point => !(point?.deleted_at ?? point?.deletedAt)).map(mapIspEntryPoint)
    : Array.isArray(isp.isp_entry_points)
      ? isp.isp_entry_points.filter(point => !(point?.deleted_at ?? point?.deletedAt)).map(mapIspEntryPoint)
      : [],
  accountMappings: Array.isArray(isp.accountMappings)
    ? isp.accountMappings
    : Array.isArray(isp.isp_user_accounts)
      ? isp.isp_user_accounts
	      : [],
}) : isp;

const ISP_DETAIL_SELECT = `
  id,
  name,
  status,
  contract_reference,
  contract_start_date,
  contract_period_start,
  contract_period_end,
  paket,
  jumlah,
  billing_period_mode,
  billing_custom_every,
  billing_custom_unit,
  activation_fee_amount,
  activation_fee_paid_at,
  created_at,
  updated_at,
  logo_url,
  contract_file_name,
  contract_file_url,
  user_id,
  password_plain,
  deleted_at,
  deleted_by,
  bak_file_url,
  bak_file_name,
  entryPoints:isp_entry_points(
    id,
    isp_id,
    label,
    latitude,
    longitude,
    status,
    description,
    capacity_note,
    fiber_type,
    core_capacity,
    is_default,
    created_at,
    updated_at,
    deleted_at,
    deleted_by
  ),
  contractRows:isp_contract_rows(
    id,
    isp_id,
    contract_reference,
    contract_start_date,
    period_start,
    period_end,
    status,
    renewal_status,
    bak_file_url,
    bak_file_name,
    renewal_file_url,
    renewal_file_name,
    response_file_url,
    response_file_name,
    contract_file_name,
    contract_file_url,
    created_at,
    updated_at,
    deleted_at,
    deleted_by,
    renewalFollowUps:isp_renewal_follow_ups(
      id,
      row_id,
      split_order,
      source,
      trigger_code,
      title,
      description,
      status,
      renewal_file_url,
      renewal_file_name,
      response_file_url,
      response_file_name,
      response_decision,
      created_at,
      updated_at
    )
  ),
  accountMappings:isp_user_accounts(
    id,
    auth_user_id,
    isp_id,
    email,
    display_name,
    created_at,
    updated_at
  ),
  customerMemberships:customer_isp_memberships(
    id,
    customer_id,
    isp_id,
    customer:customers(
      id,
      customer_code,
      isp_name,
      name,
      status,
      logo_url,
      activation_fee_amount,
      activation_fee_paid_at,
      contract_start_date,
      notes,
      created_at,
      updated_at,
      deleted_at,
      deleted_by,
      contracts(
        id,
        customer_id,
        contract_number,
        start_date,
        end_date,
        core_type,
        core_total,
        sharing_ratio,
        status,
        billing_every,
        billing_unit,
        created_at,
        updated_at,
        deleted_at,
        deleted_by,
        versions:contract_versions(
          id,
          contract_id,
          customer_id,
          contract_number,
          version_number,
          start_date,
          end_date,
          core_type,
          core_total,
          shared_core_ratio,
          bak_document_id,
          renewal_file_url,
          renewal_file_name,
          response_file_url,
          response_file_name,
          monthly_amount,
          yearly_amount,
          remarks,
          created_at,
          updated_at,
          deleted_at,
          deleted_by,
          renewalFollowUps:contract_version_renewal_follow_ups(
            id,
            version_id,
            split_order,
            source,
            trigger_code,
            title,
            description,
            status,
            renewal_file_url,
            renewal_file_name,
            response_file_url,
            response_file_name,
            response_decision,
            created_at,
            updated_at
          )
        )
      ),
      invoices(
        id,
        customer_id,
        invoice_number,
        contract_id,
        contract_version_id,
        contract_number,
        period_month,
        period_year,
        period_start_date,
        period_end_date,
        due_date,
        amount,
        status,
        schedule_version,
        schedule_status,
        document_id,
        paid_at,
        invoice_file_url,
        payment_proof_file_url,
        created_at,
        updated_at,
        deleted_at,
        deleted_by,
        invoiceFollowUps:invoice_follow_ups(
          id,
          invoice_id,
          split_order,
          source,
          trigger_code,
          title,
          description,
          status,
          invoice_number,
          invoice_file_url,
          created_at,
          updated_at
        )
      ),
      documents(
        id,
        customer_id,
        contract_id,
        contract_version_id,
        contract_number,
        jenis_dokumen,
        nomor_dokumen,
        tanggal_dokumen,
        file_url,
        created_at,
        deleted_at,
        deleted_by
      ),
      routeVersions:customer_route_versions(
        id,
        customer_id,
        version_number,
        flow_status,
        created_at,
        updated_at,
        deleted_at,
        deleted_by,
        points:customer_route_points(
          id,
          route_version_id,
          order_number,
          path_name,
          point_type,
          note,
          created_at,
          updated_at,
          deleted_at,
          deleted_by
        )
      )
    )
  )
`;

export const ispsApi = {
  // Get all ISPs
  async getAll() {
    const now = Date.now();
    if (ispListCache.data && ispListCache.expiresAt > now) {
      return cloneIspList(ispListCache.data);
    }

    if (!ispListCache.promise) {
      ispListCache.promise = (async () => {
        const { data, error } = await supabase
          .from('isps')
          .select(`
            id,
            name,
            status,
            logo_url,
            contract_reference,
            contract_start_date,
            contract_period_start,
            contract_period_end,
            bak_file_name,
            contract_file_name,
            paket,
            jumlah,
            billing_period_mode,
            activation_fee_amount,
            created_at,
            updated_at,
            user_id,
            entryPoints:isp_entry_points(
              id,
              isp_id,
              label,
              latitude,
              longitude,
              status,
              description,
              capacity_note,
              fiber_type,
              core_capacity,
              is_default,
              created_at,
              updated_at,
              deleted_at,
              deleted_by
            )
          `)
          .is('deleted_at', null)
          .order('name', { ascending: true });

        if (error) throw error;

        const mappedData = Array.isArray(data) ? data.map(mapIsp) : [];
        ispListCache.data = mappedData;
        ispListCache.expiresAt = Date.now() + ISP_LIST_CACHE_TTL_MS;
        return mappedData;
      })();
    }

    try {
      return cloneIspList(await ispListCache.promise);
    } catch (error) {
      clearIspListCache();
      throw error;
    } finally {
      ispListCache.promise = null;
    }
  },

  // Get ISP by ID
  async getById(id) {
    const { data, error } = await supabase
      .from('isps')
      .select(ISP_DETAIL_SELECT)
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      ...mapIsp(data),
      contractRows: Array.isArray(data.contractRows)
        ? data.contractRows.map(mapIspContractRow)
        : [],
      tenants: data.customerMemberships?.map(membership => membership.customer).filter(Boolean).map(mapCustomerDetail) || [],
    };
  },

  // Create ISP
  async create(ispData) {
    const payload = {
      billing_period_mode: 'monthly',
      activation_fee_amount: 0,
      ...mapIspPayload(ispData),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('isps')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    let authAccountRequested = false;
    if (ispData.userEmail && ispData.userPassword) {
      authAccountRequested = true;
      const { error: rpcError } = await supabase.rpc('upsert_isp_account', {
        p_isp_id: data.id,
        p_email: ispData.userEmail.trim().toLowerCase(),
        p_password: ispData.userPassword,
        p_name: ispData.name
      });

      if (rpcError) {
        const { error: rollbackError } = await supabase
          .from('isps')
          .delete()
          .eq('id', data.id);

        if (rollbackError) {
          throw new Error(`Gagal membuat akun login ISP (${rpcError.message}) dan rollback ISP gagal (${rollbackError.message}).`);
        }

        throw new Error(rpcError.message || 'Gagal membuat akun login ISP.');
      }
    }

    await createActivityLog({
      action: 'isp.created',
      entity_type: 'isp',
      entity_id: data.id,
      entity_name: data.name,
      description: `Menambahkan ISP ${data.name}`,
      metadata: {
        status: data.status,
        auth_account_requested: authAccountRequested,
        auth_account_email: ispData.userEmail ? ispData.userEmail.trim().toLowerCase() : null,
      },
    });

    clearIspListCache();
    clearNotificationListCache();
    triggerSavedEntityNotificationEmails({
      entityType: 'isp',
      entityId: data.id,
    });
    return data;
  },

  // Update ISP
  async update(id, ispData) {
    const { data: previousIsp, error: previousError } = await supabase
      .from('isps')
      .select('id,name,status,contract_reference,contract_start_date,contract_period_start,contract_period_end,paket,jumlah,billing_period_mode,activation_fee_amount,user_id')
      .eq('id', id)
      .single();

    if (previousError) throw previousError;

    const { data, error } = await supabase
      .from('isps')
      .update({
        ...mapIspPayload(ispData),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    let authAccountSynced = false;
    // Hanya panggil RPC sinkronisasi akun jika ada password baru yang diisi.
    // Jika hanya userEmail yang ada (tanpa password), ini berarti admin hanya
    // mengedit data ISP biasa (nama, status, dll), bukan mengubah akun login.
    // Memanggil RPC tanpa password akan menyebabkan error "Password is required
    // for new accounts" pada ISP yang belum punya auth account.
    if (ispData.userEmail && ispData.userPassword) {
      try {
        const { error: rpcError } = await supabase.rpc('upsert_isp_account', {
          p_isp_id: id,
          p_email: ispData.userEmail.trim().toLowerCase(),
          p_password: ispData.userPassword,
          p_name: ispData.name || data.name
        });
        if (rpcError) {
          console.error('Failed to upsert ISP account via RPC:', rpcError);
          throw new Error('Gagal sinkronisasi akun login: ' + rpcError.message);
        }
        authAccountSynced = true;
      } catch (err) {
        console.error('Failed to upsert ISP account via RPC (exception):', err);
        throw err instanceof Error ? err : new Error('Gagal sinkronisasi akun login.');
      }
    }

    await createActivityLog({
      action: 'isp.updated',
      entity_type: 'isp',
      entity_id: data.id,
      entity_name: data.name,
      description: `Mengubah data ISP ${data.name}`,
      metadata: {
        ...pickChangedFields(previousIsp, data, ['name', 'status', 'contract_reference', 'contract_start_date', 'contract_period_start', 'contract_period_end', 'paket', 'jumlah', 'billing_period_mode', 'activation_fee_amount', 'user_id']),
        auth_account_synced: authAccountSynced,
        auth_account_email: ispData.userEmail ? ispData.userEmail.trim().toLowerCase() : null,
      },
    });

    clearIspListCache();
    clearNotificationListCache();
    return data;
  },

  // Delete ISP (soft delete or permanent delete with cascade to customers)
  async delete(id, { permanent = false } = {}) {
    const { user } = await getCurrentActor();
    const now = new Date().toISOString();
    const { data: previousIsp, error: previousError } = await supabase
      .from('isps')
      .select('id,name,status,user_id')
      .eq('id', id)
      .single();

    if (previousError) throw previousError;

    // Step 1: Get all customers related to this ISP via memberships
    const { data: memberships, error: membershipError } = await supabase
      .from('customer_isp_memberships')
      .select('customer_id')
      .eq('isp_id', id);

    if (membershipError) throw membershipError;

    const customerIds = memberships?.map(m => m.customer_id) || [];

    if (permanent) {
      // Step 2: Permanently delete all related customers
      if (customerIds.length > 0) {
        await deleteCustomerTrashGroup(customerIds);
      }

      // Permanently delete other ISP dependencies: entry points and contract rows
      await deleteRows('isp_entry_points', (query) => query.eq('isp_id', id));
      await deleteRows('isp_contract_rows', (query) => query.eq('isp_id', id));

      // Step 3: Permanently delete the ISP
      const { error } = await supabase
        .from('isps')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await createActivityLog({
        action: 'isp.deleted',
        entity_type: 'isp',
        entity_id: id,
        entity_name: previousIsp?.name,
        description: `Menghapus PERMANEN ISP ${previousIsp?.name || id}`,
        metadata: {
          before: previousIsp,
          deleted_at: now,
          deleted_by: user?.id ?? null,
          deleted_customers_count: customerIds.length,
          deleted_customer_ids: customerIds,
          permanent: true,
        },
      });

      clearIspListCache();
      clearNotificationListCache();
      return { deletedCustomersCount: customerIds.length };
    }

    // Step 2: Soft delete all related customers
    if (customerIds.length > 0) {
      const { error: customersError } = await supabase
        .from('customers')
        .update({ 
          deleted_at: now,
          deleted_by: user?.id 
        })
        .in('id', customerIds);

      if (customersError) throw customersError;
    }

    // Step 3: Soft delete the ISP
    const { error } = await supabase
      .from('isps')
      .update({ 
        deleted_at: now,
        deleted_by: user?.id 
      })
      .eq('id', id);

    if (error) throw error;

    await createActivityLog({
      action: 'isp.deleted',
      entity_type: 'isp',
      entity_id: id,
      entity_name: previousIsp?.name,
      description: `Menghapus ISP ${previousIsp?.name || id}`,
      metadata: {
        before: previousIsp,
        deleted_at: now,
        deleted_by: user?.id ?? null,
        deleted_customers_count: customerIds.length,
        deleted_customer_ids: customerIds,
      },
    });

    clearIspListCache();
    clearNotificationListCache();
    return { deletedCustomersCount: customerIds.length };
  },
};

// ============================================================================
// MONITORING API
// ============================================================================

export const monitoringApi = {
  // Get billing monitoring data
  async getBilling({ year, isp, status }) {
    const requestedYear = Number(year);
    const selectedYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear
      : new Date().getUTCFullYear();

    const { data: customers, error } = await supabase
      .from('customers')
      .select(`
        id,
        customer_code,
        isp_name,
        name,
        status,
        activation_fee_amount,
        activation_fee_paid_at,
        contract_start_date,
        notes,
        ispMemberships:customer_isp_memberships(
          isp:isps(id,name,status,logo_url)
        )
      `)
      .is('deleted_at', null)
      .not('status', 'in', '(berhenti,nonaktif)');

    if (error) throw error;
    if (!Array.isArray(customers) || customers.length === 0) {
      return {
        year: String(selectedYear),
        appliedFilters: {
          isp: isp || null,
          status: status || null,
        },
        summary: {
          lunas: 0,
          belum_bayar: 0,
          terlambat: 0,
          belum_ditagih: 0,
        },
        rows: [],
      };
    }

    const customerIds = customers.map((customer) => customer.id).filter(Boolean);

    const loadPaymentRealizations = async () => {
      try {
        return await fetchInChunks(customerIds, async (ids) => {
          const { data, error: paymentRealizationsError } = await supabase
            .from('customer_payment_realizations')
            .select('id, customer_id, contract_id, contract_version_id, period_start_month, period_end_month, amount')
            .in('customer_id', ids);

          if (paymentRealizationsError) throw paymentRealizationsError;
          return data || [];
        });
      } catch (paymentRealizationsError) {
        if (isMissingTableError(paymentRealizationsError)) {
          return [];
        }
        throw paymentRealizationsError;
      }
    };

    const [contracts, invoices, routeVersions, paymentRealizations] = await Promise.all([
      fetchInChunks(customerIds, async (ids) => {
        const { data, error: contractsError } = await supabase
          .from('contracts')
          .select(`
            id,
            customer_id,
            contract_number,
            start_date,
            end_date,
            core_type,
            core_total,
            sharing_ratio,
            billing_every,
            billing_unit,
            status,
            versions:contract_versions(
              id,
              contract_number,
              version_number,
              start_date,
              end_date,
              core_type,
              core_total,
              shared_core_ratio,
              monthly_amount,
              yearly_amount,
              remarks,
              deleted_at
            )
          `)
          .in('customer_id', ids);

        if (contractsError) throw contractsError;
        return data || [];
      }),
      fetchInChunks(customerIds, async (ids) => {
        const { data, error: invoicesError } = await supabase
          .from('invoices')
          .select('id, customer_id, invoice_number, contract_id, contract_version_id, period_year, period_month, period_start_date, period_end_date, due_date, amount, status, schedule_status, paid_at, updated_at, created_at')
          .in('period_year', [selectedYear, selectedYear - 1])
          .in('customer_id', ids);

        if (invoicesError) throw invoicesError;
        return data || [];
      }),
      fetchInChunks(customerIds, async (ids) => {
        const { data, error: routesError } = await supabase
          .from('customer_route_versions')
          .select('id, customer_id, version_number, flow_status, created_at')
          .in('customer_id', ids);

        if (routesError) throw routesError;
        return data || [];
      }),
      loadPaymentRealizations(),
    ]);

    const contractsByCustomerId = new Map();
    contracts.forEach((contract) => {
      const list = contractsByCustomerId.get(contract.customer_id) || [];
      list.push(contract);
      contractsByCustomerId.set(contract.customer_id, list);
    });

    const invoicesByCustomerId = new Map();
    invoices.forEach((invoice) => {
      const list = invoicesByCustomerId.get(invoice.customer_id) || [];
      list.push(invoice);
      invoicesByCustomerId.set(invoice.customer_id, list);
    });

    const getInvoiceKey = (contractId, periodYear, periodMonth) => `${contractId ?? 'none'}:${Number(periodYear)}:${Number(periodMonth)}`;
    const getInvoiceDisplayMonthIndex = (invoice) => (
      (Number(invoice?.displayYear ?? invoice?.period_year ?? 0) * 12)
      + Number(invoice?.displayMonth ?? invoice?.period_month ?? 0)
      - 1
    );
    const getBillingCycleMonths = (contract) => {
      const every = Number(contract?.billing_every ?? 1);
      const unit = String(contract?.billing_unit ?? 'bulan').toLowerCase();
      if (!Number.isFinite(every) || every <= 1) return 1;
      if (unit === 'tahun') return Math.round(every) * 12;
      if (unit === 'bulan') return Math.round(every);
      return 1;
    };
    const isPaidInvoice = (invoice) => String(invoice?.status ?? '').toLowerCase() === 'lunas';
    const getDateValue = (value) => {
      const timestamp = value ? new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`).getTime() : 0;
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    const normalizeInvoiceStatus = (value) => String(value ?? '').trim().toLowerCase();
    const getInvoiceStatusPriority = (value) => {
      switch (normalizeInvoiceStatus(value)) {
        case 'lunas':
          return 4;
        case 'terlambat':
          return 3;
        case 'belum_bayar':
          return 2;
        case 'belum_ditagih':
          return 1;
        case 'di_luar_periode':
          return 0;
        default:
          return -1;
      }
    };
    const compareInvoicePreference = (left, right) => {
      const leftStatusPriority = getInvoiceStatusPriority(left?.status);
      const rightStatusPriority = getInvoiceStatusPriority(right?.status);
      if (leftStatusPriority !== rightStatusPriority) {
        return leftStatusPriority - rightStatusPriority;
      }

      const leftPaidPriority = String(left?.paid_at ?? '').trim() ? 1 : 0;
      const rightPaidPriority = String(right?.paid_at ?? '').trim() ? 1 : 0;
      if (leftPaidPriority !== rightPaidPriority) {
        return leftPaidPriority - rightPaidPriority;
      }

      const leftSchedulePriority = normalizeInvoiceStatus(left?.schedule_status) === 'history' ? 1 : 0;
      const rightSchedulePriority = normalizeInvoiceStatus(right?.schedule_status) === 'history' ? 1 : 0;
      if (leftSchedulePriority !== rightSchedulePriority) {
        return leftSchedulePriority - rightSchedulePriority;
      }

      const leftUpdatedAt = getDateValue(left?.updated_at ?? left?.paid_at ?? left?.created_at);
      const rightUpdatedAt = getDateValue(right?.updated_at ?? right?.paid_at ?? right?.created_at);
      return leftUpdatedAt - rightUpdatedAt;
    };

    const invoiceLookupByCustomerId = new Map();
    invoicesByCustomerId.forEach((customerInvoices, customerId) => {
      const lookup = new Map();
      customerInvoices.forEach((invoice) => {
        const displayDateValue = invoice.due_date || (invoice.period_start_date ? resolveInvoiceDueMonthIsoDate(invoice.period_start_date) : null) || invoice.period_start_date || null;
        const displayDate = displayDateValue ? new Date(`${String(displayDateValue).slice(0, 10)}T00:00:00.000Z`) : null;
        const displayYear = displayDate && Number.isFinite(displayDate.getTime())
          ? displayDate.getUTCFullYear()
          : Number(invoice.period_year ?? selectedYear);
        const displayMonth = displayDate && Number.isFinite(displayDate.getTime())
          ? displayDate.getUTCMonth() + 1
          : Number(invoice.period_month ?? 0);

        const key = getInvoiceKey(invoice.contract_id ?? null, displayYear, displayMonth);
        const nextInvoice = {
          ...invoice,
          displayYear,
          displayMonth,
          displayDate: displayDateValue || null,
        };
        const currentInvoice = lookup.get(key);
        if (!currentInvoice || compareInvoicePreference(nextInvoice, currentInvoice) > 0) {
          lookup.set(key, nextInvoice);
        }
      });
      invoiceLookupByCustomerId.set(customerId, lookup);
    });

    const routeVersionsByCustomerId = new Map();
    routeVersions.forEach((routeVersion) => {
      const list = routeVersionsByCustomerId.get(routeVersion.customer_id) || [];
      list.push(routeVersion);
      routeVersionsByCustomerId.set(routeVersion.customer_id, list);
    });
    const paymentRealizationsByCustomerId = new Map();
    paymentRealizations.forEach((paymentRealization) => {
      const list = paymentRealizationsByCustomerId.get(paymentRealization.customer_id) || [];
      list.push(mapCustomerPaymentRealization(paymentRealization));
      paymentRealizationsByCustomerId.set(paymentRealization.customer_id, list);
    });

    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = new Date().getUTCMonth() + 1;
    const selectedYearStart = `${selectedYear}-01-01`;
    const selectedYearEnd = `${selectedYear}-12-31`;

    const sortVersions = (versions = []) => [...versions].sort((left, right) => {
      const versionDiff = Number(right.version_number ?? 0) - Number(left.version_number ?? 0);
      if (versionDiff !== 0) return versionDiff;
      return getDateValue(right.end_date ?? right.start_date) - getDateValue(left.end_date ?? left.start_date);
    });
    const isInPeriod = (item, date) => item?.start_date <= date && item?.end_date >= date;
    const getLatestVersion = (contract) => sortVersions(contract?.versions)[0] ?? null;
    const getEffectiveVersion = (contract, date = today) => (
      sortVersions(contract?.versions).find(version => isInPeriod(version, date))
      ?? getLatestVersion(contract)
    );

    const getContractRange = (contract) => {
      let start = contract.start_date;
      let end = contract.end_date;
      const versions = contract.versions || [];
      versions.forEach(v => {
        if (v.deleted_at) return;
        if (v.start_date && (!start || v.start_date < start)) start = v.start_date;
        if (v.end_date && (!end || v.end_date > end)) end = v.end_date;
      });
      return { start, end };
    };

    const getCurrentContract = (contracts = []) => {
      const sortedContracts = [...contracts].sort((left, right) => {
        const leftStart = getDateValue(left.start_date);
        const rightStart = getDateValue(right.start_date);
        if (rightStart !== leftStart) return rightStart - leftStart;
        return getDateValue(right.end_date) - getDateValue(left.end_date);
      });

      const yearStart = `${selectedYear}-01-01`;
      const yearEnd = `${selectedYear}-12-31`;

      return sortedContracts.find(contract => {
        const range = getContractRange(contract);
        return range.start <= yearEnd && range.end >= yearStart;
      })
        ?? sortedContracts.find(contract => {
          const range = getContractRange(contract);
          return range.start <= today && range.end >= today;
        })
        ?? sortedContracts.find(contract => {
          const range = getContractRange(contract);
          return range.start > today;
        })
        ?? sortedContracts[0]
        ?? null;
    };

    const getContractDueMonthRange = (contractObject) => {
      if (!contractObject?.start_date || !contractObject?.end_date) return null;
      const start = new Date(`${contractObject.start_date.slice(0, 10)}T00:00:00.000Z`);
      const end = new Date(`${contractObject.end_date.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

      const firstDueIso = resolveInvoiceDueMonthIsoDate(contractObject.start_date);
      const billingMonths = getBillingCycleMonths(contractObject);
      
      let lastStart = new Date(start.getTime());
      let nextStart = new Date(start.getTime());
      
      for (let i = 0; i < 1200; i++) {
        nextStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (i + 1) * billingMonths, start.getUTCDate()));
        if (nextStart > end) {
          break;
        }
        lastStart = new Date(nextStart.getTime());
      }

      const lastDueIso = resolveInvoiceDueMonthIsoDate(lastStart.toISOString().slice(0, 10));
      return { firstDueIso, lastDueIso };
    };

    const isMonthInsideContract = (contract, month) => {
      if (!contract?.start_date || !contract?.end_date) return false;
      const targetDate = `${selectedYear}-${String(month).padStart(2, '0')}-01`;
      
      const checkInside = (contractObj) => {
        const range = getContractDueMonthRange(contractObj);
        if (!range || !range.firstDueIso || !range.lastDueIso) return false;
        return targetDate >= range.firstDueIso && targetDate <= range.lastDueIso;
      };

      if (checkInside(contract)) return true;

      const versions = contract.versions || [];
      return versions.some(version => {
        if (version.deleted_at) return false;
        return checkInside(version);
      });
    };

    const getLatestRouteVersion = (customerRouteVersions = []) => (
      [...customerRouteVersions].sort((left, right) => {
        const versionDiff = Number(right.version_number ?? 0) - Number(left.version_number ?? 0);
        if (versionDiff !== 0) return versionDiff;
        return getDateValue(right.created_at) - getDateValue(left.created_at);
      })[0] ?? null
    );
    const paymentRealizationOverlapsSelectedYear = (paymentRealization) => {
      const startDate = String(paymentRealization?.periodStartMonth ?? paymentRealization?.period_start_month ?? '').slice(0, 10);
      const endDate = String(paymentRealization?.periodEndMonth ?? paymentRealization?.period_end_month ?? '').slice(0, 10);
      if (!startDate || !endDate) return false;
      return startDate <= selectedYearEnd && endDate >= selectedYearStart;
    };
    const getPaymentRealizationAmount = (customerId, currentContract) => {
      const rows = paymentRealizationsByCustomerId.get(customerId) || [];
      if (rows.length === 0) return 0;

      const currentContractId = Number(currentContract?.id);
      return rows.reduce((total, paymentRealization) => {
        if (!paymentRealizationOverlapsSelectedYear(paymentRealization)) {
          return total;
        }

        const amount = Number(paymentRealization?.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          return total;
        }

        if (Number.isFinite(currentContractId) && currentContractId > 0) {
          const paymentContractId = Number(paymentRealization?.contractId ?? paymentRealization?.contract_id);
          return paymentContractId === currentContractId ? total + amount : total;
        }

        return total + amount;
      }, 0);
    };

    // Transform data to match backend format
    const rows = customers.map(customer => {
      const customerIsps = customer.ispMemberships?.map(m => m.isp).filter(Boolean) || [];
      const ispNames = customerIsps.map(isp => isp.name).filter(Boolean);
      const primaryIspId = customerIsps[0]?.id ?? null;
      const customerContracts = contractsByCustomerId.get(customer.id) || [];
      const invoiceLookup = invoiceLookupByCustomerId.get(customer.id) || new Map();
      const latestRouteVersion = getLatestRouteVersion(routeVersionsByCustomerId.get(customer.id) || []);
      const currentContract = getCurrentContract(customerContracts);
      const effectiveVersionDate = selectedYear === new Date().getUTCFullYear()
        ? today
        : `${selectedYear}-12-31`;
      const effectiveVersion = getEffectiveVersion(currentContract, effectiveVersionDate);
      const currentMonthInvoice = invoiceLookup.get(getInvoiceKey(currentContract?.id ?? null, selectedYear, currentMonth)) || null;
      const currentContractInvoices = [...invoiceLookup.values()]
        .filter(invoice => Number(invoice.contract_id ?? 0) === Number(currentContract?.id ?? 0))
        .sort((left, right) => getInvoiceDisplayMonthIndex(left) - getInvoiceDisplayMonthIndex(right));

      // Build months array (12 months)
      const months = Array.from({ length: 12 }, (_, monthIndex) => {
        const month = monthIndex + 1;
        if (currentContract && !isMonthInsideContract(currentContract, month)) {
          return { status: 'di_luar_periode', invoice: null };
        }
        const invoice = invoiceLookup.get(getInvoiceKey(currentContract?.id ?? null, selectedYear, month)) || null;
        return {
          status: invoice ? invoice.status : 'belum_ditagih',
          invoice,
        };
      });

      const billingCycleMonths = getBillingCycleMonths(currentContract);
      if (billingCycleMonths > 1 && currentContractInvoices.length > 0) {
        currentContractInvoices.forEach((invoice, invoiceIndex) => {
          if (!isPaidInvoice(invoice)) return;

          const invoiceMonthIndex = getInvoiceDisplayMonthIndex(invoice);
          const previousInvoice = currentContractInvoices[invoiceIndex - 1] || null;
          const previousMonthIndex = previousInvoice
            ? getInvoiceDisplayMonthIndex(previousInvoice)
            : invoiceMonthIndex - 1;
          const coverageStartMonthIndex = previousMonthIndex + 1;
          const coverageEndMonthIndex = invoiceMonthIndex;

          for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
            const selectedMonthIndex = (selectedYear * 12) + monthIndex;
            if (selectedMonthIndex < coverageStartMonthIndex || selectedMonthIndex > coverageEndMonthIndex) {
              continue;
            }
            if (months[monthIndex]?.status === 'di_luar_periode') {
              continue;
            }
            months[monthIndex] = {
              ...months[monthIndex],
              status: 'lunas',
              invoice: months[monthIndex]?.invoice || invoice,
              coveredByInvoice: invoice,
            };
          }
        });
      }

      return {
        customerId: customer.id,
        customerCode: customer.customer_code,
        ispId: Number.isFinite(Number(primaryIspId)) ? Number(primaryIspId) : null,
        ispName: ispNames.length > 0 ? ispNames.join(', ') : customer.isp_name || '-',
        ispNames,
        ispContractStart: customer.contract_start_date || null,
        customerName: customer.name,
        customerStatus: customer.status,
        contractNumber: currentContract?.contract_number?.startsWith('NO-BAK-') ? '-' : currentContract?.contract_number || null,
        currentInvoiceNumber: currentMonthInvoice?.invoice_number || null,
        currentInvoiceDueDate: currentMonthInvoice?.due_date || null,
        routeStatus: latestRouteVersion?.flow_status || null,
        activationFeeAmount: Number(customer.activation_fee_amount || 0),
        activationFeePaidAt: customer.activation_fee_paid_at,
        contractStart: effectiveVersion?.start_date || currentContract?.start_date || null,
        contractEnd: effectiveVersion?.end_date || currentContract?.end_date || null,
        contractPeriodStart: currentContract?.start_date || null,
        contractPeriodEnd: currentContract?.end_date || null,
        runningPeriodStart: effectiveVersion?.start_date || currentContract?.start_date || null,
        runningPeriodEnd: effectiveVersion?.end_date || currentContract?.end_date || null,
        coreType: effectiveVersion?.core_type || currentContract?.core_type || null,
        coreTotal: effectiveVersion?.core_total ?? currentContract?.core_total ?? null,
        sharingRatio: effectiveVersion?.shared_core_ratio || currentContract?.sharing_ratio || null,
        monthlyAmount: Number(effectiveVersion?.monthly_amount || 0),
        yearlyAmount: Number(effectiveVersion?.yearly_amount || 0),
        paymentRealizationAmount: getPaymentRealizationAmount(customer.id, currentContract),
        notes: customer.notes || null,
        contractRemarks: effectiveVersion?.remarks || null,
        months,
      };
    });

    // Apply filters
    let filteredRows = rows;

    if (isp) {
      const normalizedIspFilter = isp.trim().toLowerCase();
      filteredRows = filteredRows.filter(row =>
        [row.ispName, ...(row.ispNames || [])]
          .join(' ')
          .toLowerCase()
          .includes(normalizedIspFilter)
      );
    }

    if (status) {
      filteredRows = filteredRows.filter(row => row.months.some((entry) => entry?.status === status));
    }

    // Build summary
    const summary = {
      lunas: 0,
      belum_bayar: 0,
      terlambat: 0,
      belum_ditagih: 0,
    };

    filteredRows.forEach(row => {
      row.months.forEach((monthEntry) => {
        const monthStatus = monthEntry?.status;
        if (summary[monthStatus] !== undefined) {
          summary[monthStatus] += 1;
        }
      });
    });

    return {
      year: String(selectedYear),
      appliedFilters: {
        isp: isp || null,
        status: status || null,
      },
      summary,
      rows: filteredRows,
    };
  },

  async getHistory({ year, isp }) {
    const requestedYear = Number(year);
    const selectedYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear
      : new Date().getUTCFullYear();
    const yearStart = `${selectedYear}-01-01`;
    const yearEnd = `${selectedYear}-12-31`;
    const today = new Date().toISOString().slice(0, 10);

    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, customer_code, isp_name, name, status, contract_start_date')
      .eq('status', 'berhenti')
      .is('deleted_at', null);

    if (error) throw error;

    if (!Array.isArray(customers) || customers.length === 0) {
      return { year: String(selectedYear), rows: [] };
    }

    const customerIds = customers.map((customer) => customer.id).filter(Boolean);

    const [memberships, contracts, versions, invoices, routeVersions] = await Promise.all([
      fetchInChunks(customerIds, async (ids) => {
        const { data, error: membershipsError } = await supabase
          .from('customer_isp_memberships')
          .select('customer_id, isp:isps(id,name,status,logo_url)')
          .in('customer_id', ids);
        if (membershipsError) throw membershipsError;
        return data || [];
      }),
      fetchInChunks(customerIds, async (ids) => {
        const { data, error: contractsError } = await supabase
          .from('contracts')
          .select('id, customer_id, contract_number, start_date, end_date, core_type, core_total, sharing_ratio, status')
          .in('customer_id', ids);
        if (contractsError) throw contractsError;
        return data || [];
      }),
      fetchInChunks(customerIds, async (ids) => {
        const { data, error: versionsError } = await supabase
          .from('contract_versions')
          .select('id, contract_id, version_number, start_date, end_date, core_type, core_total, shared_core_ratio, monthly_amount, yearly_amount, remarks')
          .in('customer_id', ids);
        if (versionsError) throw versionsError;
        return data || [];
      }),
      fetchInChunks(customerIds, async (ids) => {
        const { data, error: invoicesError } = await supabase
          .from('invoices')
          .select('id, customer_id, invoice_number, contract_id, period_year, period_month, period_start_date, period_end_date, amount, status, schedule_status')
          .in('customer_id', ids)
          .eq('schedule_status', 'active');
        if (invoicesError) throw invoicesError;
        return data || [];
      }),
      fetchInChunks(customerIds, async (ids) => {
        const { data, error: routesError } = await supabase
          .from('customer_route_versions')
          .select('customer_id, version_number, flow_status, created_at')
          .in('customer_id', ids);
        if (routesError) throw routesError;
        return data || [];
      }),
    ]);

    const membershipsByCustomerId = new Map();
    memberships.forEach((membership) => {
      const list = membershipsByCustomerId.get(membership.customer_id) || [];
      list.push(membership);
      membershipsByCustomerId.set(membership.customer_id, list);
    });

    const contractsByCustomerId = new Map();
    contracts.forEach((contract) => {
      const list = contractsByCustomerId.get(contract.customer_id) || [];
      list.push({ ...contract, versions: [] });
      contractsByCustomerId.set(contract.customer_id, list);
    });

    const contractsById = new Map();
    contractsByCustomerId.forEach((contractList) => {
      contractList.forEach((contract) => contractsById.set(contract.id, contract));
    });

    versions.forEach((version) => {
      const contract = contractsById.get(version.contract_id);
      if (!contract) return;
      contract.versions.push(version);
    });

    const invoicesByCustomerId = new Map();
    invoices.forEach((invoice) => {
      const list = invoicesByCustomerId.get(invoice.customer_id) || [];
      list.push(invoice);
      invoicesByCustomerId.set(invoice.customer_id, list);
    });

    const routeVersionsByCustomerId = new Map();
    routeVersions.forEach((routeVersion) => {
      const list = routeVersionsByCustomerId.get(routeVersion.customer_id) || [];
      list.push(routeVersion);
      routeVersionsByCustomerId.set(routeVersion.customer_id, list);
    });

    const getDateValue = (value) => {
      const timestamp = value ? new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`).getTime() : 0;
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    const getLatestVersion = (contract) => (
      Array.isArray(contract?.versions)
        ? [...contract.versions].sort((left, right) => {
          const versionDiff = Number(right.version_number ?? 0) - Number(left.version_number ?? 0);
          if (versionDiff !== 0) return versionDiff;
          return getDateValue(right.end_date ?? right.start_date) - getDateValue(left.end_date ?? left.start_date);
        })[0]
        : null
    );

    const getLatestRouteVersion = (customerRouteVersions = []) => (
      Array.isArray(customerRouteVersions)
        ? [...customerRouteVersions].sort((left, right) => {
          const versionDiff = Number(right.version_number ?? 0) - Number(left.version_number ?? 0);
          if (versionDiff !== 0) return versionDiff;
          return getDateValue(right.created_at) - getDateValue(left.created_at);
        })[0]
        : null
    );

    const rows = (customers || []).flatMap(customer => {
      const customerIsps = (membershipsByCustomerId.get(customer.id) || []).map((membership) => membership.isp).filter(Boolean);
      const ispNames = customerIsps.map(item => item.name).filter(Boolean);
      const primaryIspId = customerIsps[0]?.id ?? null;
      const ispName = ispNames.length > 0 ? ispNames.join(', ') : customer.isp_name || '-';
      const latestRouteVersion = getLatestRouteVersion(routeVersionsByCustomerId.get(customer.id) || []);
      const customerContracts = contractsByCustomerId.get(customer.id) || [];
      const customerInvoices = invoicesByCustomerId.get(customer.id) || [];
      const baseRow = {
        customerId: customer.id,
        customerCode: customer.customer_code,
        customerName: customer.name,
        customerStatus: customer.status,
        routeStatus: latestRouteVersion?.flow_status || null,
        ispId: Number.isFinite(Number(primaryIspId)) ? Number(primaryIspId) : null,
        ispName,
        ispNames,
        ispContractStart: customer.contract_start_date || null,
      };
      const contractsInHistory = customerContracts
        .filter(contract => contract.start_date <= yearEnd && contract.end_date >= yearStart && contract.end_date < today);

      if (contractsInHistory.length === 0) {
        const sortedInvoices = [...customerInvoices].sort((left, right) => {
            const yearDiff = Number(right.period_year ?? 0) - Number(left.period_year ?? 0);
            if (yearDiff !== 0) return yearDiff;
            return Number(right.period_month ?? 0) - Number(left.period_month ?? 0);
          });
        const lastInvoice = sortedInvoices[0];
        const selectedYearInvoices = sortedInvoices.filter(invoice => Number(invoice.period_year) === selectedYear);

        return [{
          ...baseRow,
          contractId: null,
          contractNumber: null,
          lastInvoiceNumber: lastInvoice?.invoice_number || null,
          contractStart: customer.contract_start_date || null,
          contractEnd: null,
          coreType: null,
          coreTotal: null,
          sharingRatio: null,
          monthlyAmount: 0,
          yearlyAmount: 0,
          invoiceCount: sortedInvoices.length,
          selectedYearInvoiceCount: selectedYearInvoices.length,
          lastInvoiceStatus: lastInvoice?.status || null,
        }];
      }

      return contractsInHistory.map(contract => {
        const latestVersion = getLatestVersion(contract);
        const contractInvoices = customerInvoices
          .filter(invoice => invoice.contract_id === contract.id && invoice.schedule_status === 'active')
          .sort((left, right) => {
            const yearDiff = Number(right.period_year ?? 0) - Number(left.period_year ?? 0);
            if (yearDiff !== 0) return yearDiff;
            return Number(right.period_month ?? 0) - Number(left.period_month ?? 0);
          });
        const lastInvoice = contractInvoices[0];
        const selectedYearInvoices = contractInvoices.filter(invoice => Number(invoice.period_year) === selectedYear);

        return {
          ...baseRow,
          contractId: contract.id,
          contractNumber: contract.contract_number?.startsWith('NO-BAK-') ? '-' : contract.contract_number || null,
          lastInvoiceNumber: lastInvoice?.invoice_number || null,
          contractStart: latestVersion?.start_date || contract.start_date || null,
          contractEnd: latestVersion?.end_date || contract.end_date || null,
          coreType: latestVersion?.core_type || contract.core_type || null,
          coreTotal: latestVersion?.core_total ?? contract.core_total ?? null,
          sharingRatio: latestVersion?.shared_core_ratio || contract.sharing_ratio || null,
          monthlyAmount: Number(latestVersion?.monthly_amount || 0),
          yearlyAmount: Number(latestVersion?.yearly_amount || 0),
          invoiceCount: contractInvoices.length,
          selectedYearInvoiceCount: selectedYearInvoices.length,
          lastInvoiceStatus: lastInvoice?.status || null,
        };
      });
    });

    let filteredRows = rows;

    if (isp) {
      const normalizedIspFilter = isp.trim().toLowerCase();
      filteredRows = filteredRows.filter(row =>
        [row.ispName, ...(row.ispNames || [])]
          .join(' ')
          .toLowerCase()
          .includes(normalizedIspFilter)
      );
    }

    return {
      year: String(selectedYear),
      rows: filteredRows.sort((left, right) => getDateValue(right.contractEnd) - getDateValue(left.contractEnd)),
    };
  },

  // Get alerts
  async getAlerts({ year, latestRouteByCustomerId = null }) {
    const selectedYear = Number(year);
    const today = new Date().toISOString().slice(0, 10);
    const warningDate = new Date();
    warningDate.setUTCDate(warningDate.getUTCDate() + 90);
    const warningDateIso = warningDate.toISOString().slice(0, 10);

    const [contractsResult, invoicesResult] = await Promise.all([
      supabase
        .from('contracts')
        .select(`
          id,
          contract_number,
          start_date,
          end_date,
          status,
          versions:contract_versions(
            id,
            contract_number,
            version_number,
            start_date,
            end_date,
            deleted_at
          ),
          customer:customers(id, name, status)
        `)
        .eq('status', 'aktif')
        .is('deleted_at', null),
      supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          period_year,
          period_month,
          period_start_date,
          period_end_date,
          due_date,
          amount,
          status,
          customer:customers(id, name, status)
        `)
        .eq('period_year', selectedYear)
        .eq('schedule_status', 'active')
        .in('status', ['belum_bayar', 'terlambat'])
        .is('deleted_at', null),
    ]);

    if (contractsResult.error) throw contractsResult.error;
    if (invoicesResult.error) throw invoicesResult.error;

    const routeByCustomerId = latestRouteByCustomerId ?? await getLatestRouteVersionByCustomerId();

    const alerts = [];

    (contractsResult.data || []).forEach(contract => {
      if (!isCustomerOperationalForDashboard(contract.customer, today)) {
        return;
      }

      const activePeriod = resolveActiveContractPeriodForAlert(contract, today);
      if (!activePeriod.endDate || activePeriod.endDate < today || activePeriod.endDate > warningDateIso) {
        return;
      }

      const contractLabel = activePeriod.contractNumber || contract.contract_number || 'Kontrak';
      alerts.push({
        code: 'contract_expiring',
        type: 'contract_expiring',
        customerId: contract.customer?.id,
        customerName: contract.customer?.name || 'Customer',
        title: 'Kontrak akan berakhir',
        message: `${contract.customer?.name || 'Customer'} ${contractLabel} berakhir pada ${activePeriod.endDate}`,
        severity: 'warning',
        dueDate: activePeriod.endDate,
      });
    });

    (invoicesResult.data || []).forEach(invoice => {
      if (!isCustomerOperationalForDashboard(invoice.customer, today)) {
        return;
      }

      const isOverdue = invoice.status === 'terlambat';
      const dueDate = invoice.due_date
        || (invoice.period_start_date ? resolveInvoiceDueMonthIsoDate(invoice.period_start_date) : null)
        || invoice.period_end_date
        || null;

      alerts.push({
        code: isOverdue ? 'payment_overdue' : 'invoice_not_uploaded',
        type: 'invoice_attention',
        customerId: invoice.customer?.id,
        customerName: invoice.customer?.name || 'Customer',
        title: 'Invoice perlu perhatian',
        message: `${invoice.customer?.name || 'Customer'} invoice ${invoice.invoice_number || '-'} ${invoice.status}`,
        severity: isOverdue ? 'critical' : 'warning',
        dueDate,
      });
    });

    routeByCustomerId.forEach((latestRoute) => {
      const routeStatus = String(latestRoute?.flow_status || 'aktif').trim().toLowerCase();
      const customerStatus = resolveCustomerOperationalStatus(latestRoute?.customer, today);
      if (customerStatus === 'aktif' && ['gangguan', 'perbaikan', 'maintenance'].includes(routeStatus)) {
        const customerId = Number(latestRoute.customer_id);
        const customerName = latestRoute.customer?.name || 'Customer';
        alerts.push({
          code: 'route_attention',
          type: 'route_attention',
          customerId,
          customerName,
          title: 'Jalur perlu perhatian',
          message: `${customerName} jalur ${routeStatus}`,
          severity: routeStatus === 'gangguan' ? 'critical' : 'warning',
        });
      }
    });

    return {
      year,
      alerts,
    };
  },

  // Get insights
  async getInsights({ year }) {
    const selectedYear = Number(year);
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, customer_id, period_month, amount, status, schedule_status')
      .eq('period_year', selectedYear)
      .eq('schedule_status', 'active');

    if (error) throw error;

    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      revenuePaid: 0,
      revenueProjected: 0,
      activeRentals: 0,
    }));

    (invoices || []).forEach(invoice => {
      const monthIndex = Number(invoice.period_month) - 1;
      if (monthIndex < 0 || monthIndex > 11) return;
      const amount = Number(invoice.amount || 0);
      months[monthIndex].revenueProjected += amount;
      if (invoice.status === 'lunas') months[monthIndex].revenuePaid += amount;
      months[monthIndex].activeRentals += 1;
    });

    const totals = months.reduce((acc, month) => ({
      revenuePaid: acc.revenuePaid + month.revenuePaid,
      revenueProjected: acc.revenueProjected + month.revenueProjected,
      activeRentals: acc.activeRentals + month.activeRentals,
    }), { revenuePaid: 0, revenueProjected: 0, activeRentals: 0 });

    return {
      year,
      months,
      totals: {
        revenuePaid: totals.revenuePaid,
        revenueProjected: totals.revenueProjected,
        estimatedProfit: 0,
        averageActiveRentals: Math.round(totals.activeRentals / 12),
      },
    };
  },

  async getDashboardMetrics({ year, growthStartYear, growthEndYear, coreTrendStartYear, coreTrendEndYear } = {}) {
    const selectedYear = Number(year);
    const today = new Date().toISOString().slice(0, 10);
    const fallbackGrowthEndYear = Number.isFinite(selectedYear) ? selectedYear : new Date().getUTCFullYear();
    const resolvedGrowthEndYear = Number.isFinite(Number(growthEndYear)) ? Number(growthEndYear) : fallbackGrowthEndYear;
    const resolvedGrowthStartYear = Number.isFinite(Number(growthStartYear))
      ? Number(growthStartYear)
      : resolvedGrowthEndYear - 4;
    const resolvedCoreTrendEndYear = Number.isFinite(Number(coreTrendEndYear))
      ? Number(coreTrendEndYear)
      : fallbackGrowthEndYear;
    const resolvedCoreTrendStartYear = Number.isFinite(Number(coreTrendStartYear))
      ? Number(coreTrendStartYear)
      : resolvedCoreTrendEndYear - 4;

    const [customersResult, ispsResult] = await Promise.all([
      supabase
        .from('customers')
        .select(`
          id,
          customer_code,
          name,
          status,
          contract_start_date,
          created_at,
          contracts(
            id,
            start_date,
            end_date,
            core_type,
            core_total,
            sharing_ratio,
            status,
            deleted_at,
            versions:contract_versions(contract_number, version_number, start_date, end_date, core_type, core_total, shared_core_ratio, deleted_at)
          ),
          routeVersions:customer_route_versions(version_number, flow_status, created_at)
        `)
        .is('deleted_at', null),
      supabase
        .from('isps')
        .select('id, name, status, paket, jumlah, created_at')
        .is('deleted_at', null)
    ]);

    if (customersResult.error) throw customersResult.error;
    if (ispsResult.error) throw ispsResult.error;

    const customers = customersResult.data || [];
    const isps = ispsResult.data || [];
    const getDateValue = (value) => {
      const timestamp = value ? new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`).getTime() : 0;
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    const normalizeStatus = (status) => String(status ?? '').trim().toLowerCase();
    const isContractInPeriod = (contract, start, end) => contract?.start_date <= end && contract?.end_date >= start;
    const sortContractVersions = (versions = []) => [...versions]
      .filter(version => !version.deleted_at)
      .sort((left, right) => {
        const versionDiff = Number(right.version_number ?? 0) - Number(left.version_number ?? 0);
        if (versionDiff !== 0) return versionDiff;
        return getDateValue(right.end_date ?? right.start_date) - getDateValue(left.end_date ?? left.start_date);
      });
    const getLatestVersion = (contract) => sortContractVersions(contract?.versions)[0] ?? null;
    const getEffectiveVersion = (contract, start, end) => (
      sortContractVersions(contract?.versions).find(version => isContractInPeriod(version, start, end))
      ?? null
    );
    const getRelevantContract = (contracts = []) => {
      const sortedContracts = [...contracts].sort((left, right) => {
        const startDiff = getDateValue(right.start_date) - getDateValue(left.start_date);
        if (startDiff !== 0) return startDiff;
        return getDateValue(right.end_date) - getDateValue(left.end_date);
      });
      return sortedContracts.find(contract => contract.start_date <= today && contract.end_date >= today)
        ?? sortedContracts.find(contract => contract.start_date > today)
        ?? sortedContracts[0]
        ?? null;
    };
    const getLatestRouteVersion = (customer) => (
      Array.isArray(customer?.routeVersions)
        ? [...customer.routeVersions].sort((left, right) => {
          const versionDiff = Number(right.version_number ?? 0) - Number(left.version_number ?? 0);
          if (versionDiff !== 0) return versionDiff;
          return getDateValue(right.created_at) - getDateValue(left.created_at);
        })[0]
        : null
    );

    const totalCoreCapacity = 384;

    const sharingRatios = ['1/2', '1/4', '1/8', '1/16', '1/32'];
    const sharingCounts = Object.fromEntries(sharingRatios.map(ratio => [ratio, 0]));
    const normalizeSharingRatio = (ratio) => {
      const normalizedRatio = String(ratio ?? '').trim();
      if (!normalizedRatio) return null;
      return normalizedRatio.replace(/:/g, '/');
    };
    const sharingTrend = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      name: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'][index],
      '1:2': 0,
      '1:4': 0,
      '1:8': 0,
      '1:16': 0,
      '1:32': 0,
    }));
    const coreTrend = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      name: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'][index],
      count: 0,
    }));
    const coreTrendYearCount = Math.max(resolvedCoreTrendEndYear - resolvedCoreTrendStartYear + 1, 1);
    const coreTrendYears = Array.from({ length: coreTrendYearCount }, (_, index) => resolvedCoreTrendStartYear + index);
    const yearlySharingTrend = coreTrendYears.map(yearValue => ({
      year: String(yearValue),
      name: String(yearValue),
      '1:2': 0,
      '1:4': 0,
      '1:8': 0,
      '1:16': 0,
      '1:32': 0,
    }));
    const yearlyCoreTrend = coreTrendYears.map(yearValue => ({
      year: String(yearValue),
      name: String(yearValue),
      count: 0,
    }));
    const routeStatus = { aktif: 0, gangguan: 0, perbaikan: 0, nonaktif: 0, total: 0 };
    let totalCoreUsed = 0;
    let coreLocationCount = 0;

    customers.forEach(customer => {
      const customerStatus = resolveCustomerOperationalStatus(customer, today);
      const relevantContract = getRelevantContract(customer.contracts || []);
      const latestVersion = getLatestVersion(relevantContract);
      const coreType = latestVersion?.core_type || relevantContract?.core_type || null;
      const coreTotal = Number(latestVersion?.core_total ?? relevantContract?.core_total ?? 0);
      const sharingRatio = latestVersion?.shared_core_ratio || relevantContract?.sharing_ratio || null;
      const isOperational = customerStatus === 'aktif' || customerStatus === 'belum_beroperasi';

      if (isOperational) {
        if (coreType === 'core') {
          totalCoreUsed += coreTotal;
          coreLocationCount += 1;
        } else if (coreType === 'sharing_core' && sharingRatio) {
          const normalizedSharingRatio = normalizeSharingRatio(sharingRatio);
          if (normalizedSharingRatio && Object.prototype.hasOwnProperty.call(sharingCounts, normalizedSharingRatio)) {
            sharingCounts[normalizedSharingRatio] = (sharingCounts[normalizedSharingRatio] || 0) + 1;
          }
        }
      }

      if (customerStatus === 'aktif' || customerStatus === 'belum_beroperasi') {
        sharingTrend.forEach((monthData, index) => {
          const month = index + 1;
          const monthStart = `${selectedYear}-${String(month).padStart(2, '0')}-01`;
          const monthEnd = new Date(Date.UTC(selectedYear, month, 0)).toISOString().slice(0, 10);

          (customer.contracts || [])
            .filter(contract => !contract.deleted_at && isContractInPeriod(contract, monthStart, monthEnd))
            .forEach(contract => {
              const effectiveVersion = getEffectiveVersion(contract, monthStart, monthEnd);
              const effectiveCoreType = effectiveVersion?.core_type || contract.core_type || null;
              const effectiveCoreTotal = Number(effectiveVersion?.core_total ?? contract.core_total ?? 0);
              const effectiveSharingRatio = effectiveVersion?.shared_core_ratio || contract.sharing_ratio || null;

              if (effectiveCoreType === 'sharing_core' && effectiveSharingRatio) {
                const chartKey = effectiveSharingRatio.replace('/', ':');
                if (Object.prototype.hasOwnProperty.call(monthData, chartKey)) monthData[chartKey] += 1;
              } else if (effectiveCoreType === 'core') {
                coreTrend[index].count += effectiveCoreTotal;
              }
            });
        });

        coreTrendYears.forEach((yearValue, index) => {
          const yearStart = `${yearValue}-01-01`;
          const yearEnd = `${yearValue}-12-31`;
          (customer.contracts || [])
            .filter(contract => !contract.deleted_at && isContractInPeriod(contract, yearStart, yearEnd))
            .forEach(contract => {
              const effectiveVersion = getEffectiveVersion(contract, yearStart, yearEnd);
              const effectiveCoreType = effectiveVersion?.core_type || contract.core_type || null;
              const effectiveCoreTotal = Number(effectiveVersion?.core_total ?? contract.core_total ?? 0);
              const effectiveSharingRatio = normalizeSharingRatio(effectiveVersion?.shared_core_ratio || contract.sharing_ratio);

              if (effectiveCoreType === 'sharing_core' && effectiveSharingRatio) {
                const chartKey = effectiveSharingRatio.replace('/', ':');
                if (Object.prototype.hasOwnProperty.call(yearlySharingTrend[index], chartKey)) yearlySharingTrend[index][chartKey] += 1;
              } else if (effectiveCoreType === 'core') {
                yearlyCoreTrend[index].count += effectiveCoreTotal;
              }
            });
        });
      }

      const latestRoute = getLatestRouteVersion(customer);
      const effectiveRouteStatus = customerStatus === 'berhenti' || customerStatus === 'belum_beroperasi'
        ? 'nonaktif'
        : normalizeStatus(latestRoute?.flow_status || 'aktif');
      const routeKey = ['perbaikan', 'maintenance'].includes(effectiveRouteStatus) ? 'perbaikan' : effectiveRouteStatus;
      if (Object.prototype.hasOwnProperty.call(routeStatus, routeKey)) routeStatus[routeKey] += 1;
      else routeStatus.aktif += 1;
      routeStatus.total += 1;
    });

    const growthYearCount = Math.max(resolvedGrowthEndYear - resolvedGrowthStartYear + 1, 1);
    const growthYears = Array.from({ length: growthYearCount }, (_, index) => resolvedGrowthStartYear + index);
    const tenantGrowth = growthYears.map(growthYear => ({
      year: String(growthYear),
      count: customers.filter(customer => {
        if (resolveCustomerOperationalStatus(customer) === 'berhenti') return false;

        const sourceDate = customer.contract_start_date
          || getRelevantContract(customer.contracts || [])?.start_date
          || customer.created_at;

        return sourceDate && Number(String(sourceDate).slice(0, 4)) <= growthYear;
      }).length,
    }));
    const ispGrowth = growthYears.map(growthYear => ({
      year: String(growthYear),
      count: isps.filter(isp => {
        const sourceDate = isp.created_at;
        return sourceDate && Number(String(sourceDate).slice(0, 4)) <= growthYear;
      }).length,
    }));

    return {
      year,
      capacityCore: {
        total: totalCoreCapacity,
        used: totalCoreUsed,
        available: Math.max(totalCoreCapacity - totalCoreUsed, 0),
        availablePercent: totalCoreCapacity > 0 ? Math.round(((totalCoreCapacity - totalCoreUsed) / totalCoreCapacity) * 100) : 0,
      },
      coreRentals: {
        totalCoreUsed,
        locationCount: coreLocationCount,
      },
      sharingCounts,
      sharingTrend,
      coreTrend,
      yearlySharingTrend,
      yearlyCoreTrend,
      routeStatus,
      growth: {
        tenant: tenantGrowth,
        isp: ispGrowth,
      },
    };
  },
};

// ============================================================================
// DOCUMENTS API
// ============================================================================

export const documentsApi = {
  // Get documents by customer ID
  async getByCustomerId(customerId) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('customer_id', customerId)
      .order('tanggal_dokumen', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Create document
  async create(documentData) {
    const { data, error } = await supabase
      .from('documents')
      .insert(mapDocumentPayload(documentData))
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },

  // Update document
  async update(id, documentData) {
    const { data, error } = await supabase
      .from('documents')
      .update(mapDocumentPayload(documentData))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },

  // Delete document
  async delete(id) {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
    clearNotificationListCache();
  },
};

// ============================================================================
// INVOICES API
// ============================================================================

export const invoicesApi = {
  // Get invoices by customer ID
  async getByCustomerId(customerId) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        invoiceFollowUps:invoice_follow_ups(
          id,
          invoice_id,
          split_order,
          source,
          trigger_code,
          title,
          description,
          status,
          invoice_number,
          invoice_file_url,
          created_at,
          updated_at
        )
      `)
      .eq('customer_id', customerId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Create invoice
  async create(invoiceData) {
    const { data, error } = await supabase
      .from('invoices')
      .insert(withUpdatedAt(mapInvoicePayload(invoiceData)))
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },

  // Update invoice
  async update(id, invoiceData) {
    const { data, error } = await supabase
      .from('invoices')
      .update(withUpdatedAt(mapInvoicePayload(invoiceData)))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },

  // Delete invoice
  async delete(id) {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (error) throw error;
    clearNotificationListCache();
  },
};

// ============================================================================
// PAYMENT REALIZATIONS API
// ============================================================================

export const paymentRealizationsApi = {
  async getByCustomerId(customerId) {
    const { data, error } = await supabase
      .from('customer_payment_realizations')
      .select(`
        id,
        customer_id,
        contract_id,
        contract_version_id,
        period_start_month,
        period_end_month,
        amount,
        payment_file_url,
        payment_file_name,
        notes,
        created_at,
        updated_at
      `)
      .eq('customer_id', customerId)
      .order('period_start_month', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return Array.isArray(data) ? data.map(mapCustomerPaymentRealization) : [];
  },

  async create(paymentRealizationData) {
    const { data, error } = await supabase
      .from('customer_payment_realizations')
      .insert(withUpdatedAt(mapPaymentRealizationPayload(paymentRealizationData)))
      .select()
      .single();

    if (error) throw error;
    return mapCustomerPaymentRealization(data);
  },
};

// ============================================================================
// CONTRACTS API
// ============================================================================

export const contractsApi = {
  // Get contracts by customer ID
  async getByCustomerId(customerId) {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        versions:contract_versions(*)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Create contract
  async create(contractData) {
    const { data, error } = await supabase
      .from('contracts')
      .insert(withUpdatedAt(mapContractPayload(contractData)))
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },

  // Update contract
  async update(id, contractData) {
    const payload = mapContractPayload(contractData);
    if (Object.keys(payload).length === 0) {
      return null;
    }

    const { data, error } = await supabase
      .from('contracts')
      .update(withUpdatedAt(payload))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },

  // Delete contract
  async delete(id) {
    const contractId = Number(id);
    if (!Number.isFinite(contractId)) {
      throw new Error('Kontrak tidak valid untuk dihapus.');
    }

    const { user } = await getCurrentActor();
    const now = new Date().toISOString();

    const [{ data: contractVersions, error: contractVersionsError }, { data: documents, error: documentsError }] = await Promise.all([
      supabase
        .from('contract_versions')
        .select('id')
        .eq('contract_id', contractId)
        .is('deleted_at', null),
      supabase
        .from('documents')
        .select('id')
        .eq('contract_id', contractId)
        .is('deleted_at', null),
    ]);

    if (contractVersionsError) throw contractVersionsError;
    if (documentsError) throw documentsError;

    await softDeleteRows({
      table: 'contract_versions',
      ids: contractVersions?.map((row) => row.id) ?? [],
      deletedBy: user?.id ?? null,
      now,
    });

    await softDeleteRows({
      table: 'documents',
      ids: documents?.map((row) => row.id) ?? [],
      deletedBy: user?.id ?? null,
      now,
    });

    const { error } = await supabase
      .from('contracts')
      .update({ deleted_at: now, deleted_by: user?.id ?? null, updated_at: now })
      .eq('id', contractId);

    if (error) throw error;
    clearNotificationListCache();
  },
};

// ============================================================================
// CONTRACT VERSIONS API
// ============================================================================

export const contractVersionsApi = {
  // Get versions by contract ID
  async getByContractId(contractId) {
    const { data, error } = await supabase
      .from('contract_versions')
      .select('*')
      .eq('contract_id', contractId)
      .order('version_number', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Create contract version
  async create(versionData) {
    const contractId = versionData.contract_id ?? versionData.contractId;
    let payload = mapContractVersionPayload(versionData);

    if (contractId && (!payload.customer_id || !payload.version_number || !payload.core_type)) {
      const [{ data: contract, error: contractError }, { data: latestVersions, error: versionError }] = await Promise.all([
        supabase
          .from('contracts')
          .select('customer_id, contract_number, core_type, core_total, sharing_ratio')
          .eq('id', contractId)
          .single(),
        supabase
          .from('contract_versions')
          .select('version_number')
          .eq('contract_id', contractId)
          .order('version_number', { ascending: false })
          .limit(1),
      ]);

      if (contractError) throw contractError;
      if (versionError) throw versionError;

      const nextVersionNumber = Number(latestVersions?.[0]?.version_number ?? 0) + 1;
      const coreType = payload.core_type
        ?? (payload.shared_core_ratio ? 'sharing_core' : contract?.core_type)
        ?? 'core';

      payload = {
        ...payload,
        customer_id: payload.customer_id ?? contract?.customer_id,
        version_number: payload.version_number ?? nextVersionNumber,
        contract_number: payload.contract_number ?? contract?.contract_number ?? null,
        core_type: coreType,
        core_total: payload.core_total ?? (coreType === 'core' ? Number(contract?.core_total ?? 0) : 0),
        monthly_amount: payload.monthly_amount ?? 0,
        yearly_amount: payload.yearly_amount ?? 0,
      };
    }

    const { data, error } = await supabase
      .from('contract_versions')
      .insert(withUpdatedAt(payload))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update contract version
  async update(id, versionData) {
    const payload = mapContractVersionPayload(versionData);
    if (Object.keys(payload).length === 0) {
      return null;
    }

    const { data: oldVersion, error: oldVersionError } = await supabase
      .from('contract_versions')
      .select('*')
      .eq('id', id)
      .single();
    if (oldVersionError) throw oldVersionError;

    const oldStart = String(oldVersion?.start_date ?? '').slice(0, 10);
    const oldEnd = String(oldVersion?.end_date ?? '').slice(0, 10);
    const nextStart = String(payload.start_date ?? oldStart).slice(0, 10);
    const nextEnd = String(payload.end_date ?? oldEnd).slice(0, 10);
    const shouldReconcileInvoices = Boolean(nextStart && nextEnd);
    let invoiceReconciliation = null;
    let billingCycle = null;

    if (shouldReconcileInvoices) {
      const [{ data: mainContract, error: mainContractError }, { data: versionInvoices, error: versionInvoicesError }] = await Promise.all([
        supabase
          .from('contracts')
          .select('billing_every, billing_unit')
          .eq('id', oldVersion.contract_id)
          .single(),
        supabase
          .from('invoices')
          .select(`
            id,
            status,
            paid_at,
            invoice_file_url,
            payment_proof_file_url,
            document_id,
            period_start_date,
            period_end_date,
            schedule_status,
            invoiceFollowUps:invoice_follow_ups(id)
          `)
          .eq('contract_version_id', id)
          .is('deleted_at', null),
      ]);
      if (mainContractError) throw mainContractError;
      if (versionInvoicesError) throw versionInvoicesError;

      billingCycle = {
        every: mainContract?.billing_every ?? 1,
        unit: mainContract?.billing_unit ?? 'bulan',
      };
      const expectedRows = buildInvoiceScheduleRows(nextStart, nextEnd, billingCycle);
      invoiceReconciliation = buildInvoiceScheduleReconciliation(versionInvoices ?? [], expectedRows);

      if (invoiceReconciliation.blockedRemovals.length > 0) {
        throw new Error(
          `Periode tidak dapat dipendekkan karena ${invoiceReconciliation.blockedRemovals.length} invoice di luar periode sudah memiliki data settlement.`,
        );
      }
    }

    // Sinkronisasi data ke kontrak induk jika versi ini adalah versi terbaru
    const contractId = oldVersion.contract_id;
    const { data: latestVersions, error: latestVersionsError } = await supabase
      .from('contract_versions')
      .select('id')
      .eq('contract_id', contractId)
      .is('deleted_at', null)
      .order('version_number', { ascending: false })
      .limit(1);
    if (latestVersionsError) throw latestVersionsError;

    const isLatest = Number(latestVersions?.[0]?.id) === Number(id);
    const contractPayload = {};
    if (isLatest) {
      const newEndDate = versionData.endDate ?? versionData.end_date;
      const newContractNumber = versionData.contractNumber ?? versionData.contract_number;
      if (newEndDate) {
        contractPayload.end_date = newEndDate;
      }
      if (newContractNumber) {
        contractPayload.contract_number = newContractNumber;
      }
    }

    let invoiceUpdates = [];
    let invoiceCreates = [];
    let invoiceRemovals = [];

    if (invoiceReconciliation) {
      const contractNumber = payload.contract_number ?? oldVersion.contract_number;
      const monthlyAmount = payload.monthly_amount ?? oldVersion.monthly_amount;
      const existingScheduleStatus = invoiceReconciliation.updates
        .map(({ invoice }) => invoice.schedule_status)
        .find(Boolean);
      const scheduleStatus = existingScheduleStatus
        ?? (nextEnd < new Date().toISOString().slice(0, 10) ? 'history' : 'active');
      const invoiceAmount = resolveBillingCycleInvoiceAmount(monthlyAmount, billingCycle);

      const toInvoicePeriodPayload = (row) => {
        const periodDate = new Date(`${row.periodStartDate}T00:00:00.000Z`);
        return {
          contract_number: contractNumber,
          period_start_date: row.periodStartDate,
          period_end_date: row.periodEndDate,
          period_year: periodDate.getUTCFullYear(),
          period_month: periodDate.getUTCMonth() + 1,
          due_date: resolveInvoiceDueDate(row.periodStartDate),
          schedule_status: scheduleStatus,
        };
      };

      invoiceUpdates = invoiceReconciliation.updates.map(({ invoice, row }) => ({
        id: invoice.id,
        ...toInvoicePeriodPayload(row),
      }));

      invoiceCreates = invoiceReconciliation.creates.map((row) => ({
        customer_id: oldVersion.customer_id,
        contract_id: oldVersion.contract_id,
        contract_version_id: id,
        ...toInvoicePeriodPayload(row),
        amount: invoiceAmount,
        status: 'belum_ditagih',
      }));

      invoiceRemovals = invoiceReconciliation.removals.map((invoice) => invoice.id);
    }

    const { data, error } = await supabase.rpc('reconcile_contract_version_and_invoices', {
      p_version_id: id,
      p_version_payload: payload,
      p_is_latest: isLatest,
      p_contract_payload: Object.keys(contractPayload).length > 0 ? contractPayload : null,
      p_invoice_updates: invoiceUpdates,
      p_invoice_creates: invoiceCreates,
      p_invoice_removals: invoiceRemovals,
    });

    if (error) throw error;
    return data;
  },

  async changePackageMidPeriod(changeData = {}) {
    const contractId = changeData.contract_id ?? changeData.contractId;
    const requestedDate = String(changeData.requestedDate ?? changeData.requested_date ?? '').slice(0, 10);
    if (!contractId) throw new Error('Kontrak tidak valid untuk perubahan paket.');
    if (!requestedDate) throw new Error('Tanggal perubahan paket wajib diisi.');

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id,customer_id,contract_number,start_date,end_date,core_type,core_total,sharing_ratio,billing_every,billing_unit')
      .eq('id', contractId)
      .single();
    if (contractError) throw contractError;
    if (!contract?.customer_id) throw new Error('Data kontrak tidak lengkap.');

    const startDay = contract.start_date ? Number(contract.start_date.slice(8, 10)) : 1;
    let newEffectiveStart;
    if (startDay <= 15) {
      const d = new Date(requestedDate);
      newEffectiveStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    } else {
      newEffectiveStart = getFirstDayOfNextMonthIso(requestedDate);
    }

    const oldEffectiveEnd = addDaysToIsoDate(newEffectiveStart, -1);
    if (!newEffectiveStart || !oldEffectiveEnd) throw new Error('Tanggal perubahan paket tidak valid.');

    if (contract.end_date && newEffectiveStart > contract.end_date) {
      throw new Error('Tanggal efektif paket baru melewati akhir kontrak.');
    }

    const { data: versionRows, error: versionsError } = await supabase
      .from('contract_versions')
      .select('*')
      .eq('contract_id', contractId)
      .is('deleted_at', null)
      .order('version_number', { ascending: true });
    if (versionsError) throw versionsError;

    const versions = Array.isArray(versionRows) ? versionRows : [];
    let workingVersions = [...versions];
    let nextVersionNumber = Math.max(0, ...workingVersions.map((version) => Number(version.version_number ?? 0))) + 1;

    if (workingVersions.length === 0) {
      const { data: baselineVersion, error: baselineError } = await supabase
        .from('contract_versions')
        .insert(withUpdatedAt({
          contract_id: contract.id,
          customer_id: contract.customer_id,
          contract_number: contract.contract_number ?? null,
          version_number: nextVersionNumber,
          start_date: contract.start_date,
          end_date: contract.end_date,
          core_type: contract.core_type ?? 'core',
          core_total: Number(contract.core_total ?? 0),
          shared_core_ratio: contract.sharing_ratio ?? null,
          monthly_amount: 0,
          yearly_amount: 0,
          remarks: 'Baseline kontrak sebelum perubahan paket.',
        }))
        .select()
        .single();
      if (baselineError) throw baselineError;
      workingVersions = [baselineVersion];
      nextVersionNumber += 1;
    }

    const effectiveVersion = [...workingVersions]
      .sort((left, right) => getIsoDateValue(right.end_date ?? right.start_date) - getIsoDateValue(left.end_date ?? left.start_date))
      .find((version) => String(version.start_date ?? '') <= requestedDate && String(version.end_date ?? '') >= requestedDate)
      ?? [...workingVersions].sort((left, right) => getIsoDateValue(right.end_date ?? right.start_date) - getIsoDateValue(left.end_date ?? left.start_date))[0];

    if (!effectiveVersion?.id) throw new Error('Versi kontrak aktif tidak ditemukan.');
    if (effectiveVersion.start_date && newEffectiveStart <= effectiveVersion.start_date) {
      throw new Error('Paket baru harus mulai setelah awal periode versi aktif.');
    }

    const coreType = changeData.core_type ?? changeData.coreType ?? changeData.packageType ?? effectiveVersion.core_type ?? contract.core_type ?? 'core';
    const isSharingCore = String(coreType).toLowerCase().includes('shar');
    const monthlyAmount = Number(changeData.monthly_amount ?? changeData.monthlyAmount ?? 0);
    const yearlyAmount = Number(changeData.yearly_amount ?? changeData.yearlyAmount ?? monthlyAmount * 12);
    const sharedCoreRatio = changeData.shared_core_ratio ?? changeData.sharedCoreRatio ?? null;
    const coreTotal = Number(changeData.core_total ?? changeData.coreTotal ?? 0);

    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) throw new Error('Nominal bulanan wajib lebih dari 0.');
    if (isSharingCore && !String(sharedCoreRatio ?? '').trim()) throw new Error('Rasio sharing wajib diisi.');
    if (!isSharingCore && (!Number.isFinite(coreTotal) || coreTotal <= 0)) throw new Error('Jumlah core wajib lebih dari 0.');

    const { error: closeError } = await supabase
      .from('contract_versions')
      .update(withUpdatedAt({ end_date: oldEffectiveEnd }))
      .eq('id', effectiveVersion.id);
    if (closeError) throw closeError;

    const { data: newVersion, error: newVersionError } = await supabase
      .from('contract_versions')
      .insert(withUpdatedAt({
        contract_id: contract.id,
        customer_id: contract.customer_id,
        contract_number: changeData.contract_number ?? changeData.contractNumber ?? effectiveVersion.contract_number ?? contract.contract_number ?? null,
        version_number: nextVersionNumber,
        start_date: newEffectiveStart,
        end_date: effectiveVersion.end_date ?? contract.end_date,
        core_type: isSharingCore ? 'sharing_core' : 'core',
        core_total: isSharingCore ? 0 : coreTotal,
        shared_core_ratio: isSharingCore ? sharedCoreRatio : null,
        monthly_amount: monthlyAmount,
        yearly_amount: yearlyAmount,
        remarks: changeData.remarks ?? `Perubahan paket diminta ${requestedDate}; efektif ${newEffectiveStart}.`,
      }))
      .select()
      .single();
    if (newVersionError) throw newVersionError;

    const { data: futureInvoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id,status,paid_at,payment_proof_file_url,period_start_date,due_date,schedule_status')
      .eq('customer_id', contract.customer_id)
      .eq('contract_id', contract.id)
      .is('deleted_at', null);
    if (invoicesError) throw invoicesError;

    const unpaidActiveInvoices = (futureInvoices || []).filter((invoice) => {
      if (invoice.schedule_status === 'history') return false;
      if (String(invoice.status || '').toLowerCase() === 'lunas') return false;
      if (invoice.paid_at || invoice.payment_proof_file_url) return false;
      
      const invoiceDueDate = invoice.due_date || (invoice.period_start_date ? resolveInvoiceDueMonthIsoDate(invoice.period_start_date) : null);
      if (!invoiceDueDate || invoiceDueDate < newEffectiveStart) return false;

      return true;
    });

    const invoiceNewAmount = resolveBillingCycleInvoiceAmount(monthlyAmount, { every: contract.billing_every, unit: contract.billing_unit });

    await Promise.all(unpaidActiveInvoices.map((invoice) => supabase
      .from('invoices')
      .update(withUpdatedAt({
        contract_version_id: newVersion.id,
        contract_number: newVersion.contract_number ?? null,
        amount: invoiceNewAmount,
      }))
      .eq('id', invoice.id)
      .then(({ error }) => {
        if (error) throw error;
      })));

    return {
      oldVersionId: effectiveVersion.id,
      oldEffectiveEnd,
      newEffectiveStart,
      newVersion,
      updatedInvoiceCount: unpaidActiveInvoices.length,
    };
  },

  // Delete contract version
  async delete(id) {
    const versionId = Number(id);
    if (!Number.isFinite(versionId)) {
      throw new Error('Versi kontrak tidak valid untuk dihapus.');
    }

    const { user } = await getCurrentActor();
    const now = new Date().toISOString();

    const [{ data: documents, error: documentsError }] = await Promise.all([
      supabase
        .from('documents')
        .select('id')
        .eq('contract_version_id', versionId)
        .is('deleted_at', null),
    ]);

    if (documentsError) throw documentsError;

    await softDeleteRows({
      table: 'documents',
      ids: documents?.map((row) => row.id) ?? [],
      deletedBy: user?.id ?? null,
      now,
    });

    const { error } = await supabase
      .from('contract_versions')
      .update({ deleted_at: now, deleted_by: user?.id ?? null, updated_at: now })
      .eq('id', versionId);

    if (error) throw error;
  },
};

// ============================================================================
// CUSTOMER ROUTES API
// ============================================================================

const ROUTE_META_PREFIX = '[FO_ROUTE_META]';

// Decode the base64 [FO_ROUTE_META] block embedded in a route point note.
// Returns the parsed planner meta object, or null. Never throws.
function decodeRoutePlannerMetaFromNote(note) {
  if (typeof note !== 'string') return null;
  const idx = note.indexOf(ROUTE_META_PREFIX);
  if (idx < 0) return null;
  const encoded = note.slice(idx + ROUTE_META_PREFIX.length).trim();
  if (!encoded) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

// Parse "lat, lng" from the human-readable portion of a note (meta block stripped).
function parseCoordinatesFromNote(note) {
  if (typeof note !== 'string') return null;
  const display = note.split(ROUTE_META_PREFIX)[0];
  const match = display.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Prefer explicit structured coordinates on the point; fall back to the note text.
function resolvePointCoordinates(point) {
  const explicitLat = Number(point?.latitude ?? point?.lat);
  const explicitLng = Number(point?.longitude ?? point?.lng);
  if (Number.isFinite(explicitLat) && Number.isFinite(explicitLng)) {
    return { lat: explicitLat, lng: explicitLng };
  }
  return parseCoordinatesFromNote(point?.note);
}

// True when Supabase/PostgREST rejects a write because a column is missing,
// e.g. the Phase 1 migration (add-route-point-coordinates.sql) is not applied yet.
function isUnknownColumnError(error) {
  if (!error) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '').toLowerCase();
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    (message.includes('column') &&
      (message.includes('schema cache') || message.includes('does not exist')))
  );
}

function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '').toLowerCase();
  return (
    code === '42P01'
    || code === 'PGRST205'
    || (message.includes('relation') && message.includes('does not exist'))
    || (message.includes('could not find') && message.includes('table'))
  );
}

export const customerRoutesApi = {
  async replace(
    customerId,
    { flowStatus = 'aktif', changeNote = null, points = [], routeMeta = null } = {},
  ) {
    const now = new Date().toISOString();
    const { data: latestVersions, error: latestVersionError } = await supabase
      .from('customer_route_versions')
      .select('version_number')
      .eq('customer_id', customerId)
      .order('version_number', { ascending: false })
      .limit(1);

    if (latestVersionError) throw latestVersionError;
    const nextVersionNumber = Number(latestVersions?.[0]?.version_number ?? 0) + 1;

    // Derive route-level geometry/meta: prefer an explicit routeMeta argument,
    // otherwise decode it from the embedded [FO_ROUTE_META] block on any point
    // (legacy storage). This keeps callers unchanged while populating the new
    // structured columns (dual-write — Fase 2).
    const meta =
      routeMeta ??
      points.map((point) => decodeRoutePlannerMetaFromNote(point?.note)).find(Boolean) ??
      null;
    const geometryCoordinates = Array.isArray(meta?.geometryCoordinates)
      ? meta.geometryCoordinates
      : null;

    const baseVersionPayload = {
      customer_id: customerId,
      version_number: nextVersionNumber,
      flow_status: flowStatus,
      change_mode: nextVersionNumber === 1 ? 'initial' : 'ubah_jalur',
      change_note: changeNote,
      updated_at: now,
    };
    const structuredVersionPayload = {
      ...baseVersionPayload,
      route_geometry: geometryCoordinates,
      road_segments: Array.isArray(meta?.roads) ? meta.roads : null,
      route_source: typeof meta?.source === 'string' ? meta.source : null,
      route_mode: typeof meta?.mode === 'string' ? meta.mode : null,
      route_profile: typeof meta?.profile === 'string' ? meta.profile : null,
      distance_meters: Number.isFinite(Number(meta?.distance)) ? Number(meta.distance) : null,
      duration_seconds: Number.isFinite(Number(meta?.duration)) ? Number(meta.duration) : null,
    };

    // Try the structured payload; fall back to legacy-only if the new columns
    // are not present yet (migration not applied in this environment).
    let version;
    const structuredVersion = await supabase
      .from('customer_route_versions')
      .insert(structuredVersionPayload)
      .select()
      .single();
    if (structuredVersion.error) {
      if (!isUnknownColumnError(structuredVersion.error)) throw structuredVersion.error;
      const legacyVersion = await supabase
        .from('customer_route_versions')
        .insert(baseVersionPayload)
        .select()
        .single();
      if (legacyVersion.error) throw legacyVersion.error;
      version = legacyVersion.data;
    } else {
      version = structuredVersion.data;
    }

    const rollbackRouteVersion = async () => {
      await supabase.from('customer_route_points').delete().eq('route_version_id', version.id);
      await supabase.from('customer_route_versions').delete().eq('id', version.id);
    };

    try {
      if (points.length > 0) {
        const buildPoint = (point, index, withCoords) => {
          const base = {
            route_version_id: version.id,
            path_name: point.pathName ?? point.path_name ?? null,
            point_type: point.pointType ?? point.point_type ?? null,
            note: point.note ?? null,
            order_number: point.orderNumber ?? point.order_number ?? index + 1,
            updated_at: now,
          };
          if (!withCoords) return base;
          const coords = resolvePointCoordinates(point);
          return { ...base, latitude: coords?.lat ?? null, longitude: coords?.lng ?? null };
        };

        const structuredPoints = await supabase
          .from('customer_route_points')
          .insert(points.map((point, index) => buildPoint(point, index, true)));
        if (structuredPoints.error) {
          if (!isUnknownColumnError(structuredPoints.error)) throw structuredPoints.error;
          const legacyPoints = await supabase
            .from('customer_route_points')
            .insert(points.map((point, index) => buildPoint(point, index, false)));
          if (legacyPoints.error) throw legacyPoints.error;
        }
      }
    } catch (pointsError) {
      try {
        await rollbackRouteVersion();
      } catch (rollbackError) {
        console.error('Failed to rollback route version:', rollbackError);
      }
      throw pointsError;
    }

    return version;
  },

  async addHistory(customerId, historyData) {
    const { data, error } = await supabase
      .from('customer_route_history')
      .insert(mapRouteHistoryPayload(customerId, historyData))
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

// ============================================================================
// CUSTOMER ISP MEMBERSHIPS API
// ============================================================================

export const ispEntryPointsApi = {
  async listByIsp(ispId) {
    const { data, error } = await supabase
      .from('isp_entry_points')
      .select('*')
      .eq('isp_id', ispId)
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .order('label', { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data.map(mapIspEntryPoint) : [];
  },

  async create(pointData) {
    const { data, error } = await supabase
      .from('isp_entry_points')
      .insert(withUpdatedAt(mapIspEntryPointPayload(pointData)))
      .select()
      .single();

    if (error) throw error;
    clearIspListCache();
    return mapIspEntryPoint(data);
  },

  async update(id, pointData) {
    const { data, error } = await supabase
      .from('isp_entry_points')
      .update(withUpdatedAt(mapIspEntryPointPayload(pointData)))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    clearIspListCache();
    return mapIspEntryPoint(data);
  },

  async softDelete(id) {
    const { user } = await getCurrentActor();
    const { error } = await supabase
      .from('isp_entry_points')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq('id', id);

    if (error) throw error;
    clearIspListCache();
  },

  async replaceForIsp(ispId, points = []) {
    clearIspListCache();
    const now = new Date().toISOString();
    const normalizedPoints = (Array.isArray(points) ? points : [])
      .map((point, index) => ({ ...point, isDefault: Boolean(point?.isDefault) || index === 0 }))
      .filter((point) => String(point?.label || '').trim() && Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude)));

    const { data: existing, error: existingError } = await supabase
      .from('isp_entry_points')
      .select('id')
      .eq('isp_id', ispId)
      .is('deleted_at', null);

    if (existingError) throw existingError;

    const keptIds = normalizedPoints.map((point) => Number(point.id)).filter(Number.isFinite);
    const deletedIds = (existing || []).map((point) => Number(point.id)).filter((id) => !keptIds.includes(id));

    if (deletedIds.length > 0) {
      const { user } = await getCurrentActor();
      const { error: deleteError } = await supabase
        .from('isp_entry_points')
        .update({ deleted_at: now, deleted_by: user?.id ?? null, updated_at: now })
        .in('id', deletedIds);

      if (deleteError) throw deleteError;
    }

    const savedPoints = [];
    for (const point of normalizedPoints) {
      const payload = withUpdatedAt(mapIspEntryPointPayload(point, ispId));
      if (point.id && Number.isFinite(Number(point.id))) {
        const { data, error } = await supabase
          .from('isp_entry_points')
          .update(payload)
          .eq('id', point.id)
          .select()
          .single();
        if (error) throw error;
        savedPoints.push(mapIspEntryPoint(data));
      } else {
        const { data, error } = await supabase
          .from('isp_entry_points')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        savedPoints.push(mapIspEntryPoint(data));
      }
    }

    return savedPoints;
  },
};

export const customerIspEntryPointsApi = {
  async replaceForCustomer(customerId, selections = []) {
    const now = new Date().toISOString();
    const normalizedSelections = (Array.isArray(selections) ? selections : [])
      .filter((selection) => Number.isFinite(Number(selection?.ispEntryPointId ?? selection?.isp_entry_point_id)))
      .map((selection, index) => ({
        ...selection,
        priority: Number(selection.priority || index + 1),
        role: selection.role || (index === 0 ? 'utama' : 'backup'),
      }));

    const { data: existing, error: existingError } = await supabase
      .from('customer_isp_entry_points')
      .select('id')
      .eq('customer_id', customerId)
      .is('deleted_at', null);

    if (existingError) throw existingError;

    const keptIds = normalizedSelections.map((selection) => Number(selection.id)).filter(Number.isFinite);
    const deletedIds = (existing || []).map((selection) => Number(selection.id)).filter((id) => !keptIds.includes(id));

    if (deletedIds.length > 0) {
      const { user } = await getCurrentActor();
      const { error: deleteError } = await supabase
        .from('customer_isp_entry_points')
        .update({ deleted_at: now, deleted_by: user?.id ?? null, updated_at: now })
        .in('id', deletedIds);

      if (deleteError) throw deleteError;
    }

    const savedSelections = [];
    for (const selection of normalizedSelections) {
      const payload = withUpdatedAt(mapCustomerIspEntryPointPayload(selection, customerId));
      if (selection.id && Number.isFinite(Number(selection.id))) {
        const { data, error } = await supabase
          .from('customer_isp_entry_points')
          .update(payload)
          .eq('id', selection.id)
          .select()
          .single();
        if (error) throw error;
        savedSelections.push(mapCustomerIspEntryPoint(data));
      } else {
        const { data, error } = await supabase
          .from('customer_isp_entry_points')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        savedSelections.push(mapCustomerIspEntryPoint(data));
      }
    }

    return savedSelections;
  },
};

export const customerIspMembershipsApi = {
  async removeByCustomer(customerId, { mode = 'selected', ispId = null, ispIds = [] } = {}) {
    let query = supabase
      .from('customer_isp_memberships')
      .delete()
      .eq('customer_id', customerId);

    if (mode === 'this' && ispId) {
      query = query.eq('isp_id', ispId);
    } else if (mode === 'selected') {
      query = query.in('isp_id', ispIds);
    }

    const { error } = await query;
    if (error) throw error;
  },
};

// ============================================================================
// ISP CONTRACT ROWS API
// ============================================================================

export const ispContractRowsApi = {
  async create(rowData) {
    const { data, error } = await supabase
      .from('isp_contract_rows')
      .insert(withUpdatedAt(mapIspContractRowPayload(rowData)))
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },

  async update(id, rowData) {
    const { data, error } = await supabase
      .from('isp_contract_rows')
      .update(withUpdatedAt(mapIspContractRowPayload(rowData)))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },
};

// ============================================================================
// INVOICE FOLLOW UPS API
// ============================================================================

export const invoiceFollowUpsApi = {
  async create(followUpData) {
    const { data, error } = await supabase
      .from('invoice_follow_ups')
      .insert(withUpdatedAt(mapInvoiceFollowUpPayload(followUpData)))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id, followUpData) {
    const { data, error } = await supabase
      .from('invoice_follow_ups')
      .update(withUpdatedAt(mapInvoiceFollowUpPayload(followUpData)))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

// ============================================================================
// CONTRACT VERSION RENEWAL FOLLOW UPS API
// ============================================================================

export const contractVersionRenewalFollowUpsApi = {
  async create(versionId) {
    const { data: existingFollowUps, error: existingFollowUpsError } = await supabase
      .from('contract_version_renewal_follow_ups')
      .select('split_order')
      .eq('version_id', versionId)
      .order('split_order', { ascending: true });

    if (existingFollowUpsError) throw existingFollowUpsError;

    const nextSplitOrder = (
      (Array.isArray(existingFollowUps)
        ? existingFollowUps.reduce(
          (maxSplitOrder, followUp) => Math.max(maxSplitOrder, Number(followUp?.split_order ?? 0)),
          0,
        )
        : 0)
      + 1
    );

    const { data, error } = await supabase
      .from('contract_version_renewal_follow_ups')
      .insert(withUpdatedAt({
        version_id: versionId,
        split_order: nextSplitOrder,
        source: 'manual',
        title: 'Surat perpanjangan dikirim',
        description: 'Berkas perpanjangan tenant sudah diunggah dari detail lokasi.',
        status: 'pending_response',
      }))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('contract_version_renewal_follow_ups').delete().eq('id', id);
    if (error) throw error;
  },

  async update(id, followUpData) {
    const { data, error } = await supabase
      .from('contract_version_renewal_follow_ups')
      .update(withUpdatedAt(mapRenewalFollowUpPayload(followUpData)))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const decision = followUpData.response_status ?? followUpData.responseStatus ?? followUpData.response_decision ?? followUpData.responseDecision;
    const isCompleted = followUpData.status === 'completed';

    if (isCompleted && decision === 'lanjut') {
      const versionId = data.version_id;

      // 1. Dapatkan detail versi kontrak lama
      const { data: currentVersion, error: verErr } = await supabase
        .from('contract_versions')
        .select('*')
        .eq('id', versionId)
        .single();
      if (verErr) throw verErr;

      const { data: existingDraftVersions, error: existingDraftErr } = await supabase
        .from('contract_versions')
        .select('id')
        .eq('contract_id', currentVersion.contract_id)
        .gt('version_number', Number(currentVersion.version_number ?? 0))
        .is('deleted_at', null)
        .order('version_number', { ascending: false })
        .limit(1);
      if (existingDraftErr) throw existingDraftErr;

      const existingDraftVersion = existingDraftVersions?.[0] ?? null;

      // Hitung version_number berikutnya jika belum ada draft perpanjangan.
      const { data: latestVersions, error: latestVerErr } = await supabase
        .from('contract_versions')
        .select('version_number')
        .eq('contract_id', currentVersion.contract_id)
        .order('version_number', { ascending: false })
        .limit(1);
      if (latestVerErr) throw latestVerErr;

      const nextVersionNumber = Number(latestVersions?.[0]?.version_number ?? 1) + 1;

      // Evaluasi apakah ada override paket kontrak dari frontend
      const packageOverrides = followUpData.packageOverrides ?? followUpData.package_overrides ?? null;
      const coreType = packageOverrides
        ? (packageOverrides.coreType ?? packageOverrides.core_type ?? 'core')
        : currentVersion.core_type;
      const normalizedCoreType = coreType === 'sharing_core' ? 'sharing_core' : 'core';
      const coreTotal = normalizedCoreType === 'core'
        ? Math.max(1, Number(packageOverrides
          ? (packageOverrides.coreTotal ?? packageOverrides.core_total ?? currentVersion.core_total ?? 0)
          : (currentVersion.core_total ?? 0)))
        : 0;
      const sharedCoreRatio = normalizedCoreType === 'sharing_core'
        ? (packageOverrides
          ? (packageOverrides.sharedCoreRatio ?? packageOverrides.shared_core_ratio ?? currentVersion.shared_core_ratio ?? null)
          : (currentVersion.shared_core_ratio ?? null))
        : null;
      const monthlyAmount = packageOverrides
        ? Number(packageOverrides.monthlyAmount ?? packageOverrides.monthly_amount ?? 0)
        : currentVersion.monthly_amount;
      const yearlyAmount = packageOverrides
        ? Number(packageOverrides.yearlyAmount ?? packageOverrides.yearly_amount ?? (monthlyAmount * 12))
        : currentVersion.yearly_amount;

      const userStartDate = followUpData.startDate ?? followUpData.start_date ?? null;
      const userEndDate = followUpData.endDate ?? followUpData.end_date ?? null;

      const nextPeriod = {
        startDate: userStartDate ?? inferNextContractPeriod(currentVersion.start_date, currentVersion.end_date).startDate,
        endDate: userEndDate ?? inferNextContractPeriod(currentVersion.start_date, currentVersion.end_date).endDate,
      };

      if (!nextPeriod.startDate || !nextPeriod.endDate) {
        throw new Error('Periode kontrak berjalan tidak valid untuk membuat perpanjangan otomatis.');
      }

      // 3. Buat versi kontrak baru dengan periode default agar schema non-null tetap valid.
      if (!existingDraftVersion) {
        const { data: newVersion, error: newVerErr } = await supabase
          .from('contract_versions')
          .insert(withUpdatedAt({
            contract_id: currentVersion.contract_id,
            customer_id: currentVersion.customer_id,
            contract_number: null,
            version_number: nextVersionNumber,
            start_date: nextPeriod.startDate,
            end_date: nextPeriod.endDate,
            core_type: normalizedCoreType,
            core_total: coreTotal,
            shared_core_ratio: sharedCoreRatio,
            monthly_amount: monthlyAmount,
            yearly_amount: yearlyAmount,
            remarks: 'Perpanjangan otomatis dari tanggapan tenant. Lengkapi nomor kontrak/BAK jika sudah tersedia.'
          }))
          .select()
          .single();
        if (newVerErr) throw newVerErr;

        const { data: mainContract, error: mainContractError } = await supabase
          .from('contracts')
          .select('billing_every, billing_unit')
          .eq('id', currentVersion.contract_id)
          .single();
        if (mainContractError) throw mainContractError;

        const billingCycle = followUpData.billingCycle ?? followUpData.billing_cycle ?? {
          every: mainContract?.billing_every ?? 1,
          unit: mainContract?.billing_unit ?? 'bulan',
        };
        const newInvoiceRows = buildInvoiceScheduleRows(nextPeriod.startDate, nextPeriod.endDate, billingCycle);
        const invoiceAmount = resolveBillingCycleInvoiceAmount(monthlyAmount, billingCycle);

        if (newInvoiceRows.length > 0) {
          const newInvoicePayload = newInvoiceRows.map((row) => {
            const periodDate = new Date(`${row.periodStartDate}T00:00:00.000Z`);
            return {
              customer_id: currentVersion.customer_id,
              contract_id: currentVersion.contract_id,
              contract_version_id: newVersion.id,
              contract_number: null,
              period_start_date: row.periodStartDate,
              period_end_date: row.periodEndDate,
              period_year: periodDate.getUTCFullYear(),
              period_month: periodDate.getUTCMonth() + 1,
              due_date: resolveInvoiceDueDate(row.periodStartDate),
              amount: invoiceAmount,
              status: 'belum_ditagih',
              schedule_status: 'active',
              updated_at: new Date().toISOString(),
            };
          });
          const { error: invoiceInsertError } = await supabase
            .from('invoices')
            .insert(newInvoicePayload);
          if (invoiceInsertError) throw invoiceInsertError;
        }
      }
    }

    return data;
  },
};

// ============================================================================
// ISP RENEWAL FOLLOW UPS API
// ============================================================================

export const ispRenewalFollowUpsApi = {
  async create(rowId) {
    return this.createForContractRow(rowId);
  },

  async createForContractRow(rowId) {
    const { data: existingFollowUps, error: existingFollowUpsError } = await supabase
      .from('isp_renewal_follow_ups')
      .select('split_order')
      .eq('row_id', rowId)
      .order('split_order', { ascending: true });

    if (existingFollowUpsError) throw existingFollowUpsError;

    const nextSplitOrder = (
      (Array.isArray(existingFollowUps)
        ? existingFollowUps.reduce(
          (maxSplitOrder, followUp) => Math.max(maxSplitOrder, Number(followUp?.split_order ?? 0)),
          0,
        )
        : 0)
      + 1
    );

    const { data, error } = await supabase
      .from('isp_renewal_follow_ups')
      .insert(withUpdatedAt({
        row_id: rowId,
        split_order: nextSplitOrder,
        source: 'manual',
        title: 'Surat perpanjangan dikirim',
        description: 'Berkas perpanjangan ISP sudah diunggah dari detail ISP.',
        status: 'pending_response',
      }))
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('isp_renewal_follow_ups').delete().eq('id', id);
    if (error) throw error;
    clearNotificationListCache();
  },

  async update(id, followUpData) {
    const { data, error } = await supabase
      .from('isp_renewal_follow_ups')
      .update(withUpdatedAt(mapRenewalFollowUpPayload(followUpData)))
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    clearNotificationListCache();

    const decision = followUpData.response_status ?? followUpData.responseStatus ?? followUpData.response_decision ?? followUpData.responseDecision;
    const shouldPromote = followUpData.status === 'completed' && decision === 'lanjut';

    if (shouldPromote) {
      const { data: currentRow, error: currentRowErr } = await supabase
        .from('isp_contract_rows')
        .select('*')
        .eq('id', data.row_id)
        .single();
      if (currentRowErr) throw currentRowErr;

      const todayIso = new Date().toISOString().slice(0, 10);
      const currentRowStatus = resolveIspContractRowStatus(currentRow, todayIso);
      if (currentRowStatus === 'berhenti') {
        return data;
      }

      const currentEnd = String(currentRow.periodEnd ?? currentRow.period_end ?? '').slice(0, 10);
      if (!currentEnd) {
        return data;
      }

      const currentRowId = Number(currentRow.id);
      if (!Number.isFinite(currentRowId)) {
        return data;
      }

      const nextPeriodStart = String(new Date(`${currentEnd}T00:00:00.000Z`).toISOString().slice(0, 10));
      const nextPeriodStartDate = new Date(`${nextPeriodStart}T00:00:00.000Z`);
      nextPeriodStartDate.setDate(nextPeriodStartDate.getDate() + 1);
      const nextPeriodStartIso = nextPeriodStartDate.toISOString().slice(0, 10);

      const { data: rowExists, error: rowExistsError } = await supabase
        .from('isp_contract_rows')
        .select('id, period_start, period_end')
        .eq('isp_id', currentRow.isp_id)
        .eq('period_start', nextPeriodStartIso)
        .limit(1);

      if (rowExistsError) throw rowExistsError;

      if (Array.isArray(rowExists) && rowExists.length > 0) {
        return data;
      }

      const newRowPayload = buildNewIspContractRowFromRenewal(currentRow, data);
      const { error: insertRowErr } = await supabase
        .from('isp_contract_rows')
        .insert(withUpdatedAt(newRowPayload));
      if (insertRowErr) throw insertRowErr;
    }

    return data;
  },

  async submitResponse(id, followUpData) {
    const decision = followUpData.response_status ?? followUpData.responseStatus ?? followUpData.response_decision ?? followUpData.responseDecision;
    const { data, error } = await supabase.rpc('submit_isp_renewal_response', {
      p_follow_up_id: id,
      p_response_file_url: followUpData.response_file_url ?? followUpData.responseFileUrl ?? null,
      p_response_file_name: followUpData.response_file_name ?? followUpData.responseFileName ?? null,
      p_response_decision: decision,
    });

    if (error) throw error;
    clearNotificationListCache();
    return mapIspRenewalFollowUp(data);
  },
};

const resolveIspContractRowStatus = (row = {}, todayIso = new Date().toISOString().slice(0, 10)) => {
  const rawStatus = String(row.status ?? row.renewalStatus ?? row.renewal_status ?? '').trim().toLowerCase();
  if (['berhenti', 'nonaktif'].includes(rawStatus)) return 'berhenti';
  if (rawStatus === 'expired' || rawStatus === 'belum_diperpanjang') return 'expired';
  if (['aktif', 'active', 'beroperasi'].includes(rawStatus)) return 'beroperasi';
  const periodEnd = String(row.periodEnd ?? row.period_end ?? '').slice(0, 10);
  return periodEnd && periodEnd < todayIso ? 'expired' : 'beroperasi';
};

const buildNewIspContractRowFromRenewal = (currentRow, followUpData = {}) => {
  const currentEnd = String(currentRow.periodEnd ?? currentRow.period_end ?? '').slice(0, 10);
  const startBase = currentEnd ? new Date(`${currentEnd}T00:00:00.000Z`) : new Date();
  startBase.setDate(startBase.getDate() + 1);
  const newStartDate = startBase.toISOString().slice(0, 10);
  const newEndDate = new Date(startBase);
  newEndDate.setFullYear(newEndDate.getFullYear() + 1);
  newEndDate.setDate(newEndDate.getDate() - 1);

  return {
    isp_id: currentRow.ispId ?? currentRow.isp_id,
    contract_reference: currentRow.contractReference ?? currentRow.contract_reference ?? null,
    period_start: newStartDate,
    period_end: newEndDate.toISOString().slice(0, 10),
    renewal_status: 'active',
    status: 'beroperasi',
    bak_file_url: currentRow.bakFileUrl ?? currentRow.bak_file_url ?? null,
    bak_file_name: currentRow.bakFileName ?? currentRow.bak_file_name ?? null,
    contract_file_url: currentRow.contractFileUrl ?? currentRow.contract_file_url ?? null,
    contract_file_name: currentRow.contractFileName ?? currentRow.contract_file_name ?? null,
    response_file_url: followUpData.response_file_url ?? followUpData.responseFileUrl ?? null,
    response_file_name: followUpData.response_file_name ?? followUpData.responseFileName ?? null,
  };
};

const TRASH_TABLES = [
  'isps',
  'customers',
  'contracts',
  'contract_versions',
  'invoices',
  'documents',
  'customer_route_versions',
];

const normalizeTrashTables = (tables) => {
  if (!Array.isArray(tables) || tables.length === 0) return TRASH_TABLES;
  const selected = tables.filter((table) => TRASH_TABLES.includes(table));
  return selected.length > 0 ? selected : TRASH_TABLES;
};

const assertTrashTable = (table) => {
  if (!TRASH_TABLES.includes(table)) {
    throw new Error('Tabel tempat sampah tidak valid.');
  }
};

const restoreTrashRows = async (table, applyFilters) => {
  const { error } = await applyFilters(
    supabase
      .from(table)
      .update({ deleted_at: null, deleted_by: null })
  );
  if (error) throw error;
};

const deleteRows = async (table, applyFilters) => {
  const { error } = await applyFilters(supabase.from(table).delete());
  if (error) throw error;
};

const restoreTrashDependencies = async ({ table, item }) => {
  const deletedAt = item?.deleted_at;
  if (!deletedAt) return;

  if (table === 'isps') {
    const { data: memberships, error } = await supabase
      .from('customer_isp_memberships')
      .select('customer_id')
      .eq('isp_id', item.id);
    if (error) throw error;

    const customerIds = (memberships || []).map((membership) => Number(membership.customer_id)).filter(Number.isFinite);
    if (customerIds.length > 0) {
      await restoreTrashRows('customers', (query) => query.in('id', customerIds).eq('deleted_at', deletedAt));
    }
    return;
  }

  if (table === 'contracts') {
    await restoreTrashRows('contract_versions', (query) => query.eq('contract_id', item.id).eq('deleted_at', deletedAt));
    await restoreTrashRows('documents', (query) => query.eq('contract_id', item.id).eq('deleted_at', deletedAt));
    return;
  }

  if (table === 'contract_versions') {
    await restoreTrashRows('documents', (query) => query.eq('contract_version_id', item.id).eq('deleted_at', deletedAt));
    return;
  }

  if (table === 'customer_route_versions') {
    await restoreTrashRows('customer_route_points', (query) => query.eq('route_version_id', item.id).eq('deleted_at', deletedAt));
  }
};

const deleteCustomerTrashGroup = async (customerIds = []) => {
  const ids = Array.from(new Set(customerIds.map((id) => Number(id)).filter(Number.isFinite)));
  if (ids.length === 0) return;

  const { data: routeVersions, error: routeVersionsError } = await supabase
    .from('customer_route_versions')
    .select('id')
    .in('customer_id', ids);
  if (routeVersionsError) throw routeVersionsError;

  const routeVersionIds = (routeVersions || []).map((route) => Number(route.id)).filter(Number.isFinite);
  if (routeVersionIds.length > 0) {
    await deleteRows('customer_route_points', (query) => query.in('route_version_id', routeVersionIds));
  }

  await deleteRows('documents', (query) => query.in('customer_id', ids));
  await deleteRows('invoices', (query) => query.in('customer_id', ids));
  await deleteRows('contract_versions', (query) => query.in('customer_id', ids));
  await deleteRows('contracts', (query) => query.in('customer_id', ids));
  await deleteRows('customer_route_versions', (query) => query.in('customer_id', ids));
  await deleteRows('customer_isp_entry_points', (query) => query.in('customer_id', ids));
  await deleteRows('customer_isp_memberships', (query) => query.in('customer_id', ids));
  await deleteRows('customers', (query) => query.in('id', ids));
};

const deleteTrashDependencies = async ({ table, item }) => {
  if (table === 'isps') {
    const { data: memberships, error } = await supabase
      .from('customer_isp_memberships')
      .select('customer_id')
      .eq('isp_id', item.id);
    if (error) throw error;

    const membershipCustomerIds = (memberships || []).map((membership) => Number(membership.customer_id)).filter(Number.isFinite);
    let customerIds = membershipCustomerIds;
    if (membershipCustomerIds.length > 0 && item.deleted_at) {
      const { data: deletedCustomers, error: customersError } = await supabase
        .from('customers')
        .select('id')
        .in('id', membershipCustomerIds)
        .eq('deleted_at', item.deleted_at);
      if (customersError) throw customersError;
      customerIds = (deletedCustomers || []).map((customer) => Number(customer.id)).filter(Number.isFinite);
    }
    await deleteCustomerTrashGroup(customerIds);
    await deleteRows('isp_entry_points', (query) => query.eq('isp_id', item.id));
    await deleteRows('isp_contract_rows', (query) => query.eq('isp_id', item.id));
    return;
  }

  if (table === 'customers') {
    await deleteCustomerTrashGroup([item.id]);
    return;
  }

  if (table === 'contracts') {
    await deleteRows('documents', (query) => query.eq('contract_id', item.id).not('deleted_at', 'is', null));
    await deleteRows('invoices', (query) => query.eq('contract_id', item.id).not('deleted_at', 'is', null));
    await deleteRows('contract_versions', (query) => query.eq('contract_id', item.id).not('deleted_at', 'is', null));
    return;
  }

  if (table === 'contract_versions') {
    await deleteRows('documents', (query) => query.eq('contract_version_id', item.id).not('deleted_at', 'is', null));
    await deleteRows('invoices', (query) => query.eq('contract_version_id', item.id).not('deleted_at', 'is', null));
    return;
  }

  if (table === 'documents') {
    await deleteRows('invoices', (query) => query.eq('document_id', item.id).not('deleted_at', 'is', null));
    return;
  }

  if (table === 'customer_route_versions') {
    await deleteRows('customer_route_points', (query) => query.eq('route_version_id', item.id));
  }
};

// ============================================================================
// TRASH API (Soft Delete Management)
// ============================================================================

export const trashApi = {
  // Get all soft-deleted items
  async list({ tables } = {}) {
    const selectedTables = normalizeTrashTables(tables);
    const emptyResult = { data: [], error: null };
    const shouldLoad = (table) => selectedTables.includes(table);
    const [isps, customers, contracts, contractVersions, invoices, documents, routes] = await Promise.all([
      shouldLoad('isps') ? supabase
        .from('isps')
        .select('id, name, status, created_at, deleted_at, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }) : emptyResult,
      
      shouldLoad('customers') ? supabase
        .from('customers')
        .select('id, name, customer_code, isp_name, status, created_at, deleted_at, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }) : emptyResult,
      
      shouldLoad('contracts') ? supabase
        .from('contracts')
        .select('id, contract_number, customer_id, start_date, end_date, created_at, deleted_at, deleted_by, customers(name)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }) : emptyResult,

      shouldLoad('contract_versions') ? supabase
        .from('contract_versions')
        .select('id, contract_id, customer_id, version_number, start_date, end_date, remarks, created_at, deleted_at, deleted_by, customers(name), contracts(contract_number)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }) : emptyResult,
      
      shouldLoad('invoices') ? supabase
        .from('invoices')
        .select('id, invoice_number, customer_id, period_year, period_month, amount, created_at, deleted_at, deleted_by, customers(name)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }) : emptyResult,
      
      shouldLoad('documents') ? supabase
        .from('documents')
        .select('id, nomor_dokumen, jenis_dokumen, customer_id, file_url, created_at, deleted_at, deleted_by, customers(name)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }) : emptyResult,
      
      shouldLoad('customer_route_versions') ? supabase
        .from('customer_route_versions')
        .select('id, customer_id, version_number, flow_status, change_note, created_at, deleted_at, deleted_by, customers(name)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }) : emptyResult,
    ]);

    const queryErrors = [isps, customers, contracts, contractVersions, invoices, documents, routes]
      .map((result) => result.error)
      .filter(Boolean);
    if (queryErrors.length > 0) {
      throw queryErrors[0];
    }

    return {
      isps: isps.data || [],
      customers: customers.data || [],
      contracts: contracts.data || [],
      contractVersions: contractVersions.data || [],
      invoices: invoices.data || [],
      documents: documents.data || [],
      routes: routes.data || [],
    };
  },

  // Restore item (set deleted_at to null)
  async restore(table, id) {
    assertTrashTable(table);
    const config = ACTIVITY_ENTITY_CONFIG[table];
    let previousItem = null;

    if (config) {
      const { data, error: previousError } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single();

      if (previousError) throw previousError;
      previousItem = data;
    }

    await restoreTrashDependencies({ table, item: previousItem });

    const { error } = await supabase
      .from(table)
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', id);

    if (error) throw error;

    if (config) {
      const entityName = getEntityDisplayName(previousItem, `${config.entityType} ${id}`);
      await createActivityLog({
        action: `${config.entityType}.restored`,
        entity_type: config.entityType,
        entity_id: id,
        entity_name: entityName,
        description: `Memulihkan ${entityName} dari Trash`,
        metadata: {
          table,
          before: previousItem,
        },
      });
    }

    if (table === 'isps') {
      clearIspListCache();
    }
  },

  // Permanent delete (hard delete from database)
  async deletePermanently(table, id) {
    assertTrashTable(table);
    const { data: item, error: itemError } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .single();

    if (itemError) throw itemError;
    await deleteTrashDependencies({ table, item });

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    if (table === 'isps') {
      clearIspListCache();
    }
  },

  // Empty trash (delete all soft-deleted items permanently)
  async emptyTrash({ tables } = {}) {
    const selectedTables = normalizeTrashTables(tables);
    const deleteOrder = [
      'customer_route_points',
      'documents',
      'invoices',
      'contract_versions',
      'contracts',
      'customer_route_versions',
      'customers',
      'isp_entry_points',
      'isps',
    ];

    for (const table of deleteOrder) {
      if (TRASH_TABLES.includes(table) && !selectedTables.includes(table)) continue;
      const { error } = await supabase
        .from(table)
        .delete()
        .not('deleted_at', 'is', null);
      if (error) throw error;
    }

    clearIspListCache();
    return { success: true };
  },

  // Get trash statistics
  async getStats({ tables } = {}) {
    const selectedTables = normalizeTrashTables(tables);
    const emptyCount = { count: 0, error: null };
    const shouldLoad = (table) => selectedTables.includes(table);
    const [isps, customers, contracts, contractVersions, invoices, documents, routes] = await Promise.all([
      shouldLoad('isps') ? supabase.from('isps').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null) : emptyCount,
      shouldLoad('customers') ? supabase.from('customers').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null) : emptyCount,
      shouldLoad('contracts') ? supabase.from('contracts').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null) : emptyCount,
      shouldLoad('contract_versions') ? supabase.from('contract_versions').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null) : emptyCount,
      shouldLoad('invoices') ? supabase.from('invoices').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null) : emptyCount,
      shouldLoad('documents') ? supabase.from('documents').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null) : emptyCount,
      shouldLoad('customer_route_versions') ? supabase.from('customer_route_versions').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null) : emptyCount,
    ]);

    const countErrors = [isps, customers, contracts, contractVersions, invoices, documents, routes]
      .map((result) => result.error)
      .filter(Boolean);
    if (countErrors.length > 0) {
      throw countErrors[0];
    }

    const lastDeletedResults = await Promise.all(selectedTables.map((table) => supabase
      .from(table)
      .select('deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: true })
      .limit(1)
      .maybeSingle()));
    const lastDeletedAt = lastDeletedResults
      .map((result) => result.data?.deleted_at)
      .filter(Boolean)
      .sort()[0];
    const lastDeletedError = lastDeletedResults.map((result) => result.error).find(Boolean);
    if (lastDeletedError) throw lastDeletedError;

    return {
      lastClearedAt: lastDeletedAt || null,
      totalItems: (isps.count || 0) + (customers.count || 0) + (contracts.count || 0) + (contractVersions.count || 0) +
                  (invoices.count || 0) + (documents.count || 0) + (routes.count || 0),
      breakdown: {
        ISP: isps.count || 0,
        Lokasi: customers.count || 0,
        Kontrak: contracts.count || 0,
        "Versi Kontrak": contractVersions.count || 0,
        Invoice: invoices.count || 0,
        Dokumen: documents.count || 0,
        Jalur: routes.count || 0,
      }
    };
  },
};

// Export all APIs
export default {
  session: sessionApi,
  customers: customersApi,
  isps: ispsApi,
  monitoring: monitoringApi,
  documents: documentsApi,
  invoices: invoicesApi,
  paymentRealizations: paymentRealizationsApi,
  contracts: contractsApi,
  contractVersions: contractVersionsApi,
  customerRoutes: customerRoutesApi,
  customerIspMemberships: customerIspMembershipsApi,
  ispEntryPoints: ispEntryPointsApi,
  customerIspEntryPoints: customerIspEntryPointsApi,
  invoiceFollowUps: invoiceFollowUpsApi,
  contractVersionRenewalFollowUps: contractVersionRenewalFollowUpsApi,
  trash: trashApi,
  notifications: notificationsApi,
  activityLogs: activityLogsApi,
  ispContractRows: ispContractRowsApi,
  ispRenewalFollowUps: ispRenewalFollowUpsApi,
};
