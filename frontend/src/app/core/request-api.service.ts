import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminRequestDetail,
  AdminRequestList,
  AdminRequestUpdate,
  CustomerEmailSend,
  PublicRequestCreate,
  PublicRequestCreated,
  RequestStatus,
} from './request.models';
import { RUNTIME_CONFIG } from './runtime-config';

export type AdminRequestSortField =
  | 'created_at'
  | 'updated_at'
  | 'request_number'
  | 'customer_name'
  | 'status'
  | 'quoted_amount';

export interface AdminRequestListQuery {
  readonly status?: RequestStatus;
  readonly search?: string;
  readonly favorite?: boolean;
  readonly sort_by?: AdminRequestSortField;
  readonly sort_dir?: 'asc' | 'desc';
  readonly limit?: number;
  readonly offset?: number;
}

export interface AdminRequestFavoriteState {
  readonly request_id: number;
  readonly favorite: boolean;
}

@Injectable({ providedIn: 'root' })
export class RequestApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);
  private readonly baseUrl = `${this.config.apiUrl}/api/v1`;

  createRequest(payload: PublicRequestCreate): Observable<PublicRequestCreated> {
    return this.http.post<PublicRequestCreated>(`${this.baseUrl}/requests`, payload);
  }

  listRequests(query: AdminRequestListQuery = {}): Observable<AdminRequestList> {
    let params = new HttpParams()
      .set('limit', Math.min(Math.max(query.limit ?? 25, 1), 100))
      .set('offset', Math.max(query.offset ?? 0, 0));
    if (query.status) {
      params = params.set('status', query.status);
    }
    const search = query.search?.trim();
    if (search && search.length >= 2) {
      params = params.set('search', search);
    }
    if (query.favorite !== undefined) {
      params = params.set('favorite', query.favorite);
    }
    if (query.sort_by) {
      params = params.set('sort_by', query.sort_by);
    }
    if (query.sort_dir) {
      params = params.set('sort_dir', query.sort_dir);
    }
    return this.http.get<AdminRequestList>(`${this.baseUrl}/admin/requests`, {
      params,
    });
  }

  getRequest(id: number): Observable<AdminRequestDetail> {
    return this.http.get<AdminRequestDetail>(`${this.baseUrl}/admin/requests/${id}`);
  }

  updateRequest(id: number, payload: AdminRequestUpdate): Observable<AdminRequestDetail> {
    return this.http.patch<AdminRequestDetail>(`${this.baseUrl}/admin/requests/${id}`, payload);
  }

  setFavorite(id: number, favorite: boolean): Observable<AdminRequestFavoriteState> {
    const url = `${this.baseUrl}/admin/requests/${id}/favorite`;
    return favorite
      ? this.http.put<AdminRequestFavoriteState>(url, null)
      : this.http.delete<AdminRequestFavoriteState>(url);
  }

  sendCustomerEmail(
    id: number,
    payload: CustomerEmailSend,
  ): Observable<{ readonly status: 'sent'; readonly sent_at: string }> {
    return this.http.post<{ readonly status: 'sent'; readonly sent_at: string }>(
      `${this.baseUrl}/admin/requests/${id}/send-email`,
      payload,
    );
  }
}
