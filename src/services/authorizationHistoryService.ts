import { supabase } from '../lib/supabase';
import { AuthorizationHistory } from '../types';

export class AuthorizationHistoryService {
  
  /**
   * Create a new authorization request
   */
  static async createAuthorizationRequest(data: {
    token: string;
    collector_id: string;
    collector_name: string;
    client_name: string;
    client_document: string;
    expires_at: string;
    notes?: string;
  }): Promise<AuthorizationHistory> {
    const { data: result, error } = await supabase
      .from('authorization_history')
      .insert({
        token: data.token,
        collector_id: data.collector_id,
        collector_name: data.collector_name,
        client_name: data.client_name,
        client_document: data.client_document,
        requested_at: new Date().toISOString(),
        expires_at: data.expires_at,
        status: 'pending',
        notes: data.notes
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create authorization request: ${error.message}`);
    }

    return result;
  }

  /**
   * Get all pending authorization requests
   */
  static async getPendingRequests(): Promise<AuthorizationHistory[]> {
    const { data, error } = await supabase
      .from('authorization_history')
      .select('*')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('requested_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get pending requests: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get recently processed requests (approved/rejected in last 24 hours)
   */
  static async getRecentlyProcessedRequests(): Promise<AuthorizationHistory[]> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data, error } = await supabase
      .from('authorization_history')
      .select('*')
      .in('status', ['approved', 'rejected'])
      .gte('processed_at', oneDayAgo.toISOString())
      .order('processed_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get recently processed requests: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Get expired requests
   */
  static async getExpiredRequests(): Promise<AuthorizationHistory[]> {
    const { data, error } = await supabase
      .from('authorization_history')
      .select('*')
      .or(`status.eq.expired,expires_at.lt.${new Date().toISOString()}`)
      .order('requested_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get expired requests: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Approve an authorization request
   */
  static async approveRequest(
    token: string, 
    processed_by_id: string, 
    processed_by_name: string
  ): Promise<AuthorizationHistory> {
    const { data: result, error } = await supabase
      .from('authorization_history')
      .update({
        status: 'approved',
        processed_at: new Date().toISOString(),
        processed_by_id,
        processed_by_name
      })
      .eq('token', token)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to approve request: ${error.message}`);
    }

    return result;
  }

  /**
   * Reject an authorization request
   */
  static async rejectRequest(
    token: string, 
    processed_by_id: string, 
    processed_by_name: string,
    notes?: string
  ): Promise<AuthorizationHistory> {
    const { data: result, error } = await supabase
      .from('authorization_history')
      .update({
        status: 'rejected',
        processed_at: new Date().toISOString(),
        processed_by_id,
        processed_by_name,
        notes: notes || undefined
      })
      .eq('token', token)
      .eq('status', 'pending')
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to reject request: ${error.message}`);
    }

    return result;
  }

  /**
   * Mark expired requests as expired
   */
  static async markExpiredRequests(): Promise<void> {
    const { error } = await supabase
      .from('authorization_history')
      .update({
        status: 'expired',
        processed_at: new Date().toISOString(),
        processed_by_name: 'Sistema'
      })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    if (error) {
      throw new Error(`Failed to mark expired requests: ${error.message}`);
    }
  }

  /**
   * Get authorization history with filtering and pagination
   */
  static async getAuthorizationHistory(filters: {
    status?: 'approved' | 'rejected' | 'expired' | 'all';
    searchTerm?: string;
    dateFilter?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: AuthorizationHistory[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { status = 'all', searchTerm, dateFilter, page = 1, limit = 10 } = filters;

    let query = supabase
      .from('authorization_history')
      .select('*', { count: 'exact' });

    // Filter by status
    if (status !== 'all') {
      if (status === 'expired') {
        query = query.or(`status.eq.expired,expires_at.lt.${new Date().toISOString()}`);
      } else {
        query = query.eq('status', status);
      }
    }

    // Filter by search term
    if (searchTerm) {
      query = query.or(`collector_name.ilike.%${searchTerm}%,client_name.ilike.%${searchTerm}%,client_document.ilike.%${searchTerm}%,token.ilike.%${searchTerm}%`);
    }

    // Filter by date
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      const startOfDay = new Date(filterDate.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(filterDate.setHours(23, 59, 59, 999)).toISOString();
      query = query.gte('requested_at', startOfDay).lte('requested_at', endOfDay);
    }

    // Pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .order('requested_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to get authorization history: ${error.message}`);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      data: data || [],
      total,
      page,
      totalPages
    };
  }

  /**
   * Get authorization statistics
   */
  static async getAuthorizationStats(): Promise<{
    total: number;
    approved: number;
    rejected: number;
    expired: number;
    approvalRate: number;
  }> {
    const { data, error } = await supabase
      .from('authorization_history')
      .select('status');

    if (error) {
      throw new Error(`Failed to get authorization stats: ${error.message}`);
    }

    const total = data?.length || 0;
    const approved = data?.filter(item => item.status === 'approved').length || 0;
    const rejected = data?.filter(item => item.status === 'rejected').length || 0;
    const expired = data?.filter(item => item.status === 'expired' || new Date(item.expires_at) < new Date()).length || 0;
    const approvalRate = total > 0 ? (approved / total) * 100 : 0;

    return {
      total,
      approved,
      rejected,
      expired,
      approvalRate
    };
  }

  /**
   * Get authorization request by token
   */
  static async getAuthorizationByToken(token: string): Promise<AuthorizationHistory | null> {
    const { data, error } = await supabase
      .from('authorization_history')
      .select('*')
      .eq('token', token)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No rows returned
      }
      throw new Error(`Failed to get authorization by token: ${error.message}`);
    }

    return data;
  }

  /**
   * Check if token is valid and approved
   */
  static async validateToken(token: string): Promise<{
    isValid: boolean;
    authorization?: AuthorizationHistory;
    error?: string;
  }> {
    try {
      const authorization = await this.getAuthorizationByToken(token);
      
      if (!authorization) {
        return { isValid: false, error: 'Token não encontrado' };
      }

      if (authorization.status !== 'approved') {
        if (authorization.status === 'pending') {
          return { isValid: false, error: 'Token ainda não foi aprovado pelo gerente' };
        }
        if (authorization.status === 'rejected') {
          return { isValid: false, error: 'Token foi rejeitado pelo gerente' };
        }
        return { isValid: false, error: 'Token expirado' };
      }

      // Check if token is expired
      if (new Date(authorization.expires_at) < new Date()) {
        // Mark as expired in database
        await this.markExpiredRequests();
        return { isValid: false, error: 'Token expirado' };
      }

      return { isValid: true, authorization };
    } catch (error) {
      return { isValid: false, error: 'Erro ao validar token' };
    }
  }

  /**
   * Export authorization history to CSV format
   */
  static async exportAuthorizationHistory(filters: {
    status?: 'approved' | 'rejected' | 'expired' | 'all';
    searchTerm?: string;
    dateFilter?: string;
  } = {}): Promise<string> {
    // Get all data without pagination for export
    const { data } = await this.getAuthorizationHistory({ ...filters, limit: 10000 });

    const csvHeader = 'Token,Cobrador,Cliente,Documento,Data Solicitação,Data Processamento,Status,Processado Por,Observações\n';
    
    const csvRows = data.map(item => {
      const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('pt-BR');
      };

      const statusMap = {
        approved: 'Aprovado',
        rejected: 'Rejeitado',
        expired: 'Expirado',
        pending: 'Pendente'
      };

      return [
        item.token,
        item.collector_name,
        item.client_name,
        item.client_document,
        formatDate(item.requested_at),
        item.processed_at ? formatDate(item.processed_at) : '-',
        statusMap[item.status],
        item.processed_by_name || '-',
        item.notes || '-'
      ].map(field => `"${field}"`).join(',');
    });

    return csvHeader + csvRows.join('\n');
  }
}